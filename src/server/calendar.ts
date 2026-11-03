import { Between } from 'typeorm';
import type { Context } from './platform';
import type { CalendarMonth, CalendarDay } from '../shared/contracts';
import { Attendances, Requests, Users, Holidays, publicUser } from './db';
import { Calendar, dateOf, fail } from './rules';
import { positiveId } from './history';

export async function calendarMonth(
  c: Context,
  calendar: Calendar,
  query: Record<string, unknown>,
): Promise<CalendarMonth> {
  const today = dateOf(c.now);
  const month = query.month === undefined ? today.slice(0, 7) : query.month;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    fail('INVALID_MONTH', '조회 월은 YYYY-MM 형식으로 입력해 주세요.');
  const selectedMonth = month as string;
  calendar.supported(selectedMonth + '-01');
  const userId = query.userId === undefined ? c.user.id : positiveId(query.userId);
  if (userId !== c.user.id && c.user.role !== 'LEAD')
    fail('FORBIDDEN', '본인의 캘린더만 조회할 수 있습니다.', 403);
  const account = await c.m.findOneBy(Users, { id: userId });
  if (!account) fail('NOT_FOUND', '사용자를 찾을 수 없습니다.', 404);
  const user = publicUser(account!);
  const [year, numericMonth] = selectedMonth.split('-').map(Number);
  const length = new Date(Date.UTC(year, numericMonth, 0)).getUTCDate();
  const first = selectedMonth + '-01',
    last = selectedMonth + '-' + String(length).padStart(2, '0');
  const attendances = await c.m.findBy(Attendances, { userId, workDate: Between(first, last) });
  const requests = await c.m.find(Requests, {
    where: { userId, date: Between(first, last) },
    order: { id: 'DESC' },
  });
  const holidays = await c.m.findBy(Holidays, { date: Between(first, last) });
  const days: CalendarDay[] = Array.from({ length }, (_, index) => {
    const date = selectedMonth + '-' + String(index + 1).padStart(2, '0');
    const attendance = attendances.find((a) => a.workDate === date) || null;
    const dailyRequests = requests.filter((r) => r.date === date);
    const deadline = calendar.deadline(date);
    const blocked =
      userId !== c.user.id
        ? '본인의 일정만 신청할 수 있습니다.'
        : date < user.hireDate
          ? '입사일 이전에는 신청할 수 없습니다.'
          : c.now > deadline
            ? '전 영업일 17:00 신청 마감이 지났습니다.'
            : dailyRequests.some((r) => r.status !== 'REJECTED')
              ? '이미 대기 중이거나 승인된 신청이 있습니다.'
              : '';
    return {
      date,
      weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
      business: calendar.business(date),
      holidayName: holidays.find((h) => h.date === date)?.name || null,
      attendance,
      attendanceState: !attendance
        ? 'NONE'
        : attendance.checkOut
          ? 'COMPLETED'
          : date < today
            ? 'MISSING_CHECKOUT'
            : 'WORKING',
      requests: dailyRequests,
      deadline: deadline.toISOString(),
      canRequest: { enabled: !blocked, reason: blocked || '이 날짜로 신청할 수 있습니다.' },
    };
  });
  return {
    month: selectedMonth,
    today,
    user,
    users:
      c.user.role === 'LEAD'
        ? (await c.m.find(Users, { order: { id: 'ASC' } })).map(publicUser)
        : [user],
    minMonth: '2026-01',
    maxMonth: '2026-12',
    days,
  };
}
