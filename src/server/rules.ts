import { HttpException } from '@nestjs/common';
import { isIP } from 'node:net';
export const RULES = Object.freeze({
  checkIn: '07:00',
  late: '10:00',
  checkOut: '16:00',
  lunchStart: '11:30',
  lunchEnd: '12:30',
  normalSeconds: 28800,
  offSeconds: 14400,
  remoteLimit: 2,
  offDays: 30,
  deadline: '17:00',
});
export class DomainError extends HttpException {
  constructor(
    public code: string,
    message: string,
    status = 400,
  ) {
    super({ code, message }, status);
  }
}
export const fail = (code: string, message: string, status = 400): never => {
  throw new DomainError(code, message, status);
};
export const dateOf = (d: Date | string): string =>
  new Date(new Date(d).getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const at = (date: string, time: string): Date => new Date(`${date}T${time}:00+09:00`);
export function parseDate(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(at(value, '00:00').getTime()) ||
    dateOf(at(value, '00:00')) !== value
  )
    fail('INVALID_DATE', '올바른 날짜를 입력해 주세요.');
  return value as string;
}
export function parseInstant(value: unknown): Date {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    fail('INVALID_TIME', '시간대가 포함된 올바른 시각을 입력해 주세요.');
  parseDate((value as string).slice(0, 10));
  return new Date(value as string);
}
export function parseTime(value: unknown): string {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    fail('INVALID_TIME', '시각은 HH:mm 형식으로 입력해 주세요.');
  return value as string;
}
export function normalizeIp(value: string): string {
  return value.startsWith('::ffff:') ? value.slice(7) : value === '::1' ? '127.0.0.1' : value;
}
export function parseIp(value: unknown): string {
  if (typeof value !== 'string' || !isIP(value))
    fail('INVALID_IP', '유효한 IP 주소를 입력해 주세요.');
  return normalizeIp(value as string);
}
export function addDays(date: string, days: number): string {
  return dateOf(new Date(at(date, '12:00').getTime() + days * 86400000));
}
export function anniversary(hire: string, months: number): string {
  const [y, m, d] = hire.split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
export function workSeconds(start: Date | string, end: Date | string): number {
  const a = new Date(start),
    b = new Date(end),
    date = dateOf(a);
  const lunch = a <= at(date, RULES.lunchStart) && b >= at(date, RULES.lunchEnd) ? 3600 : 0;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000) - lunch);
}
export class Calendar {
  constructor(public holidays: Set<string>) {}
  supported(date: string) {
    if (!date.startsWith('2026-'))
      fail('CALENDAR_UNSUPPORTED', '초기 공휴일 데이터는 2026년을 지원합니다.');
  }
  business(date: string): boolean {
    // The preceding business day for early January can fall in the prior year.
    if (date !== '2025-12-31') this.supported(date);
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    return day !== 0 && day !== 6 && !this.holidays.has(date);
  }
  deadline(date: string): Date {
    let previous = addDays(date, -1);
    while (!this.business(previous)) previous = addDays(previous, -1);
    return at(previous, RULES.deadline);
  }
}

export const isHalfDay = (mode: string) => mode === 'HALF_AM' || mode === 'HALF_PM';
export function attendanceSeconds(start: string, end: Date | string, mode: string): number {
  const date = dateOf(start);
  if (mode === 'HALF_PM')
    return workSeconds(
      start,
      new Date(Math.min(new Date(end).getTime(), at(date, RULES.lunchStart).getTime())),
    );
  if (mode === 'HALF_AM')
    return workSeconds(
      new Date(Math.max(new Date(start).getTime(), at(date, RULES.lunchEnd).getTime())),
      end,
    );
  return workSeconds(start, end);
}
export function validateCheckoutTime(mode: string, date: string, end: Date) {
  if (mode === 'HALF_AM') return;
  const earliest = mode === 'HALF_PM' ? RULES.lunchStart : RULES.checkOut;
  if (end < at(date, earliest)) fail('TOO_EARLY', `퇴근 등록은 ${earliest}부터 가능합니다.`);
}
