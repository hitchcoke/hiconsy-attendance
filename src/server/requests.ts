import type { Context } from './platform';
import { Requests } from './db';
import { Calendar, parseDate, parseTime, parseIp, at, dateOf, fail, RULES } from './rules';
import { accrue, consume } from './balances';
import type { RequestInput, RequestOptions, RequestKind } from '../shared/contracts';
export function options(c: Context, calendar: Calendar, value: unknown): RequestOptions {
  const date = parseDate(value);
  calendar.supported(date);
  const deadline = calendar.deadline(date);
  return {
    date,
    business: calendar.business(date),
    deadline: deadline.toISOString(),
    open: c.now <= deadline,
  };
}
export async function createRequest(c: Context, calendar: Calendar, body: RequestInput) {
  const date = parseDate(body?.date),
    kind = body?.kind;
  if (!['ANNUAL', 'REMOTE', 'OFF', 'HOLIDAY'].includes(kind))
    fail('INVALID_KIND', '신청 종류를 선택해 주세요.');
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 500)
    fail('INVALID_REASON', '사유는 1~500자로 입력해 주세요.');
  const opt = options(c, calendar, date);
  if (date < c.user.hireDate) fail('BEFORE_HIRE', '입사일 이전에는 신청할 수 없습니다.');
  if (!opt.open) fail('DEADLINE_PASSED', '전 영업일 17:00 신청 마감이 지났습니다.');
  if ((kind === 'HOLIDAY') === opt.business)
    fail(
      'WRONG_DAY',
      kind === 'HOLIDAY'
        ? '휴일 근무는 주말·공휴일에 신청해 주세요.'
        : '연차·재택·OFF는 영업일에 신청해 주세요.',
    );
  if (await c.m.findOneBy(Requests, { userId: c.user.id, date }))
    fail('DUPLICATE_REQUEST', '하루에 한 종류만 신청할 수 있습니다.', 409);
  let ip: string | null = null,
    startTime: string | null = null,
    endTime: string | null = null;
  if (kind === 'REMOTE' || kind === 'HOLIDAY') {
    ip = parseIp(body.ip);
    startTime = parseTime(body.startTime);
    endTime = parseTime(body.endTime);
    if (startTime >= endTime || endTime < RULES.checkOut || endTime <= RULES.checkIn)
      fail('INVALID_WINDOW', '시작 < 종료이며, 퇴근 가능한 16:00 이후까지 포함해야 합니다.');
  }
  await accrue(c);
  if (kind === 'REMOTE') {
    const count = await c.m
      .getRepository(Requests)
      .createQueryBuilder('r')
      .where('r.userId = :id AND r.kind = :kind AND r.date LIKE :month', {
        id: c.user.id,
        kind: 'REMOTE',
        month: date.slice(0, 7) + '%',
      })
      .getCount();
    if (count >= RULES.remoteLimit)
      fail('REMOTE_LIMIT', '사용일 기준 월 재택 2회를 모두 신청했습니다.', 409);
  }
  const row = await c.m.save(Requests, {
    userId: c.user.id,
    kind,
    date,
    reason: body.reason.trim(),
    ip,
    startTime,
    endTime,
    createdAt: c.now.toISOString(),
  });
  if (kind === 'ANNUAL' || kind === 'OFF') await consume(c, kind, date, row.id);
  return row;
}
