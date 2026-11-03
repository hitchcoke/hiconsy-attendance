import { DataSource, EntityManager } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { Logs, Settings, Users, Requests, publicUser, verifyPassword } from './db';
import { dateOf, fail, normalizeIp, at, Calendar } from './rules';
import type { User } from '../shared/contracts';
export interface Context {
  user: User;
  now: Date;
  ip: string;
  m: EntityManager;
}
export class Platform {
  private tail: Promise<unknown> = Promise.resolve();
  sessions = new Map<string, { userId: number; expires: number }>();
  office: Set<string>;
  constructor(
    public db: DataSource,
    public demo: boolean,
    public calendar: Calendar,
    ips: string[],
  ) {
    this.office = new Set(ips.map(normalizeIp));
  }
  async serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => {});
    return result;
  }
  async now(m = this.db.manager): Promise<Date> {
    return this.demo
      ? new Date((await m.findOneByOrFail(Settings, { key: 'demoNow' })).value)
      : new Date();
  }
  async log(
    m: EntityManager,
    userId: number | null,
    action: string,
    target: string,
    result: string,
    code: string,
    now: Date,
    ip: string,
  ) {
    await m.insert(Logs, {
      actorId: userId,
      action,
      target,
      result,
      code,
      at: now.toISOString(),
      ip,
    });
  }
  async allowed(m: EntityManager, ip: string, now: Date, userId?: number): Promise<boolean> {
    if (this.office.has(ip)) return true;
    const requests = await m.findBy(Requests, { date: dateOf(now), ...(userId ? { userId } : {}) });
    return requests.some(
      (r) =>
        r.ip === ip &&
        r.startTime &&
        r.endTime &&
        now >= at(r.date, r.startTime) &&
        now <= at(r.date, r.endTime),
    );
  }
  async login(m: EntityManager, body: any, now: Date, ip: string) {
    if (
      typeof body?.login !== 'string' ||
      typeof body?.password !== 'string' ||
      body.password.length > 200
    )
      fail('LOGIN_FAILED', '아이디와 비밀번호를 확인해 주세요.', 401);
    const user = await m.findOneBy(Users, { login: body.login });
    if (!user || !verifyPassword(body.password, user.passwordHash))
      fail('LOGIN_FAILED', '아이디와 비밀번호를 확인해 주세요.', 401);
    const account = user!;
    if (!(await this.allowed(m, ip, now, account.id)))
      fail('IP_DENIED', '이 계정에 허용된 IP·시간대가 아닙니다.', 403);
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(token, { userId: account.id, expires: Date.now() + 8 * 3600000 });
    return { token, user: publicUser(account) };
  }
  async identity(m: EntityManager, token: string): Promise<User> {
    const session = this.sessions.get(token);
    if (!session || session.expires <= Date.now()) {
      this.sessions.delete(token);
      fail('UNAUTHORIZED', '다시 로그인해 주세요.', 401);
    }
    return publicUser(await m.findOneByOrFail(Users, { id: session!.userId }));
  }
}
