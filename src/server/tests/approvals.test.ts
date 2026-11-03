import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app';
import { Entries, Requests, Settings, Logs } from '../db';
async function setup() {
  const app = await createApp({ path: ':memory:', demo: true });
  const http = request(app.app.getHttpServer());
  const login = async (login: string) =>
    (await http.post('/api/auth/login').send({ login, password: 'demo1234' }).expect(201)).body
      .token;
  const kim = await login('kim'),
    lead = await login('lead'),
    yeon = await login('yeon');
  const post = (token: string, path: string, body: Record<string, unknown>) =>
    http
      .post('/api/' + path)
      .auth(token, { type: 'bearer' })
      .send(body);
  const get = (token: string, path: string) =>
    http.get('/api/' + path).auth(token, { type: 'bearer' });
  const apply = (extra = {}) =>
    post(kim, 'requests', { kind: 'ANNUAL', date: '2026-03-13', reason: '휴가', ...extra });
  const review = (id: number, decision = 'APPROVED', reason?: string) =>
    post(lead, `requests/${id}/review`, { decision, reason });
  const set = (now: string) =>
    app.db.manager.update(
      Settings,
      { key: 'demoNow' },
      { value: new Date(now + '+09:00').toISOString() },
    );
  return { app, http, kim, lead, yeon, post, get, apply, review, set };
}
test('member leave waits for approval, reserves balance, and does not change attendance or team status', async () => {
  const s = await setup();
  try {
    const r = await s.apply({ status: 'APPROVED', reviewedBy: 4 }).expect(201);
    assert.equal(r.body.status, 'PENDING');
    assert.equal(r.body.reviewedBy, null);
    const balance = (await s.get(s.kim, 'balances')).body;
    assert.equal(balance.annual, 1);
    assert.equal(balance.pendingDays, 1);
    assert.equal(balance.approvedDays, 0);
    await s.set('2026-03-13T09:00:00');
    const today = (await s.get(s.kim, 'today')).body;
    assert.equal(today.request, null);
    assert.equal(today.checkIn.enabled, true);
    const team = (await s.get(s.lead, 'team?date=2026-03-13')).body;
    assert.equal(team.rows.find((r: any) => r.user.id === 1).request, null);
    const inOffice = await s.post(s.kim, 'attendance/check-in', {}).expect(201);
    assert.equal(inOffice.body.mode, 'OFFICE');
  } finally {
    await s.app.close();
  }
});
test('lead approval is visible to the applicant, affects leave, and does not deduct twice', async () => {
  const s = await setup();
  try {
    const r = await s.apply().expect(201);
    const decision = await s.review(r.body.id).expect(201);
    assert.equal(decision.body.reviewedBy, 4);
    assert.ok(decision.body.reviewedAt);
    const balance = (await s.get(s.kim, 'balances')).body;
    assert.equal(balance.annual, 1);
    assert.equal(balance.pendingDays, 0);
    assert.equal(balance.approvedDays, 1);
    assert.equal((await s.get(s.kim, 'requests')).body[0].status, 'APPROVED');
    assert.equal(
      await s.app.db.manager.countBy(Logs, {
        action: 'REQUEST_APPROVE',
        target: `request:${r.body.id}`,
        result: 'SUCCESS',
      }),
      1,
    );
    await s.set('2026-03-13T09:00:00');
    assert.equal((await s.post(s.kim, 'attendance/check-in', {})).body.code, 'ANNUAL_DAY');
    assert.equal(
      (await s.get(s.lead, 'team?date=2026-03-13')).body.rows.find((r: any) => r.user.id === 1)
        .status,
      '연차',
    );
  } finally {
    await s.app.close();
  }
});
test('rejection requires a reason, restores exactly once, and keeps history on resubmission', async () => {
  const s = await setup();
  try {
    const first = await s.apply({ kind: 'HALF_AM' }).expect(201);
    await s.review(first.body.id, 'REJECTED', ' ').expect(400);
    assert.equal((await s.get(s.kim, 'balances')).body.annual, 1.5);
    await s.review(first.body.id, 'REJECTED', '일정 조정이 필요합니다.').expect(201);
    await s.review(first.body.id, 'REJECTED', '다시 반려').expect(409);
    await s.review(first.body.id).expect(409);
    const b = (await s.get(s.kim, 'balances')).body;
    assert.equal(b.annual, 2);
    assert.equal(b.reservedDays, 0);
    assert.equal((await s.get(s.kim, 'requests')).body[0].reviewNote, '일정 조정이 필요합니다.');
    const second = await s.apply({ kind: 'HALF_PM' }).expect(201);
    assert.notEqual(second.body.id, first.body.id);
    await s.apply().expect(409);
    assert.equal(await s.app.db.manager.count(Requests), 2);
    assert.equal((await s.get(s.kim, 'balances')).body.annual, 1.5);
  } finally {
    await s.app.close();
  }
});
test('concurrent approval and rejection permit one decision and one financial outcome', async () => {
  const s = await setup();
  try {
    const r = await s.apply().expect(201);
    const replies = await Promise.all([
      s.review(r.body.id),
      s.review(r.body.id, 'REJECTED', '일정 변경'),
    ]);
    assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]);
    const row = await s.app.db.manager.findOneByOrFail(Requests, { id: r.body.id });
    const b = (await s.get(s.kim, 'balances')).body;
    assert.equal(b.annual, row.status === 'APPROVED' ? 1 : 2);
    const logs = await s.app.db.manager.find(Logs);
    assert.equal(
      logs.filter(
        (l) =>
          l.action.startsWith('REQUEST_') &&
          ['REQUEST_APPROVE', 'REQUEST_REJECT'].includes(l.action) &&
          l.result === 'SUCCESS',
      ).length,
      1,
    );
  } finally {
    await s.app.close();
  }
});
test('members cannot read approval queue or review; lead cannot review own request', async () => {
  const s = await setup();
  try {
    const r = await s.apply().expect(201);
    await s.get(s.kim, 'approvals').expect(403);
    await s.post(s.yeon, `requests/${r.body.id}/review`, { decision: 'APPROVED' }).expect(403);
    await s.review(99999).expect(404);
    await s.review(r.body.id, 'INVALID').expect(400);
    const own = await s
      .post(s.lead, 'requests', { kind: 'HALF_AM', date: '2026-03-13', reason: '리드 휴가' })
      .expect(201);
    assert.equal(own.body.status, 'APPROVED');
    await s.review(own.body.id).expect(403);
  } finally {
    await s.app.close();
  }
});
test('past-day and already-started work cannot be approved; rejection still releases reservation', async () => {
  const s = await setup();
  try {
    const r = await s.apply().expect(201);
    await s.set('2026-03-13T09:00:00');
    await s.post(s.kim, 'attendance/check-in', {}).expect(201);
    assert.equal((await s.review(r.body.id)).body.code, 'APPROVAL_UNAVAILABLE');
    await s.set('2026-03-16T09:00:00');
    assert.equal((await s.review(r.body.id)).body.code, 'APPROVAL_UNAVAILABLE');
    const pending = (await s.get(s.lead, 'approvals')).body.find(
      (item: any) => item.id === r.body.id,
    );
    assert.equal(pending.canApprove, false);
    await s.review(r.body.id, 'REJECTED', '사용일 경과').expect(201);
    assert.equal((await s.get(s.kim, 'balances')).body.annual, 2);
  } finally {
    await s.app.close();
  }
});
test('releasing holiday-backed leave preserves expiry and does not create a new grant', async () => {
  const s = await setup();
  try {
    await s.app.db.manager.insert(Entries, {
      userId: 1,
      kind: 'HOLIDAY',
      amount: 1,
      sourceKey: 'test:holiday',
      grantedDate: '2026-03-01',
      expiresDate: '2026-03-31',
    });
    const r = await s.apply({ kind: 'HALF_AM' }).expect(201);
    assert.equal((await s.get(s.kim, 'balances')).body.annual, 2);
    await s.review(r.body.id, 'REJECTED', '변경').expect(201);
    const restored = (await s.get(s.kim, 'balances')).body;
    assert.equal(restored.annual, 2.5);
    assert.deepEqual(restored.expiring, [{ date: '2026-03-31', days: 0.5 }]);
    await s.set('2026-04-01T09:00:00');
    assert.equal((await s.get(s.kim, 'balances')).body.annual, 3);
  } finally {
    await s.app.close();
  }
});
