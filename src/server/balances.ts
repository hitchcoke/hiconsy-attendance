import type { Context } from './platform';
import { Entries, Requests } from './db';
import { anniversary, dateOf, addDays, fail, RULES } from './rules';
import type { Balances, Attendance, RequestKind, BalanceEntry } from '../shared/contracts';
export const leaveUnits = (kind: RequestKind): number =>
  kind === 'ANNUAL' ? 2 : kind === 'HALF_AM' || kind === 'HALF_PM' ? 1 : 0;
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
        amount: 2,
        sourceKey: `annual:${c.user.id}:${grantDate}`,
        grantedDate: grantDate,
      })
      .orIgnore()
      .execute();
  }
}
function available(entries: BalanceEntry[], today: string, useDate: string) {
  return entries
    .filter(
      (e) => e.amount > 0 && e.grantedDate <= today && (!e.expiresDate || e.expiresDate >= useDate),
    )
    .map((grant) => ({
      grant,
      units:
        grant.amount +
        entries.filter((e) => e.grantId === grant.id).reduce((sum, e) => sum + e.amount, 0),
    }))
    .filter((item) => item.units > 0)
    .sort(
      (a, b) =>
        (a.grant.expiresDate || '9999-12-31').localeCompare(b.grant.expiresDate || '9999-12-31') ||
        a.grant.id - b.grant.id,
    );
}
export async function balances(c: Context): Promise<Balances> {
  await accrue(c);
  const today = dateOf(c.now),
    entries = await c.m.find(Entries, { where: { userId: c.user.id }, order: { id: 'DESC' } }),
    requests = await c.m.findBy(Requests, { userId: c.user.id });
  const grants = available(entries, today, today);
  return {
    annual: grants.reduce((sum, g) => sum + g.units, 0) / 2,
    remote: Math.max(
      0,
      RULES.remoteLimit -
        requests.filter((r) => r.kind === 'REMOTE' && r.date.slice(0, 7) === today.slice(0, 7))
          .length,
    ),
    reservedDays:
      requests.filter((r) => r.date >= today).reduce((sum, r) => sum + leaveUnits(r.kind), 0) / 2,
    expiring: grants
      .filter((g) => g.grant.expiresDate)
      .map((g) => ({ date: g.grant.expiresDate!, days: g.units / 2 })),
    entries,
  };
}
export async function consume(c: Context, units: number, date: string, requestId: number) {
  const grants = available(await c.m.findBy(Entries, { userId: c.user.id }), dateOf(c.now), date);
  if (grants.reduce((sum, g) => sum + g.units, 0) < units)
    fail('INSUFFICIENT_BALANCE', `사용일까지 유효한 연차가 ${units / 2}일 이상 필요합니다.`, 409);
  let remaining = units;
  for (const { grant, units: count } of grants) {
    const used = Math.min(remaining, count);
    await c.m.insert(Entries, {
      userId: c.user.id,
      kind: grant.kind,
      amount: -used,
      sourceKey: `request:${requestId}:${grant.id}`,
      grantId: grant.id,
      requestId,
      grantedDate: dateOf(c.now),
    });
    remaining -= used;
    if (!remaining) break;
  }
}
export async function grantHolidayLeave(c: Context, attendance: Attendance) {
  if (!attendance.checkOut || attendance.mode !== 'HOLIDAY') return;
  const grantDate = dateOf(attendance.checkOut);
  await c.m
    .createQueryBuilder()
    .insert()
    .into(Entries)
    .values({
      userId: c.user.id,
      kind: 'HOLIDAY',
      amount: 1,
      sourceKey: `off:${attendance.id}`,
      grantedDate: grantDate,
      expiresDate: addDays(grantDate, RULES.offDays),
    })
    .orIgnore()
    .execute();
}
