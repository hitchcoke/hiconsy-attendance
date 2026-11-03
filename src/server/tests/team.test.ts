import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app';
test('lead team board matches personal record; members cannot inspect team', async () => {
  const a = await createApp({ path: ':memory:', demo: true });
  try {
    const h = request(a.app.getHttpServer());
    const login = async (login: string) =>
      (await h.post('/api/auth/login').send({ login, password: 'demo1234' })).body.token;
    const kim = await login('kim'),
      lead = await login('lead');
    const punch = await h
      .post('/api/attendance/check-in')
      .auth(kim, { type: 'bearer' })
      .send({})
      .expect(201);
    await h.get('/api/team').auth(kim, { type: 'bearer' }).expect(403);
    await h.get('/api/team/2').auth(kim, { type: 'bearer' }).expect(403);
    const board = await h
      .get('/api/team?date=2026-03-12')
      .auth(lead, { type: 'bearer' })
      .expect(200);
    assert.equal(board.body.rows.length, 4);
    assert.equal(
      board.body.rows.find((r: any) => r.user.login === 'kim').attendance.id,
      punch.body.id,
    );
    const detail = await h.get('/api/team/1').auth(lead, { type: 'bearer' }).expect(200);
    assert.equal(detail.body.attendances[0].id, punch.body.id);
    assert.equal(detail.body.user.passwordHash, undefined);
  } finally {
    await a.close();
  }
});
