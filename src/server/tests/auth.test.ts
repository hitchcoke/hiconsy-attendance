import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app';
import { Logs } from '../db';
test('login, identity, logout and sensitive audit redaction', async () => {
  const a = await createApp({ path: ':memory:', demo: true });
  try {
    const http = request(a.app.getHttpServer());
    await http.get('/api/me').expect(401);
    await http.post('/api/auth/login').send({ login: 'kim', password: 'wrong' }).expect(401);
    const r = await http
      .post('/api/auth/login')
      .send({ login: 'kim', password: 'demo1234' })
      .expect(201);
    assert.equal(r.body.user.role, 'MEMBER');
    assert.equal(r.body.user.passwordHash, undefined);
    await http.get('/api/me').auth(r.body.token, { type: 'bearer' }).expect(200);
    await http.post('/api/auth/logout').auth(r.body.token, { type: 'bearer' }).send({}).expect(201);
    await http.get('/api/me').auth(r.body.token, { type: 'bearer' }).expect(401);
    const logs = await a.db.manager.find(Logs);
    assert.ok(logs.some((x) => x.result === 'FAILURE'));
    assert.ok(!JSON.stringify(logs).includes('demo1234'));
    assert.ok(!JSON.stringify(logs).includes(r.body.token));
  } finally {
    await a.close();
  }
});
test('untrusted forwarding header cannot bypass IP restriction', async () => {
  const a = await createApp({ path: ':memory:', demo: true, ips: ['192.0.2.1'] });
  try {
    await request(a.app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '192.0.2.1')
      .send({ login: 'kim', password: 'demo1234' })
      .expect(403);
  } finally {
    await a.close();
  }
});
