import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app';
import { Entries, Requests, Settings } from '../db';
import { Calendar, at } from '../rules';
test('deadline skips weekend and substitute holidays', () => {
  const c = new Calendar(new Set(['2026-03-02']));
  assert.equal(c.deadline('2026-03-03').toISOString(), at('2026-02-27', '17:00').toISOString());
});
test('deadline exact boundary, reservation, duplicate and concurrent exhaustion', async () => {
  const a = await createApp({ path: ':memory:', demo: true, now: '2026-03-12T17:00:00+09:00' });
  try {
    const http = request(a.app.getHttpServer());
    const login = await http.post('/api/auth/login').send({ login: 'im', password: 'demo1234' });
    const send = (date: string) =>
      http
        .post('/api/requests')
        .auth(login.body.token, { type: 'bearer' })
        .send({ kind: 'ANNUAL', date, reason: '휴식' });
    const result = await Promise.all([send('2026-03-13'), send('2026-03-16')]);
    assert.deepEqual(result.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await a.db.manager.count(Requests), 1);
    assert.equal(
      (await a.db.manager.find(Entries)).reduce((n, e) => n + e.amount, 0),
      0,
    );
    await a.db.manager.update(Settings, { key: 'demoNow' }, { value: '2026-03-12T08:00:00.001Z' });
    const late = await send('2026-03-13');
    assert.equal(late.body.code, 'DEADLINE_PASSED');
  } finally {
    await a.close();
  }
});
test('remote quota uses target month; inputs and day types validated', async () => {
  const a = await createApp({ path: ':memory:', demo: true });
  try {
    const http = request(a.app.getHttpServer());
    const l = await http.post('/api/auth/login').send({ login: 'kim', password: 'demo1234' });
    const send = (date: string, extra = {}) =>
      http
        .post('/api/requests')
        .auth(l.body.token, { type: 'bearer' })
        .send({
          kind: 'REMOTE',
          date,
          reason: '집중',
          ip: '127.0.0.1',
          startTime: '07:00',
          endTime: '20:00',
          ...extra,
        });
    await send('2026-03-13').expect(201);
    await send('2026-03-16').expect(201);
    assert.equal((await send('2026-03-17')).body.code, 'REMOTE_LIMIT');
    await send('2026-04-01').expect(201);
    await send('2026-04-02', { ip: 'bad' }).expect(400);
    await send('2026-03-14').expect(400);
  } finally {
    await a.close();
  }
});
