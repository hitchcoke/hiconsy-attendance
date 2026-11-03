export type Role = 'MEMBER' | 'LEAD';
export type RequestKind = 'ANNUAL' | 'HALF_AM' | 'HALF_PM' | 'REMOTE' | 'HOLIDAY';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface User {
  id: number;
  login: string;
  name: string;
  role: Role;
  hireDate: string;
}
export interface WorkRequest {
  id: number;
  userId: number;
  kind: RequestKind;
  date: string;
  reason: string;
  ip: string | null;
  startTime: string | null;
  endTime: string | null;
  createdAt: string;
  status: RequestStatus;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}
export interface ApprovalItem extends WorkRequest {
  applicant: User;
  canApprove: boolean;
  approvalBlockedReason: string;
}
export interface Attendance {
  id: number;
  userId: number;
  workDate: string;
  checkIn: string;
  checkOut: string | null;
  workSeconds: number;
  late: boolean;
  early: boolean;
  manual: boolean;
  mode: string;
}
export interface BalanceEntry {
  id: number;
  userId: number;
  kind: 'ANNUAL' | 'HOLIDAY';
  amount: number;
  sourceKey: string;
  grantId: number | null;
  requestId: number | null;
  grantedDate: string;
  expiresDate: string | null;
}
export interface Balances {
  annual: number;
  remote: number;
  reservedDays: number;
  pendingDays: number;
  approvedDays: number;
  expiring: { date: string; days: number }[];
  entries: BalanceEntry[];
}
export interface ClockInfo {
  now: string;
  demo: boolean;
}
export interface ActionState {
  enabled: boolean;
  reason: string;
}
export interface Today {
  user: User;
  clock: ClockInfo;
  date: string;
  attendance: Attendance | null;
  request: WorkRequest | null;
  missing: Attendance[];
  pendingRequest: WorkRequest | null;
  balances: Balances;
  checkIn: ActionState;
  checkOut: ActionState;
  workSeconds: number;
  holiday: boolean;
}
export interface AuditLog {
  id: number;
  actorId: number | null;
  action: string;
  target: string;
  result: string;
  code: string;
  at: string;
  ip: string;
}
export interface TeamRow {
  user: User;
  attendance: Attendance | null;
  request: WorkRequest | null;
  status: string;
  missing: number;
}
export interface TeamData {
  date: string;
  rows: TeamRow[];
  missing: (Attendance & { name: string })[];
  manual: (Attendance & { name: string })[];
}
export interface AttendanceDetail {
  attendance: Attendance;
  logs: AuditLog[];
}
export interface MemberDetail {
  user: User;
  attendances: Attendance[];
  requests: WorkRequest[];
  logs: AuditLog[];
}
export interface RequestInput {
  kind: RequestKind;
  date: string;
  reason: string;
  ip?: string;
  startTime?: string;
  endTime?: string;
}
export interface RequestOptions {
  date: string;
  business: boolean;
  deadline: string;
  open: boolean;
}
export interface CalendarDay {
  date: string;
  weekday: number;
  business: boolean;
  holidayName: string | null;
  attendance: Attendance | null;
  attendanceState: 'NONE' | 'WORKING' | 'MISSING_CHECKOUT' | 'COMPLETED';
  requests: WorkRequest[];
  deadline: string;
  canRequest: ActionState;
}
export interface CalendarMonth {
  month: string;
  today: string;
  user: User;
  users: User[];
  minMonth: string;
  maxMonth: string;
  days: CalendarDay[];
}
