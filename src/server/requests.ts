import type { Context } from './platform';
import { Requests, Attendances, Users, publicUser } from './db';
import { Calendar, parseDate, parseTime, parseIp, at, dateOf, fail, RULES } from './rules';
import { accrue, consume, leaveUnits, releaseReservation } from './balances';
import type { RequestInput, RequestOptions, RequestKind, ApprovalItem } from '../shared/contracts';
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
  if (!['ANNUAL', 'HALF_AM', 'HALF_PM', 'REMOTE', 'HOLIDAY'].includes(kind))
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
        : '연차·반차·재택은 영업일에 신청해 주세요.',
    );
  if (
    await c.m
      .getRepository(Requests)
      .createQueryBuilder('r')
      .where('r.userId = :id AND r.date = :date AND r.status != :status', {
        id: c.user.id,
        date,
        status: 'REJECTED',
      })
      .getExists()
  )
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
      .where("r.userId = :id AND r.kind = :kind AND r.status = 'APPROVED' AND r.date LIKE :month", {
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
    status: leaveUnits(kind) && c.user.role === 'MEMBER' ? 'PENDING' : 'APPROVED',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  });
  if (leaveUnits(kind)) await consume(c, leaveUnits(kind), date, row.id);
  return row;
}

async function approvalBlock(c: Context, row: { date: string; userId: number; status: string }) {
  if (row.userId === c.user.id) return '본인 신청은 심사할 수 없습니다.';
  if (row.status !== 'PENDING') return '이미 처리된 신청입니다.';
  if (row.date < dateOf(c.now)) return '사용일이 지난 신청은 반려로 정리해 주세요.';
  if (await c.m.findOneBy(Attendances, { userId: row.userId, workDate: row.date }))
    return '해당 날짜에 출근 기록이 있어 승인할 수 없습니다.';
  return '';
}
export async function approvals(c: Context): Promise<ApprovalItem[]> {
  const rows = await c.m.find(Requests, { order: { createdAt: 'DESC', id: 'DESC' } });
  const users = (await c.m.find(Users)).map(publicUser);
  return Promise.all(
    rows
      .filter((r) => leaveUnits(r.kind))
      .map(async (row) => {
        const reason = await approvalBlock(c, row);
        return {
          ...row,
          applicant: users.find((u) => u.id === row.userId)!,
          canApprove: !reason,
          approvalBlockedReason: reason,
        };
      }),
  );
}
export async function reviewRequest(
  c: Context,
  id: number,
  body: { decision?: unknown; reason?: unknown },
) {
  if (body?.decision !== 'APPROVED' && body?.decision !== 'REJECTED')
    fail('INVALID_DECISION', '승인 또는 반려를 선택해 주세요.');
  if (body.reason !== undefined && typeof body.reason !== 'string')
    fail('INVALID_REASON', '처리 사유를 확인해 주세요.');
  const note = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (note.length > 500 || (body.decision === 'REJECTED' && !note))
    fail('INVALID_REASON', '반려 사유는 1~500자로 입력해 주세요.');
  const row = await c.m.findOneBy(Requests, { id });
  if (!row) fail('NOT_FOUND', '신청을 찾을 수 없습니다.', 404);
  if (row!.userId === c.user.id) fail('SELF_REVIEW', '본인 신청은 심사할 수 없습니다.', 403);
  if (row!.status !== 'PENDING')
    fail('ALREADY_REVIEWED', '이미 처리된 신청입니다. 목록을 새로고침해 주세요.', 409);
  if (body.decision === 'APPROVED') {
    const reason = await approvalBlock(c, row!);
    if (reason) fail('APPROVAL_UNAVAILABLE', reason, 409);
  } else await releaseReservation(c, id, row!.userId);
  row!.status = body.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  row!.reviewedBy = c.user.id;
  row!.reviewedAt = c.now.toISOString();
  row!.reviewNote = note || null;
  return c.m.save(Requests, row!);
}
