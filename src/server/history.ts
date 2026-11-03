import { Between } from 'typeorm';
import type { Context } from './platform';
import { Attendances, Logs } from './db';
import { Calendar, parseInstant, parseDate, dateOf, at, RULES, fail } from './rules';
import { finish, schedule } from './attendance';
export function positiveId(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  )
    fail('INVALID_ID', '잘못된 항목입니다.');
  return Number(value);
}
export function range(c: Context, query: Record<string, unknown>) {
  const from = parseDate(query.from || dateOf(c.now).slice(0, 7) + '-01'),
    to = parseDate(query.to || dateOf(c.now));
  if (from > to) fail('INVALID_RANGE', '시작일은 종료일보다 늦을 수 없습니다.');
  return { from, to };
}
export async function history(c: Context, query: Record<string, unknown>, userId = c.user.id) {
  const { from, to } = range(c, query);
  return c.m.find(Attendances, {
    where: { userId, workDate: Between(from, to) },
    order: { workDate: 'DESC' },
  });
}
export async function detail(c: Context, id: number) {
  const attendance = await c.m.findOneBy(Attendances, {
    id,
    ...(c.user.role === 'LEAD' ? {} : { userId: c.user.id }),
  });
  if (!attendance) fail('NOT_FOUND', '근태 기록을 찾을 수 없습니다.', 404);
  return {
    attendance,
    logs: await c.m.find(Logs, { where: { target: `attendance:${id}` }, order: { id: 'DESC' } }),
  };
}
export async function correct(c: Context, calendar: Calendar, id: number, value: unknown) {
  const row = await c.m.findOneBy(Attendances, { id, userId: c.user.id });
  if (!row) fail('NOT_FOUND', '본인의 근태 기록을 찾을 수 없습니다.', 404);
  if (row!.checkOut) fail('ALREADY_CHECKED_OUT', '이미 퇴근이 기록되어 있습니다.', 409);
  if (row!.workDate >= dateOf(c.now))
    fail('NOT_MISSING_DAY', '이전 근무일의 미기록만 보정할 수 있습니다.');
  const end = parseInstant(value);
  if (dateOf(end) !== row!.workDate || end <= new Date(row!.checkIn) || end >= c.now)
    fail('INVALID_CHECKOUT', '해당 근무일의 출근 이후, 현재 이전 시각을 입력해 주세요.');
  if (row!.mode !== 'OFF' && end < at(row!.workDate, RULES.checkOut))
    fail('TOO_EARLY', '퇴근 시각은 16:00 이후여야 합니다.');
  await schedule(c, calendar, row!.workDate, end, false);
  return finish(c, row!, end, true);
}
