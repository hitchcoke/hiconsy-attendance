import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app';
import { Settings, Requests, Entries } from '../db';
test('remote work requires its own IP even on office network', async () => {
  const a = await createApp({ path: ':memory:', demo: true });
  try {
    const h = request(a.app.getHttpServer());
    const token = (await h.post('/api/auth/login').send({ login: 'kim', password: 'demo1234' }))
      .body.token;
    await h
      .post('/api/requests')
      .auth(token, { type: 'bearer' })
      .send({
        kind: 'REMOTE',
        date: '2026-03-13',
        reason: '재택',
        ip: '192.0.2.10',
        startTime: '07:00',
        endTime: '18:00',
      })
      .expect(201);
    await a.db.manager.update(Settings, { key: 'demoNow' }, { value: '2026-03-13T00:00:00Z' });
    const r = await h
      .post('/api/attendance/check-in')
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(403);
    assert.equal(r.body.code, 'WORK_IP_MISMATCH');
  } finally {
    await a.close();
  }
});
test('temporary IP permits only its owner and exact window', async () => {
  const a = await createApp({ path: ':memory:', demo: true, ips: ['192.0.2.1'] });
  try {
    await a.db.manager.insert(Requests, {
      userId: 1,
      kind: 'REMOTE',
      date: '2026-03-12',
      reason: '재택',
      ip: '127.0.0.1',
      startTime: '09:00',
      endTime: '18:00',
      createdAt: '2026-03-11T00:00:00Z',
    });
    const h = request(a.app.getHttpServer());
    const l = await h
      .post('/api/auth/login')
      .send({ login: 'kim', password: 'demo1234' })
      .expect(201);
    await h.post('/api/auth/login').send({ login: 'yeon', password: 'demo1234' }).expect(403);
    await a.db.manager.update(Settings, { key: 'demoNow' }, { value: '2026-03-12T09:00:00.001Z' });
    await h.get('/api/me').auth(l.body.token, { type: 'bearer' }).expect(403);
  } finally {
    await a.close();
  }
});
test('holiday correction grants half-day credit; afternoon leave ends at lunch', async () => {
  const a = await createApp({ path: ':memory:', demo: true, now: '2026-03-13T16:00:00+09:00' });
  try {
    const h = request(a.app.getHttpServer());
    const token = (await h.post('/api/auth/login').send({ login: 'kim', password: 'demo1234' }))
      .body.token;
    const post = (url: string, body = {}) =>
      h
        .post('/api/' + url)
        .auth(token, { type: 'bearer' })
        .send(body);
    const set = async (now: string) =>
      a.db.manager.update(
        Settings,
        { key: 'demoNow' },
        { value: new Date(now + '+09:00').toISOString() },
      );
    await post('requests', {
      kind: 'HOLIDAY',
      date: '2026-03-14',
      reason: '마이그레이션',
      ip: '127.0.0.1',
      startTime: '07:00',
      endTime: '18:00',
    }).expect(201);
    await set('2026-03-14T07:00:00');
    const check = await post('attendance/check-in').expect(201);
    await set('2026-03-16T09:00:00');
    await post(`attendance/${check.body.id}/correct`, {
      checkOut: '2026-03-14T18:01:00+09:00',
    }).expect(403);
    await post(`attendance/${check.body.id}/correct`, {
      checkOut: '2026-03-14T16:00:00+09:00',
    }).expect(201);
    await post(`attendance/${check.body.id}/correct`, {
      checkOut: '2026-03-14T16:00:00+09:00',
    }).expect(409);
    assert.equal(await a.db.manager.countBy(Entries, { kind: 'HOLIDAY', amount: 1 }), 1);
    await post('requests', { kind: 'HALF_PM', date: '2026-03-17', reason: '오후 휴식' }).expect(
      201,
    );
    await set('2026-03-17T07:30:00');
    await post('attendance/check-in').expect(201);
    await set('2026-03-17T11:30:00');
    const out = await post('attendance/check-out').expect(201);
    assert.equal(out.body.workSeconds, 14400);
    assert.equal(out.body.early, false);
  } finally {
    await a.close();
  }
});
