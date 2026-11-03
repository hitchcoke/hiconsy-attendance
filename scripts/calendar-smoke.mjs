import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { createApp } = require('../dist/server/app.js');
const { Attendances } = require('../dist/server/db.js');
const { _electron } = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'hiconsy-calendar-'));
const artifacts = path.join(root, 'artifacts/calendar');
mkdirSync(artifacts, { recursive: true });
const server = await createApp({ path: path.join(temp, 'test.sqlite'), demo: true });
let desktop;
const checks = [],
  errors = [];
try {
  await server.app.listen(0, '127.0.0.1');
  const port = server.app.getHttpServer().address().port;
  const base = `http://127.0.0.1:${port}/api`;
  const renderer = path.join(temp, 'renderer');
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', renderer], {
    cwd: root,
    env: { ...process.env, VITE_API_URL: base },
    stdio: 'pipe',
  });
  await server.db.manager.insert(Attendances, [
    {
      userId: 1,
      workDate: '2026-03-10',
      checkIn: '2026-03-10T01:01:00Z',
      checkOut: '2026-03-10T07:00:00Z',
      workSeconds: 17940,
      mode: 'OFFICE',
      late: true,
      early: true,
      manual: true,
    },
    {
      userId: 2,
      workDate: '2026-03-11',
      checkIn: '2026-03-11T00:00:00Z',
      mode: 'OFFICE',
      late: false,
      early: false,
      manual: false,
    },
  ]);
  desktop = await _electron.launch({
    executablePath: require('electron'),
    args: [root],
    cwd: root,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: pathToFileURL(path.join(renderer, 'index.html')).href,
    },
  });
  const page = await desktop.firstWindow();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(e.message));
  const settle = () =>
    page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
  const screenshot = async (name) => {
    await page.waitForFunction(() => !document.querySelector('.el-message'));
    await settle();
    const bytes = await desktop.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return (await w.capturePage()).resize({ width: w.getContentSize()[0] }).toPNG();
    });
    writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(bytes));
  };
  const login = async (account) => {
    await page.getByRole('button', { name: account }).click();
    await page.getByRole('button', { name: /^로그인/ }).click();
    await page.locator('.balance-grid').waitFor();
  };
  const logout = () => page.getByRole('button', { name: '로그아웃', exact: true }).click();
  const calendar = async () => {
    await page.getByRole('link', { name: '캘린더', exact: true }).click();
    await page.locator('.calendar-panel').waitFor();
  };
  const day = (date) => page.locator(`[data-date="${date}"]`);
  const detail = async (date) => {
    await day(date).click();
    await page.getByRole('dialog').waitFor();
    await page.waitForFunction(() => {
      const el = document.querySelector('.calendar-detail');
      return el && getComputedStyle(el).transform === 'none';
    });
    await settle();
  };
  const closeDetail = async () => {
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  };
  const changeMonth = async (month) => {
    await page.getByLabel('조회 월', { exact: true }).fill(month);
    await page.getByLabel('조회 월', { exact: true }).dispatchEvent('change');
    await day(month + '-01').waitFor();
  };
  const fit = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    const viewport = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    assert.ok(
      box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.w &&
        box.y + box.height <= viewport.h,
      `${selector} outside viewport: ${JSON.stringify(box)}`,
    );
  };
  const requestFromDay = async (date, period) => {
    await detail(date);
    await page.getByRole('button', { name: '이 날짜로 신청', exact: true }).click();
    await page.locator('#request-date').waitFor();
    assert.equal(await page.locator('#request-date').inputValue(), date);
    if (period) await page.getByRole('dialog').getByText(period, { exact: true }).click();
    await page.locator('#request-reason').fill('캘린더 테스트 ' + date);
    await page.getByRole('button', { name: '승인 요청', exact: true }).click();
    await page.locator('.calendar-panel').waitFor();
    await page.getByRole('dialog').getByText('승인 대기', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: date, exact: true }).count(), 1);
    await closeDetail();
  };
  const review = async (reject) => {
    await page.getByRole('link', { name: '휴가 승인', exact: true }).click();
    await page
      .getByRole('row')
      .filter({ hasText: '2026-03-13' })
      .getByRole('button', { name: '검토' })
      .click();
    if (reject) await page.locator('#review-note').fill('일정 조정 후 반차로 재신청');
    await page.getByRole('button', { name: reject ? '반려' : '승인', exact: true }).click();
    await page
      .getByRole('button', { name: reject ? '반려 처리' : '승인 처리', exact: true })
      .click();
    await page.getByRole('dialog', { name: '휴가 신청 검토' }).waitFor({ state: 'hidden' });
  };

  await login('김근태 팀원 · kim');
  await page.getByRole('button', { name: '출근하기' }).click();
  await page.getByText('근무 중', { exact: true }).waitFor();
  await calendar();
  assert.equal(await page.getByLabel('조회 월', { exact: true }).inputValue(), '2026-03');
  assert.equal(await page.locator('button.calendar-day').count(), 31);
  assert.equal(await page.getByLabel('캘린더 사용자').count(), 0);
  assert.equal(await day('2026-03-12').getAttribute('aria-current'), 'date');
  assert.match(await day('2026-03-02').innerText(), /대체공휴일/);
  assert.match(await day('2026-03-12').innerText(), /근무 중/);
  await fit('.calendar-panel');
  await detail('2026-03-10');
  assert.match(await page.getByRole('dialog').innerText(), /지각[\s\S]*조퇴[\s\S]*직접 입력/);
  assert.match(await page.getByRole('dialog').innerText(), /4시간 59분/);
  assert.equal(await page.getByRole('button', { name: '이 날짜로 신청' }).isDisabled(), true);
  await closeDetail();
  checks.push('서버 현재 월/공휴일/오늘/근무 중/완료·지각·조퇴·직접 입력/마감 안내/기본 창');

  await requestFromDay('2026-03-13');
  assert.match(await day('2026-03-13').innerText(), /연차 · 대기/);
  await detail('2026-03-13');
  assert.equal(await page.getByRole('button', { name: '이 날짜로 신청' }).isDisabled(), true);
  await closeDetail();
  checks.push('날짜→연차 폼 미리 입력→승인 요청→같은 날짜 복귀/중복 신청 비활성');

  await logout();
  await login('개발 리드 리드 · lead');
  await calendar();
  await page.getByLabel('캘린더 사용자').selectOption('1');
  await page.locator('.calendar-panel[aria-label="김근태 2026-03 캘린더"]').waitFor();
  await detail('2026-03-13');
  assert.match(await page.getByRole('dialog').innerText(), /승인 대기/);
  assert.equal(await page.getByRole('button', { name: '이 날짜로 신청' }).isDisabled(), true);
  await closeDetail();
  await page.getByLabel('캘린더 사용자').selectOption('2');
  await page.locator('.calendar-panel[aria-label="연차원 2026-03 캘린더"]').waitFor();
  assert.match(await day('2026-03-11').innerText(), /퇴근 미기록/);
  await page.getByLabel('캘린더 사용자').selectOption('4');
  await page.locator('.calendar-panel[aria-label="개발 리드 2026-03 캘린더"]').waitFor();
  checks.push('리드 본인↔팀원 선택/신청 상태 일치/타인 신청 비활성/이전 날짜 퇴근 미기록');
  await review(true);
  await logout();
  await login('김근태 팀원 · kim');
  await calendar();
  await detail('2026-03-13');
  assert.match(await page.getByRole('dialog').innerText(), /반려[\s\S]*일정 조정 후 반차로 재신청/);
  assert.equal(await page.getByRole('button', { name: '이 날짜로 신청' }).isEnabled(), true);
  await closeDetail();
  await requestFromDay('2026-03-13', '오전 반차 · 0.5일');
  await logout();
  await login('개발 리드 리드 · lead');
  await review(false);
  await logout();
  await login('김근태 팀원 · kim');
  await calendar();
  await detail('2026-03-13');
  assert.equal(await page.locator('.calendar-request').count(), 2);
  assert.match(await page.locator('.calendar-request').first().innerText(), /오전 반차[\s\S]*승인/);
  assert.match(await page.locator('.calendar-request').last().innerText(), /연차[\s\S]*반려/);
  await screenshot('calendar-detail');
  await closeDetail();
  await requestFromDay('2026-03-16', '오후 반차 · 0.5일');
  assert.match(await day('2026-03-16').innerText(), /오후 반차 · 대기/);
  checks.push('반려 결과·사유/오전 반차 재신청·승인/반려 이력 보존/오후 반차 대기 구분');

  await detail('2026-03-14');
  await page.getByRole('button', { name: '이 날짜로 신청' }).click();
  assert.equal(await page.locator('#request-date').inputValue(), '2026-03-14');
  await page.locator('#request-ip').waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /휴일 근무/);
  await page.locator('#request-reason').fill('휴일 업무');
  await page.getByRole('button', { name: '신청 확정', exact: true }).click();
  await page.locator('.calendar-panel').waitFor();
  await page.getByRole('dialog').getByText('승인', { exact: true }).waitFor();
  await closeDetail();
  const auth = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'kim', password: 'demo1234' }),
  }).then((r) => r.json());
  const remote = await fetch(base + '/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({
      kind: 'REMOTE',
      date: '2026-03-17',
      reason: '재택 표시 fixture',
      ip: '127.0.0.1',
      startTime: '07:00',
      endTime: '20:00',
    }),
  });
  assert.equal(remote.status, 201);
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await day('2026-03-17').getByText('재택근무 · 승인', { exact: true }).waitFor();
  await screenshot('calendar');
  checks.push('휴일 날짜 기본 종류·확정 후 복귀/재택 승인 표시');

  await detail('2026-03-18');
  await page.getByRole('button', { name: '이 날짜로 신청' }).click();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '← 캘린더로 돌아가기', exact: true }).click();
  await page.getByRole('dialog').getByText('신청 내역이 없습니다.').waitFor();
  await closeDetail();
  checks.push('신청 폼 닫기·캘린더 복귀/빈 날짜 상세');

  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await day('2026-04-30').waitFor();
  await page.getByRole('button', { name: '이전 달', exact: true }).click();
  await day('2026-03-31').waitFor();
  await changeMonth('2026-02');
  assert.equal(await page.locator('button.calendar-day').count(), 28);
  await changeMonth('2026-01');
  assert.equal(await page.getByRole('button', { name: '이전 달' }).isDisabled(), true);
  await changeMonth('2026-12');
  assert.equal(await page.getByRole('button', { name: '다음 달' }).isDisabled(), true);
  await page.getByRole('button', { name: '이번 달', exact: true }).click();
  await day('2026-03-12').waitFor();
  checks.push('이전·다음·월 선택·이번 달/2월 28일/1월·12월 경계');

  let release, seen, done;
  const observed = new Promise((resolve) => (seen = resolve)),
    completed = new Promise((resolve) => (done = resolve));
  const pattern = '**/calendar?month=2026-04*';
  await page.route(pattern, async (route) => {
    seen();
    await new Promise((resolve) => (release = resolve));
    await route.continue().catch(() => {});
    done();
  });
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await observed;
  await changeMonth('2026-02');
  release();
  await completed;
  await page.unroute(pattern);
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByLabel('조회 월', { exact: true }).inputValue(), '2026-02');
  assert.equal(await page.locator('button.calendar-day').count(), 28);
  checks.push('이전 월 응답 지연·응답 순서 역전 시 최신 월 유지');

  await page.route('**/calendar?*', (route) => route.abort());
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '서버에 연결할 수 없습니다.' }).waitFor();
  assert.equal(await page.locator('.calendar-panel').count(), 0);
  await screenshot('calendar-offline');
  await page.unroute('**/calendar?*');
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await day('2026-02-28').waitFor();
  await page.getByRole('button', { name: '이번 달', exact: true }).click();
  await day('2026-03-12').waitFor();
  checks.push('연결 실패 안내/오래된 달력 숨김/새로고침 복구');

  await day('2026-03-12').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator(':focus').getAttribute('data-date'), '2026-03-13');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator(':focus').getAttribute('data-date'), '2026-03-20');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: '2026-03-12', exact: true }).waitFor();
  await closeDetail();
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 680));
  await fit('.calendar-panel');
  await fit('.calendar-toolbar');
  await screenshot('calendar-minimum');
  await detail('2026-03-13');
  assert.match(await day('2026-03-13').innerText(), /\+1건/);
  await fit('.calendar-detail .el-button--primary');
  await fit('.calendar-apply');
  await screenshot('calendar-detail-minimum');
  await closeDetail();
  await detail('2026-03-18');
  await fit('.calendar-detail .el-button--primary');
  await closeDetail();
  await logout();
  await login('개발 리드 리드 · lead');
  await calendar();
  await page.getByLabel('캘린더 사용자').selectOption('1');
  await page.locator('.calendar-panel[aria-label="김근태 2026-03 캘린더"]').waitFor();
  await fit('.calendar-panel');
  await fit('.calendar-toolbar');
  await screenshot('calendar-lead-minimum');
  checks.push('방향키·Enter·Escape/860×680 달력 전체·상세 신청 버튼/다중 이력 더보기/리드 필터');

  assert.deepEqual(errors, []);
  const report = {
    at: new Date().toISOString(),
    runtime: 'macOS Electron / production renderer',
    checks,
    errors,
    fixtures:
      '임시 SQLite에 과거 완료·미기록 근태 2건, 재택 신청 HTTP fixture. 출근·연차·반차·휴일 신청·승인·반려는 실제 UI 입력.',
    isolation: '사용 가능한 임시 포트·DB·렌더러, 사용자 실행 환경과 분리',
  };
  writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  writeFileSync(
    path.join(artifacts, 'failure.json'),
    JSON.stringify({ checks, errors, message: String(error) }, null, 2),
  );
  throw error;
} finally {
  if (desktop) await desktop.close();
  await server.close();
  rmSync(temp, { recursive: true, force: true });
}
