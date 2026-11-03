import type { Context } from './platform';
import { Entries, Requests } from './db';
import { anniversary, dateOf, addDays, fail, RULES } from './rules';
import type { Balances, Attendance } from '../shared/contracts';
export async function accrue(c: Context) {
  const today = dateOf(c.now);
  for (let month = 1; anniversary(c.user.hireDate, month) <= today; month++) {
    const grantDate = anniversary(c.user.hireDate, month);
    await c.m
      .createQueryBuilder()
      .insert()
      .into(Entries)
      .values({
        userId: c.user.id,
        kind: 'ANNUAL',
        amount: 1,
        sourceKey: `annual:${c.user.id}:${grantDate}`,
        grantedDate: grantDate,
      })
      .orIgnore()
      .execute();
  }
}
export async function balances(c: Context): Promise<Balances> {
  await accrue(c);
  const today = dateOf(c.now),
    entries = await c.m.find(Entries, { where: { userId: c.user.id }, order: { id: 'DESC' } }),
    requests = await c.m.findBy(Requests, { userId: c.user.id });
  const grants = entries.filter((e) => e.amount > 0 && e.grantedDate <= today),
    spent = (id: number) =>
      entries.filter((e) => e.grantId === id).reduce((n, e) => n + e.amount, 0);
  const validOff = grants
    .filter((e) => e.kind === 'OFF' && e.expiresDate! >= today)
    .map((e) => ({ date: e.expiresDate!, count: e.amount + spent(e.id) }))
    .filter((e) => e.count > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    annual: grants
      .filter((e) => e.kind === 'ANNUAL')
      .reduce((n, e) => n + e.amount + spent(e.id), 0),
    off: validOff.reduce((n, e) => n + e.count, 0),
    remote: Math.max(
      0,
      RULES.remoteLimit -
        requests.filter((r) => r.kind === 'REMOTE' && r.date.slice(0, 7) === today.slice(0, 7))
          .length,
    ),
    reservedAnnual: requests.filter((r) => r.kind === 'ANNUAL' && r.date >= today).length,
    reservedOff: requests.filter((r) => r.kind === 'OFF' && r.date >= today).length,
    expiring: validOff,
    entries,
  };
}
export async function consume(c: Context, kind: 'ANNUAL' | 'OFF', date: string, requestId: number) {
  const entries = await c.m.findBy(Entries, { userId: c.user.id });
  const grants = entries
    .filter(
      (e) =>
        e.kind === kind &&
        e.amount === 1 &&
        e.grantedDate <= dateOf(c.now) &&
        (!e.expiresDate || e.expiresDate >= date) &&
        1 + entries.filter((d) => d.grantId === e.id).reduce((n, d) => n + d.amount, 0) > 0,
    )
    .sort((a, b) => (a.expiresDate || a.grantedDate).localeCompare(b.expiresDate || b.grantedDate));
  if (!grants.length)
    fail(
      'INSUFFICIENT_BALANCE',
      kind === 'OFF' ? '사용일까지 유효한 OFF가 없습니다.' : '사용 가능한 연차가 없습니다.',
      409,
    );
  await c.m.insert(Entries, {
    userId: c.user.id,
    kind,
    amount: -1,
    sourceKey: `request:${requestId}`,
    grantId: grants[0].id,
    requestId,
    grantedDate: dateOf(c.now),
  });
}
export async function grantOff(c: Context, attendance: Attendance) {
  if (!attendance.checkOut || attendance.mode !== 'HOLIDAY') return;
  const grantDate = dateOf(attendance.checkOut);
  await c.m
    .createQueryBuilder()
    .insert()
    .into(Entries)
    .values({
      userId: c.user.id,
      kind: 'OFF',
      amount: 1,
      sourceKey: `off:${attendance.id}`,
      grantedDate: grantDate,
      expiresDate: addDays(grantDate, RULES.offDays),
    })
    .orIgnore()
    .execute();
}
