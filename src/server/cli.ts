import { createDatabase, seed, Settings } from './db';
import { existsSync, unlinkSync } from 'node:fs';
const path = process.env.DB_PATH || 'data/attendance.sqlite';
async function main() {
  if (process.argv[2] === 'reset') {
    if (process.env.DEMO_MODE !== 'true' || !path.endsWith('demo.sqlite'))
      throw new Error('초기화는 시연 전용 demo.sqlite에만 허용합니다. 먼저 서버를 종료하세요.');
    for (const suffix of ['', '-wal', '-shm'])
      if (existsSync(path + suffix)) unlinkSync(path + suffix);
  }
  const db = await createDatabase(path);
  await db.transaction(seed);
  if (
    process.env.DEMO_MODE === 'true' &&
    !(await db.manager.findOneBy(Settings, { key: 'demoNow' }))
  )
    await db.manager.insert(Settings, {
      key: 'demoNow',
      value: new Date(process.env.DEMO_NOW || '2026-03-12T09:00:00+09:00').toISOString(),
    });
  await db.destroy();
  console.log(`DB 준비 완료: ${path}`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
