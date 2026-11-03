import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor !== 24 || nodeMinor < 11) {
  console.error(
    `현재 Node.js ${process.version}입니다. 이 프로젝트는 Node.js 24.11 이상(24.x)이 필요합니다.\n` +
      '다음 명령으로 실행해 주세요:\n' +
      'npx --yes --package=node@24 --package=npm@10.9.4 -- npm run dev',
  );
  process.exit(1);
}
const require = createRequire(import.meta.url),
  children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
function run(command, args, env = {}, persistent = false) {
  const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  if (persistent)
    child.on('exit', (code) => {
      if (!stopping) stop(code || 0);
    });
  return child;
}
async function assertFree(port) {
  await new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', () =>
      reject(new Error(`${port} 포트가 사용 중입니다. 기존 서버를 종료하세요.`)),
    );
    socket.listen(port, '127.0.0.1', () => socket.close(resolve));
  });
}
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) });
      return;
    } catch {
      if (stopping) throw new Error('개발 프로세스가 종료되었습니다.');
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`서버 시작 시간 초과: ${url}`);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
try {
  await Promise.all([assertFree(3000), assertFree(5173)]);
  await new Promise((resolve, reject) =>
    run(process.execPath, ['node_modules/typescript/lib/tsc.js', '-p', 'tsconfig.server.json']).on(
      'exit',
      (code) => (code === 0 ? resolve() : reject(new Error('서버 빌드 실패'))),
    ),
  );
  run(process.execPath, ['--env-file=.env.demo', '--watch', 'dist/server/main.js'], {}, true);
  run(
    process.execPath,
    ['node_modules/typescript/lib/tsc.js', '-p', 'tsconfig.server.json', '--watch'],
    {},
    true,
  );
  run(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {}, true);
  await Promise.all([ready('http://127.0.0.1:3000/api/clock'), ready('http://127.0.0.1:5173')]);
  run(require('electron'), ['.'], { VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' }, true);
} catch (error) {
  console.error(error.message);
  stop(1);
}
