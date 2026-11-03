import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../app';
import { Attendances, Users, Settings } from '../db';
test('SQLite persists records and demo time; seed is idempotent on restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hiconsy-db-'));
  let a = await createApp({ path: join(dir, 'test.sqlite'), demo: true });
  try {
    const h = request(a.app.getHttpServer());
    const token = (await h.post('/api/auth/login').send({ login: 'kim', password: 'demo1234' }))
      .body.token;
    await h.post('/api/attendance/check-in').auth(token, { type: 'bearer' }).send({}).expect(201);
    await a.db.manager.update(Settings, { key: 'demoNow' }, { value: '2026-03-12T09:00:00.000Z' });
    await a.close();
    a = await createApp({ path: join(dir, 'test.sqlite'), demo: true });
    assert.equal(await a.db.manager.count(Users), 4);
    assert.equal(await a.db.manager.count(Attendances), 1);
    assert.equal((await a.platform.now()).toISOString(), '2026-03-12T09:00:00.000Z');
    await request(a.app.getHttpServer()).get('/api/me').auth(token, { type: 'bearer' }).expect(401);
    assert.equal(
      a.platform.calendar.deadline('2026-01-02').toISOString(),
      '2025-12-31T08:00:00.000Z',
    );
    assert.equal(a.platform.calendar.business('2026-05-01'), false);
    assert.equal(a.platform.calendar.business('2026-07-17'), false);
  } finally {
    await a.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
