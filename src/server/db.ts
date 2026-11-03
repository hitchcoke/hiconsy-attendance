import 'reflect-metadata';
import { DataSource, EntitySchema, EntityManager } from 'typeorm';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { User, Attendance, WorkRequest, BalanceEntry, AuditLog } from '../shared/contracts';
type Account = User & { passwordHash: string };
const id = { type: Number, primary: true, generated: true } as const;
export const Users = new EntitySchema<Account>({
  name: 'User',
  tableName: 'users',
  columns: {
    id,
    login: { type: String, unique: true },
    name: { type: String },
    passwordHash: { type: String },
    role: { type: String },
    hireDate: { type: String },
  },
});
export const Attendances = new EntitySchema<Attendance>({
  name: 'Attendance',
  tableName: 'attendances',
  columns: {
    id,
    userId: { type: Number },
    workDate: { type: String },
    checkIn: { type: String },
    checkOut: { type: String, nullable: true },
    workSeconds: { type: Number, default: 0 },
    late: { type: Boolean },
    early: { type: Boolean, default: false },
    manual: { type: Boolean, default: false },
    mode: { type: String },
  },
  uniques: [{ columns: ['userId', 'workDate'] }],
});
export const Requests = new EntitySchema<WorkRequest>({
  name: 'Request',
  tableName: 'requests',
  columns: {
    id,
    userId: { type: Number },
    kind: { type: String },
    date: { type: String },
    reason: { type: String },
    ip: { type: String, nullable: true },
    startTime: { type: String, nullable: true },
    endTime: { type: String, nullable: true },
    createdAt: { type: String },
  },
  uniques: [{ columns: ['userId', 'date'] }],
});
export const Entries = new EntitySchema<BalanceEntry>({
  name: 'Entry',
  tableName: 'balance_entries',
  columns: {
    id,
    userId: { type: Number },
    kind: { type: String },
    amount: { type: Number },
    sourceKey: { type: String, unique: true },
    grantId: { type: Number, nullable: true },
    requestId: { type: Number, nullable: true },
    grantedDate: { type: String },
    expiresDate: { type: String, nullable: true },
  },
});
export const Logs = new EntitySchema<AuditLog>({
  name: 'Audit',
  tableName: 'audit_logs',
  columns: {
    id,
    actorId: { type: Number, nullable: true },
    action: { type: String },
    target: { type: String },
    result: { type: String },
    code: { type: String },
    at: { type: String },
    ip: { type: String },
  },
});
export const Holidays = new EntitySchema<{ date: string; name: string }>({
  name: 'Holiday',
  tableName: 'holidays',
  columns: { date: { type: String, primary: true }, name: { type: String } },
});
export const Settings = new EntitySchema<{ key: string; value: string }>({
  name: 'Setting',
  tableName: 'app_settings',
  columns: { key: { type: String, primary: true }, value: { type: String } },
});
const migrationSQL = [
  `CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,login TEXT NOT NULL UNIQUE,name TEXT NOT NULL,passwordHash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('MEMBER','LEAD')),hireDate TEXT NOT NULL)`,
  `CREATE TABLE attendances(id INTEGER PRIMARY KEY AUTOINCREMENT,userId INTEGER NOT NULL REFERENCES users(id),workDate TEXT NOT NULL,checkIn TEXT NOT NULL,checkOut TEXT,workSeconds INTEGER NOT NULL DEFAULT 0,late BOOLEAN NOT NULL,early BOOLEAN NOT NULL DEFAULT 0,manual BOOLEAN NOT NULL DEFAULT 0,mode TEXT NOT NULL,UNIQUE(userId,workDate))`,
  `CREATE TABLE requests(id INTEGER PRIMARY KEY AUTOINCREMENT,userId INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('ANNUAL','REMOTE','OFF','HOLIDAY')),date TEXT NOT NULL,reason TEXT NOT NULL,ip TEXT,startTime TEXT,endTime TEXT,createdAt TEXT NOT NULL,UNIQUE(userId,date))`,
  `CREATE TABLE balance_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,userId INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('ANNUAL','OFF')),amount INTEGER NOT NULL CHECK(amount IN (1,-1)),sourceKey TEXT NOT NULL UNIQUE,grantId INTEGER REFERENCES balance_entries(id),requestId INTEGER REFERENCES requests(id),grantedDate TEXT NOT NULL,expiresDate TEXT)`,
  `CREATE TABLE holidays(date TEXT PRIMARY KEY,name TEXT NOT NULL)`,
  `CREATE TABLE audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actorId INTEGER REFERENCES users(id),action TEXT NOT NULL,target TEXT NOT NULL,result TEXT NOT NULL,code TEXT NOT NULL,at TEXT NOT NULL,ip TEXT NOT NULL)`,
  `CREATE INDEX audit_actor_at ON audit_logs(actorId,at)`,
  `CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)`,
];
export class InitialSchema1760000000000 {
  name = 'InitialSchema1760000000000';
  async up(runner: any) {
    for (const sql of migrationSQL) await runner.query(sql);
  }
  async down(runner: any) {
    for (const table of [
      'app_settings',
      'audit_logs',
      'holidays',
      'balance_entries',
      'requests',
      'attendances',
      'users',
    ])
      await runner.query(`DROP TABLE ${table}`);
  }
}
class UnifiedLeave1760000001000 {
  name = 'UnifiedLeave1760000001000';
  async up(runner: import('typeorm').QueryRunner) {
    await runner.query('PRAGMA defer_foreign_keys = ON');
    await runner.query('ALTER TABLE requests RENAME TO requests_legacy');
    await runner.query(
      `CREATE TABLE requests(id INTEGER PRIMARY KEY AUTOINCREMENT,userId INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('ANNUAL','HALF_AM','HALF_PM','REMOTE','HOLIDAY')),date TEXT NOT NULL,reason TEXT NOT NULL,ip TEXT,startTime TEXT,endTime TEXT,createdAt TEXT NOT NULL,UNIQUE(userId,date))`,
    );
    await runner.query(
      `INSERT INTO requests SELECT id,userId,CASE WHEN kind='OFF' THEN 'HALF_PM' ELSE kind END,date,reason,ip,startTime,endTime,createdAt FROM requests_legacy`,
    );
    await runner.query('ALTER TABLE balance_entries RENAME TO balance_entries_legacy');
    await runner.query(
      `CREATE TABLE balance_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,userId INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('ANNUAL','HOLIDAY')),amount INTEGER NOT NULL CHECK(amount IN (2,1,-1,-2)),sourceKey TEXT NOT NULL UNIQUE,grantId INTEGER REFERENCES balance_entries(id),requestId INTEGER REFERENCES requests(id),grantedDate TEXT NOT NULL,expiresDate TEXT)`,
    );
    await runner.query(
      `INSERT INTO balance_entries SELECT id,userId,CASE WHEN kind='OFF' THEN 'HOLIDAY' ELSE kind END,amount*CASE WHEN kind='ANNUAL' THEN 2 ELSE 1 END,sourceKey,grantId,requestId,grantedDate,expiresDate FROM balance_entries_legacy ORDER BY id`,
    );
    await runner.query('DROP TABLE balance_entries_legacy');
    await runner.query('DROP TABLE requests_legacy');
    await runner.query(`UPDATE attendances SET mode='HALF_PM' WHERE mode='OFF'`);
  }
  async down() {
    throw new Error('Half-day data cannot be losslessly downgraded. Restore a database backup.');
  }
}
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
export function verifyPassword(password: string, hash: string): boolean {
  const [salt, key] = hash.split(':');
  return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(key, 'hex'));
}
export function publicUser(user: Account): User {
  const { passwordHash, ...safe } = user;
  return safe;
}
export async function createDatabase(path: string): Promise<DataSource> {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DataSource({
    type: 'better-sqlite3',
    database: path,
    entities: [Users, Attendances, Requests, Entries, Logs, Holidays, Settings],
    migrations: [InitialSchema1760000000000, UnifiedLeave1760000001000],
    migrationsRun: true,
    synchronize: false,
    prepareDatabase: (raw) => {
      raw.pragma('foreign_keys = ON');
      raw.pragma('journal_mode = WAL');
    },
  });
  await db.initialize();
  return db;
}
// 2026 월력요항: https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=202
export const HOLIDAYS: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-01': '노동절',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '부처님오신날 대체공휴일',
  '2026-06-03': '지방선거일',
  '2026-06-06': '현충일',
  '2026-07-17': '제헌절',
  '2026-08-15': '광복절',
  '2026-08-17': '광복절 대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '개천절 대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
};
export async function seed(manager: EntityManager) {
  if (!(await manager.count(Users))) {
    const passwordHash = hashPassword('demo1234');
    await manager.insert(Users, [
      { login: 'kim', name: '김근태', hireDate: '2026-01-01', role: 'MEMBER', passwordHash },
      { login: 'yeon', name: '연차원', hireDate: '2026-01-15', role: 'MEMBER', passwordHash },
      { login: 'im', name: '임자율', hireDate: '2026-02-12', role: 'MEMBER', passwordHash },
      { login: 'lead', name: '개발 리드', hireDate: '2026-01-01', role: 'LEAD', passwordHash },
    ]);
  }
  await manager.upsert(
    Holidays,
    Object.entries(HOLIDAYS).map(([date, name]) => ({ date, name })),
    ['date'],
  );
}
