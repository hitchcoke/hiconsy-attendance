export type Role = 'MEMBER' | 'LEAD';
export type RequestKind = 'ANNUAL' | 'REMOTE' | 'OFF' | 'HOLIDAY';
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
  kind: 'ANNUAL' | 'OFF';
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
  off: number;
  reservedAnnual: number;
  reservedOff: number;
  expiring: { date: string; count: number }[];
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
