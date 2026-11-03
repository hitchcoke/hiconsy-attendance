import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app';
import { Attendances, Settings, Logs } from '../db';
import type { CalendarDay } from '../../shared/contracts';
async function setup(now = '2026-03-12T09:00:00+09:00') {
  const app = await createApp({ path: ':memory:', demo: true, now });
  const http = request(app.app.getHttpServer());
  const login = async (login: string) =>
    (await http.post('/api/auth/login').send({ login, password: 'demo1234' })).body.token;
  const kim = await login('kim'),
    lead = await login('lead'),
    yeon = await login('yeon');
  const get = (query = '', token = kim) =>
    http.get('/api/calendar' + query).auth(token, { type: 'bearer' });
  const post = (path: string, body: object, token = kim) =>
    http
      .post('/api/' + path)
      .auth(token, { type: 'bearer' })
      .send(body);
  return { app, http, kim, lead, yeon, get, post };
}
const day = (body: { days: CalendarDay[] }, date: string) =>
  body.days.find((d) => d.date === date)!;
test('calendar month uses KST and handles 28/30/31-day months and year edges', async () => {
  const s = await setup('2026-03-31T15:30:00Z');
  try {
    const current = (await s.get().expect(200)).body;
    assert.equal(current.month, '2026-04');
    assert.equal(current.today, '2026-04-01');
    assert.equal(current.days.length, 30);
    const jan = (await s.get('?month=2026-01')).body;
    assert.equal(jan.days[0].date, '2026-01-01');
    assert.equal(jan.days[0].weekday, 4);
    assert.equal(jan.days[0].holidayName, '신정');
    assert.equal(jan.days[0].deadline, '2025-12-31T08:00:00.000Z');
    const feb = (await s.get('?month=2026-02')).body;
    assert.equal(feb.days.length, 28);
    assert.equal(feb.days.at(-1).date, '2026-02-28');
    const dec = (await s.get('?month=2026-12')).body;
    assert.equal(dec.days.length, 31);
    assert.equal(dec.days.at(-1).date, '2026-12-31');
    assert.equal(dec.minMonth, '2026-01');
    assert.equal(dec.maxMonth, '2026-12');
  } finally {
    await s.app.close();
  }
});
test('calendar rejects malformed or unsupported months and invalid user IDs', async () => {
  const s = await setup();
  try {
    for (const month of ['2026-00', '2026-13', '2026-2', '2026-02-01', 'bad'])
      assert.equal((await s.get('?month=' + month).expect(400)).body.code, 'INVALID_MONTH');
    await s.get('?month=2026-01&month=2026-02').expect(400);
    assert.equal((await s.get('?month=2027-01').expect(400)).body.code, 'CALENDAR_UNSUPPORTED');
    for (const id of ['0', '-1', 'a', '1.5']) await s.get('?userId=' + id, s.lead).expect(400);
  } finally {
    await s.app.close();
  }
});
test('calendar enforces ownership and exposes only public selectable users to leads', async () => {
  const s = await setup();
  try {
    const own = (await s.get().expect(200)).body;
    assert.equal(own.user.id, 1);
    assert.equal(own.users.length, 1);
    assert.equal(own.user.passwordHash, undefined);
    await s.get('?userId=2').expect(403);
    await s.get('?userId=9999').expect(403);
    const team = (await s.get('?userId=2', s.lead).expect(200)).body;
    assert.equal(team.user.name, '연차원');
    assert.equal(team.users.length, 4);
    assert.ok(team.users.every((u: object) => !('passwordHash' in u)));
    assert.ok(team.days.every((d: CalendarDay) => !d.canRequest.enabled));
    await s.get('?userId=9999', s.lead).expect(404);
    assert.equal(
      await s.app.db.manager.countBy(Logs, { action: 'CALENDAR', actorId: 1, result: 'FAILURE' }),
      2,
    );
  } finally {
    await s.app.close();
  }
});
test('calendar filters month bounds and distinguishes working, missing, completed and empty days', async () => {
  const s = await setup();
  try {
    for (const date of [
      '2026-02-28',
      '2026-03-01',
      '2026-03-11',
      '2026-03-12',
      '2026-03-31',
      '2026-04-01',
    ])
      await s.app.db.manager.insert(Attendances, {
        userId: 1,
        workDate: date,
        checkIn: date + 'T00:00:00Z',
        late: date === '2026-03-01',
        mode: 'OFFICE',
        checkOut: date === '2026-03-01' ? date + 'T08:00:00Z' : null,
        workSeconds: date === '2026-03-01' ? 25200 : 0,
        early: date === '2026-03-01',
        manual: date === '2026-03-01',
      });
    const body = (await s.get('?month=2026-03')).body;
    assert.equal(body.days.filter((d: CalendarDay) => d.attendance).length, 4);
    assert.equal(day(body, '2026-03-11').attendanceState, 'MISSING_CHECKOUT');
    assert.equal(day(body, '2026-03-12').attendanceState, 'WORKING');
    assert.equal(day(body, '2026-03-01').attendanceState, 'COMPLETED');
    assert.equal(day(body, '2026-03-01').attendance?.workSeconds, 25200);
    assert.equal(day(body, '2026-03-01').attendance?.manual, true);
    assert.equal(day(body, '2026-03-13').attendanceState, 'NONE');
    assert.equal(day(body, '2026-03-02').holidayName, '삼일절 대체공휴일');
    assert.equal(day(body, '2026-03-07').business, false);
  } finally {
    await s.app.close();
  }
});
test('calendar retains rejected and resubmitted leave states without losing other request kinds', async () => {
  const s = await setup();
  try {
    const first = await s
      .post('requests', { kind: 'HALF_AM', date: '2026-03-13', reason: '첫 신청' })
      .expect(201);
    let d = day((await s.get()).body, '2026-03-13');
    assert.equal(d.requests[0].status, 'PENDING');
    assert.equal(d.canRequest.enabled, false);
    await s
      .post(
        `requests/${first.body.id}/review`,
        { decision: 'REJECTED', reason: '일정 조정' },
        s.lead,
      )
      .expect(201);
    assert.equal(day((await s.get()).body, '2026-03-13').canRequest.enabled, true);
    const second = await s
      .post('requests', { kind: 'HALF_PM', date: '2026-03-13', reason: '재신청' })
      .expect(201);
    await s.post(`requests/${second.body.id}/review`, { decision: 'APPROVED' }, s.lead).expect(201);
    for (const [kind, date] of [
      ['REMOTE', '2026-03-16'],
      ['HOLIDAY', '2026-03-14'],
    ])
      await s
        .post('requests', {
          kind,
          date,
          reason: '근무',
          ip: '127.0.0.1',
          startTime: '07:00',
          endTime: '18:00',
        })
        .expect(201);
    const body = (await s.get()).body;
    d = day(body, '2026-03-13');
    assert.deepEqual(
      d.requests.map((r) => r.status),
      ['APPROVED', 'REJECTED'],
    );
    assert.equal(d.requests[1].reviewNote, '일정 조정');
    assert.equal(day(body, '2026-03-16').requests[0].kind, 'REMOTE');
    assert.equal(day(body, '2026-03-14').requests[0].kind, 'HOLIDAY');
  } finally {
    await s.app.close();
  }
});
test('calendar availability matches exact deadline, substitute holiday and hire-date rules', async () => {
  const s = await setup('2026-02-27T17:00:00+09:00');
  try {
    let d = day((await s.get('?month=2026-03')).body, '2026-03-03');
    assert.equal(d.deadline, '2026-02-27T08:00:00.000Z');
    assert.equal(d.canRequest.enabled, true);
    await s.app.db.manager.update(
      Settings,
      { key: 'demoNow' },
      { value: '2026-02-27T08:00:00.001Z' },
    );
    d = day((await s.get('?month=2026-03')).body, '2026-03-03');
    assert.equal(d.canRequest.enabled, false);
    assert.match(d.canRequest.reason, /마감/);
    const beforeHire = day((await s.get('?month=2026-01', s.yeon)).body, '2026-01-14');
    assert.equal(beforeHire.canRequest.enabled, false);
    assert.match(beforeHire.canRequest.reason, /입사일/);
  } finally {
    await s.app.close();
  }
});
