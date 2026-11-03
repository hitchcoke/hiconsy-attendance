import { IsNull, LessThan } from 'typeorm';
import type { Context } from './platform';
import { Attendances, Requests } from './db';
import { Calendar, at, dateOf, fail, workSeconds, RULES, DomainError } from './rules';
import { balances, grantOff } from './balances';
import type { Attendance, ActionState, Today, WorkRequest } from '../shared/contracts';
export async function missing(c: Context) {
  return c.m.find(Attendances, {
    where: { userId: c.user.id, checkOut: IsNull(), workDate: LessThan(dateOf(c.now)) },
    order: { workDate: 'ASC' },
  });
}
export async function schedule(
  c: Context,
  calendar: Calendar,
  date: string,
  instant: Date,
  checkIp = true,
): Promise<WorkRequest | null> {
  const req = await c.m.findOneBy(Requests, { userId: c.user.id, date });
  if (!calendar.business(date) && req?.kind !== 'HOLIDAY')
    fail('HOLIDAY_REQUEST_REQUIRED', '주말·공휴일에는 휴일 근무 신청이 필요합니다.');
  if (req?.kind === 'ANNUAL') fail('ANNUAL_DAY', '연차 사용일에는 출퇴근할 수 없습니다.');
  if (req?.kind === 'REMOTE' || req?.kind === 'HOLIDAY') {
    if (checkIp && req.ip !== c.ip) fail('WORK_IP_MISMATCH', '신청한 IP에서 출퇴근해 주세요.', 403);
    if (instant < at(date, req.startTime!) || instant > at(date, req.endTime!))
      fail('WORK_WINDOW', '신청한 시간대 안에서 출퇴근해 주세요.', 403);
  }
  return req;
}
export async function canCheckIn(c: Context, calendar: Calendar) {
  const date = dateOf(c.now);
  calendar.supported(date);
  if (date < c.user.hireDate) fail('BEFORE_HIRE', '입사일 이전에는 출근할 수 없습니다.');
  if (await c.m.findOneBy(Attendances, { userId: c.user.id, workDate: date }))
    fail('ALREADY_CHECKED_IN', '오늘 출근을 이미 등록했어요.', 409);
  if ((await missing(c)).length)
    fail('MISSING_CHECKOUT', '이전 근무일의 퇴근 시각을 먼저 입력해 주세요.', 409);
  if (c.now < at(date, RULES.checkIn)) fail('TOO_EARLY', '출근 등록은 07:00부터 가능해요.');
  return schedule(c, calendar, date, c.now);
}
export async function checkIn(c: Context, calendar: Calendar) {
  const req = await canCheckIn(c, calendar),
    date = dateOf(c.now);
  return c.m.save(Attendances, {
    userId: c.user.id,
    workDate: date,
    checkIn: c.now.toISOString(),
    checkOut: null,
    workSeconds: 0,
    late: c.now > at(date, RULES.late),
    early: false,
    manual: false,
    mode: req?.kind || 'OFFICE',
  });
}
export async function canCheckOut(c: Context, calendar: Calendar): Promise<Attendance> {
  const date = dateOf(c.now),
    row = await c.m.findOneBy(Attendances, { userId: c.user.id, workDate: date });
  if (!row) fail('NOT_CHECKED_IN', '먼저 출근을 등록해 주세요.');
  if (row!.checkOut) fail('ALREADY_CHECKED_OUT', '오늘 퇴근을 이미 등록했어요.', 409);
  if (row!.mode !== 'OFF' && c.now < at(date, RULES.checkOut))
    fail('TOO_EARLY', '퇴근 등록은 16:00부터 가능해요.');
  if (c.now <= new Date(row!.checkIn))
    fail('INVALID_CHECKOUT', '퇴근은 출근 시각 이후에 등록해 주세요.');
  await schedule(c, calendar, date, c.now);
  return row!;
}
export async function finish(c: Context, row: Attendance, end: Date, manual = false) {
  row.checkOut = end.toISOString();
  row.workSeconds = workSeconds(row.checkIn, end);
  row.early = row.workSeconds < (row.mode === 'OFF' ? RULES.offSeconds : RULES.normalSeconds);
  row.manual = manual;
  await c.m.save(Attendances, row);
  await grantOff(c, row);
  return row;
}
export async function checkOut(c: Context, calendar: Calendar) {
  return finish(c, await canCheckOut(c, calendar), c.now);
}
async function action(fn: () => Promise<unknown>, label: string): Promise<ActionState> {
  try {
    await fn();
    return { enabled: true, reason: label };
  } catch (e) {
    if (e instanceof DomainError)
      return { enabled: false, reason: (e.getResponse() as { message: string }).message };
    throw e;
  }
}
export async function today(c: Context, calendar: Calendar, demo: boolean): Promise<Today> {
  const date = dateOf(c.now),
    attendance = await c.m.findOneBy(Attendances, { userId: c.user.id, workDate: date });
  return {
    user: c.user,
    date,
    clock: { now: c.now.toISOString(), demo },
    attendance,
    request: await c.m.findOneBy(Requests, { userId: c.user.id, date }),
    missing: await missing(c),
    balances: await balances(c),
    checkIn: await action(() => canCheckIn(c, calendar), '출근 등록 가능'),
    checkOut: await action(() => canCheckOut(c, calendar), '퇴근 등록 가능'),
    workSeconds: attendance
      ? attendance.checkOut
        ? attendance.workSeconds
        : workSeconds(attendance.checkIn, c.now)
      : 0,
    holiday: !calendar.business(date),
  };
}
