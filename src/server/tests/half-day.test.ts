import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app';
import {
  Users,
  Attendances,
  Entries,
  Requests,
  Holidays,
  Logs,
  Settings,
  InitialSchema1760000000000,
  seed,
} from '../db';
const base = { path: ':memory:', demo: true, now: '2026-03-12T09:00:00+09:00' };
test('two half days deduct exactly one annual day and share the full-day balance', async () => {
  const a = await createApp(base);
  try {
    const h = request(a.app.getHttpServer()),
      token = (await h.post('/api/auth/login').send({ login: 'kim', password: 'demo1234' })).body
        .token;
    const send = (kind: string, date: string) =>
      h.post('/api/requests').auth(token, { type: 'bearer' }).send({ kind, date, reason: '휴가' });
    await send('HALF_AM', '2026-03-13').expect(201);
    await send('HALF_PM', '2026-03-16').expect(201);
    let b = (await h.get('/api/balances').auth(token, { type: 'bearer' })).body;
    assert.equal(b.annual, 1);
    assert.equal(b.reservedDays, 1);
    assert.equal(b.off, undefined);
    await send('ANNUAL', '2026-03-17').expect(201);
    await send('HALF_AM', '2026-03-18').expect(409);
    await send('OFF', '2026-03-19').expect(400);
    b = (await h.get('/api/balances').auth(token, { type: 'bearer' })).body;
    assert.equal(b.annual, 0);
    assert.equal(await a.db.manager.count(Requests), 3);
  } finally {
    await a.close();
  }
});
test('morning half-day starts after lunch; exact 12:30 is on time and four hours is normal', async () => {
  const a = await createApp(base);
  try {
    const h = request(a.app.getHttpServer()),
      token = (await h.post('/api/auth/login').send({ login: 'kim', password: 'demo1234' })).body
        .token;
    const post = (path: string, body = {}) =>
      h
        .post('/api/' + path)
        .auth(token, { type: 'bearer' })
        .send(body);
    const set = async (time: string) =>
      a.db.manager.update(
        Settings,
        { key: 'demoNow' },
        { value: new Date(`2026-03-13T${time}+09:00`).toISOString() },
      );
    await post('requests', { kind: 'HALF_AM', date: '2026-03-13', reason: '오전 휴가' }).expect(
      201,
    );
    await set('12:29:59');
    assert.equal((await post('attendance/check-in')).body.code, 'MORNING_LEAVE');
    await set('12:30:00');
    const check = await post('attendance/check-in').expect(201);
    assert.equal(check.body.late, false);
    await set('16:30:00');
    const out = await post('attendance/check-out').expect(201);
    assert.equal(out.body.workSeconds, 14400);
    assert.equal(out.body.early, false);
  } finally {
    await a.close();
  }
});
test('afternoon half-day ends at lunch; later checkout cannot count afternoon hours', async () => {
  const a = await createApp(base);
  try {
    const h = request(a.app.getHttpServer());
    const login = async (login: string) =>
      (await h.post('/api/auth/login').send({ login, password: 'demo1234' })).body.token;
    const kim = await login('kim'),
      yeon = await login('yeon');
    const post = (token: string, path: string, body = {}) =>
      h
        .post('/api/' + path)
        .auth(token, { type: 'bearer' })
        .send(body);
    for (const t of [kim, yeon])
      await post(t, 'requests', {
        kind: 'HALF_PM',
        date: '2026-03-13',
        reason: '오후 휴가',
      }).expect(201);
    const set = async (time: string) =>
      a.db.manager.update(
        Settings,
        { key: 'demoNow' },
        { value: new Date(`2026-03-13T${time}+09:00`).toISOString() },
      );
    await set('07:30:00');
    await post(kim, 'attendance/check-in').expect(201);
    await set('09:00:00');
    await post(yeon, 'attendance/check-in').expect(201);
    await set('11:29:59');
    await post(kim, 'attendance/check-out').expect(400);
    await set('11:30:00');
    const out = await post(kim, 'attendance/check-out').expect(201);
    assert.equal(out.body.workSeconds, 14400);
    assert.equal(out.body.early, false);
    await set('18:00:00');
    const later = await post(yeon, 'attendance/check-out').expect(201);
    assert.equal(later.body.workSeconds, 9000);
    assert.equal(later.body.early, true);
  } finally {
    await a.close();
  }
});
test('morning half-day lateness uses 12:30, including manual checkout', async () => {
  const a = await createApp(base);
  try {
    const h = request(a.app.getHttpServer()),
      token = (await h.post('/api/auth/login').send({ login: 'kim', password: 'demo1234' })).body
        .token;
    const post = (path: string, body = {}) =>
      h
        .post('/api/' + path)
        .auth(token, { type: 'bearer' })
        .send(body);
    await post('requests', { kind: 'HALF_AM', date: '2026-03-13', reason: '오전 휴가' }).expect(
      201,
    );
    await a.db.manager.update(Settings, { key: 'demoNow' }, { value: '2026-03-13T03:30:00.001Z' });
    const row = await post('attendance/check-in').expect(201);
    assert.equal(row.body.late, true);
    await a.db.manager.update(Settings, { key: 'demoNow' }, { value: '2026-03-16T00:00:00Z' });
    const out = await post(`attendance/${row.body.id}/correct`, {
      checkOut: '2026-03-13T16:30:00.001+09:00',
    }).expect(201);
    assert.equal(out.body.manual, true);
    assert.equal(out.body.workSeconds, 14400);
  } finally {
    await a.close();
  }
});
test('holiday credit shares annual pool, expires, and is consumed before non-expiring grants', async () => {
  const a = await createApp(base);
  try {
    const h = request(a.app.getHttpServer()),
      token = (await h.post('/api/auth/login').send({ login: 'kim', password: 'demo1234' })).body
        .token;
    await a.db.manager.insert(Entries, {
      userId: 1,
      kind: 'HOLIDAY',
      amount: 1,
      sourceKey: 'test:holiday',
      grantedDate: '2026-03-01',
      expiresDate: '2026-03-31',
    });
    const post = (kind: string, date: string) =>
      h.post('/api/requests').auth(token, { type: 'bearer' }).send({ kind, date, reason: '휴가' });
    assert.equal((await h.get('/api/balances').auth(token, { type: 'bearer' })).body.annual, 2.5);
    const r = await post('ANNUAL', '2026-03-13').expect(201);
    const deductions = await a.db.manager.findBy(Entries, { requestId: r.body.id });
    assert.equal(deductions.length, 2);
    assert.equal(deductions.find((e) => e.kind === 'HOLIDAY')!.amount, -1);
    assert.equal(
      deductions.reduce((n, e) => n + e.amount, 0),
      -2,
    );
    const concurrent = await Promise.all([
      post('ANNUAL', '2026-03-16'),
      post('ANNUAL', '2026-03-17'),
    ]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await h.get('/api/balances').auth(token, { type: 'bearer' })).body.annual, 0.5);
  } finally {
    await a.close();
  }
});
test('legacy database migrates annual units, OFF requests and foreign keys without losing records', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hiconsy-migrate-')),
    file = join(dir, 'old.sqlite');
  const old = new DataSource({
    type: 'better-sqlite3',
    database: file,
    entities: [Users, Attendances, Requests, Entries, Holidays, Logs, Settings],
    migrations: [InitialSchema1760000000000],
    migrationsRun: true,
  });
  await old.initialize();
  await old.transaction(seed);
  await old.query(
    `INSERT INTO requests(id,userId,kind,date,reason,createdAt) VALUES(1,1,'ANNUAL','2026-03-09','old','2026-03-01T00:00:00Z'),(2,1,'OFF','2026-03-10','old','2026-03-01T00:00:00Z')`,
  );
  await old.query(
    `INSERT INTO balance_entries(id,userId,kind,amount,sourceKey,grantId,requestId,grantedDate,expiresDate) VALUES(1,1,'ANNUAL',1,'annual:1:2026-02-01',NULL,NULL,'2026-02-01',NULL),(2,1,'ANNUAL',-1,'request:1',1,1,'2026-03-01',NULL),(3,1,'OFF',1,'off:99',NULL,NULL,'2026-02-28','2026-03-30'),(4,1,'OFF',-1,'request:2',3,2,'2026-03-01',NULL)`,
  );
  await old.query(
    `INSERT INTO attendances(userId,workDate,checkIn,checkOut,workSeconds,late,early,manual,mode) VALUES(1,'2026-03-10','2026-03-10T00:00:00Z','2026-03-10T05:00:00Z',14400,0,0,0,'OFF')`,
  );
  await old.destroy();
  const a = await createApp({ path: file, demo: true });
  try {
    assert.equal((await a.db.manager.findOneByOrFail(Entries, { id: 1 })).amount, 2);
    assert.equal((await a.db.manager.findOneByOrFail(Entries, { id: 2 })).amount, -2);
    assert.equal((await a.db.manager.findOneByOrFail(Requests, { id: 2 })).kind, 'HALF_PM');
    assert.equal((await a.db.manager.findOneByOrFail(Attendances, { id: 1 })).workSeconds, 14400);
    assert.deepEqual(await a.db.query('PRAGMA foreign_key_check'), []);
  } finally {
    await a.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
