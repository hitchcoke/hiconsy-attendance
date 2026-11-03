import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { createApp } = require('../dist/server/app.js');
const { _electron } = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.UI_TEST_PORT || 3000);
const apiPattern = `http://127.0.0.1:${port}/api/**`;
const temp = mkdtempSync(path.join(tmpdir(), 'hiconsy-ui-'));
const artifacts = path.join(root, 'artifacts', process.env.ELECTRON_EXECUTABLE ? 'packaged' : 'ui');
mkdirSync(artifacts, { recursive: true });
let server = await createApp({ path: path.join(temp, 'test.sqlite'), demo: true });
let desktop;
const checks = [];
try {
  await server.app.listen(port, '127.0.0.1');
  desktop = await _electron.launch({
    executablePath: process.env.ELECTRON_EXECUTABLE || require('electron'),
    args: process.env.ELECTRON_EXECUTABLE ? [] : [root],
    cwd: root,
  });
  let page = await desktop.firstWindow();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const screenshot = async (name) => {
    await page.waitForFunction(() => !document.querySelector('.el-message'));
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      );
    });
    const bytes = await desktop.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return (await win.capturePage()).resize({ width: win.getContentSize()[0] }).toPNG();
    });
    writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(bytes));
  };
  const login = async (account) => {
    await page.getByRole('button', { name: account }).click();
    await page.getByRole('button', { name: /^로그인/ }).click();
    await page.locator('.balance-grid').waitFor();
  };
  const logout = () => page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.locator('#password').fill('wrong');
  await page.getByRole('button', { name: /^로그인/ }).click();
  await page.getByRole('alert').filter({ hasText: '아이디와 비밀번호' }).waitFor();
  await screenshot('login');
  await login('김근태 팀원 · kim');
  assert.equal(await page.getByRole('link', { name: '팀 현황', exact: true }).count(), 0);
  await page.getByRole('button', { name: '출근하기' }).click();
  await page.getByText('근무 중', { exact: true }).waitFor();
  await screenshot('today');
  checks.push('로그인 오류/샘플 계정/팀원 메뉴/출근');
  await page.getByRole('link', { name: '신청', exact: true }).click();
  await page.getByRole('button', { name: '새 신청', exact: true }).click();
  await page.locator('#request-date').fill('2026-03-13');
  await page.locator('#request-reason').fill('개인 일정으로 연차를 사용합니다.');
  await page.getByRole('button', { name: '승인 요청', exact: true }).click();
  await page.getByRole('cell', { name: '2026-03-13', exact: true }).waitFor();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await screenshot('requests');
  assert.match(await page.locator('.balance-grid').innerText(), /예약 1일/);
  await page.locator('.balance-card').first().click();
  await page.getByRole('heading', { name: '지급·사용 내역' }).waitFor();
  await page.getByRole('dialog').getByRole('button').first().click();
  checks.push('연차 승인 요청/대기 상태/예약 차감/지급사용 내역');
  for (const [label, date] of [
    ['오전 반차 · 0.5일', '2026-03-16'],
    ['오후 반차 · 0.5일', '2026-03-17'],
  ]) {
    await page.getByRole('button', { name: '새 신청', exact: true }).click();
    await page.getByRole('dialog').getByText(label, { exact: true }).click();
    assert.equal(await page.getByRole('radio', { name: label, exact: true }).isChecked(), true);
    await page.locator('#request-date').fill(date);
    await page.locator('#request-reason').fill(label);
    await screenshot(label.startsWith('오전') ? 'half-am-form' : 'half-pm-form');
    await page.getByRole('button', { name: '승인 요청', exact: true }).click();
    await page.getByRole('cell', { name: date, exact: true }).waitFor();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  assert.match(await page.locator('.balance-grid').innerText(), /예약 2일/);
  assert.match(await page.locator('.balance-card').first().innerText(), /0일/);
  assert.match(await page.locator('.el-table:visible').innerText(), /오전 반차/);
  assert.match(await page.locator('.el-table:visible').innerText(), /오후 반차/);
  await screenshot('requests');
  checks.push('연차 통합/오전·오후 반차 선택/각 0.5일 차감/점심 기준 표시');

  await logout();
  await login('개발 리드 리드 · lead');
  await page.getByRole('link', { name: '휴가 승인', exact: true }).click();
  await page.getByRole('tab', { name: '승인 대기 (3)', exact: true }).waitFor();
  await screenshot('approvals-pending');
  const reviewLeave = async (date, reject = false) => {
    await page
      .getByRole('row')
      .filter({ hasText: date })
      .getByRole('button', { name: '검토', exact: true })
      .click();
    await page.getByRole('dialog', { name: '휴가 신청 검토' }).waitFor();
    if (reject) {
      await page.getByRole('button', { name: '반려', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '반려 사유를 입력해 주세요.' }).waitFor();
      await page.locator('#review-note').fill('팀 일정 조정 후 다시 신청해 주세요.');
      await screenshot('approval-reject');
    }
    await page.getByRole('button', { name: reject ? '반려' : '승인', exact: true }).click();
    await page
      .getByRole('button', { name: reject ? '반려 처리' : '승인 처리', exact: true })
      .click();
    await page.getByRole('dialog', { name: '휴가 신청 검토' }).waitFor({ state: 'hidden' });
  };
  await reviewLeave('2026-03-13');
  await reviewLeave('2026-03-16', true);
  await reviewLeave('2026-03-17');
  await page.getByText('해당 상태의 휴가 신청이 없습니다.').waitFor();
  await logout();
  await login('김근태 팀원 · kim');
  assert.match(await page.locator('.balance-card').first().innerText(), /0.5일/);
  await page.getByRole('link', { name: '신청', exact: true }).click();
  const rejected = page.getByRole('row').filter({ hasText: '2026-03-16' });
  assert.match(await rejected.innerText(), /반려/);
  assert.match(await rejected.innerText(), /팀 일정 조정 후 다시 신청/);
  await screenshot('requests-reviewed');
  await page.getByRole('button', { name: '새 신청', exact: true }).click();
  await page.getByRole('dialog').getByText('오전 반차 · 0.5일', { exact: true }).click();
  await page.locator('#request-date').fill('2026-03-16');
  await page.locator('#request-reason').fill('일정 조정 후 재신청');
  await page.getByRole('button', { name: '승인 요청', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('row').filter({ hasText: '2026-03-16' }).count(), 2);
  await logout();
  await login('개발 리드 리드 · lead');
  await page.getByRole('link', { name: '휴가 승인', exact: true }).click();
  await page.getByRole('tab', { name: '승인 대기 (1)', exact: true }).waitFor();
  await reviewLeave('2026-03-16');
  await page.getByRole('tab', { name: '승인 (3)', exact: true }).click();
  await screenshot('approvals-approved');
  checks.push('승인 대기/리드 승인/반려 사유 검증/잔여 반환/같은 날 재신청/처리 결과');
  await page.getByRole('link', { name: '팀 현황', exact: true }).click();
  await page.locator('.team-stats').waitFor();
  await screenshot('team');
  await page.getByRole('row').filter({ hasText: '김근태' }).click();
  await page.getByRole('heading', { name: '김근태', exact: true }).waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /09:00/);
  await page.getByRole('dialog').getByRole('button').first().click();
  await page.getByRole('tab', { name: '신청 현황', exact: true }).click();
  await page.getByRole('tab', { name: /미기록 · 직접 입력/ }).click();
  await page.getByRole('tab', { name: '팀 보드', exact: true }).click();
  checks.push('리드 팀 보드/팀원 상세/세 가지 탭');
  await page.getByRole('button', { name: '시각 변경 →' }).click();
  await page.locator('#demo-time').fill('2026-03-12T18:00');
  await page.getByRole('button', { name: '시각 적용' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await logout();
  await login('김근태 팀원 · kim');
  await page.getByRole('button', { name: '퇴근하기' }).click();
  await page.getByRole('button', { name: '계속 근무', exact: true }).click();
  await page.getByRole('button', { name: '퇴근하기' }).click();
  await page.getByRole('button', { name: '퇴근 등록', exact: true }).click();
  await page.getByText('퇴근 완료', { exact: true }).waitFor();
  assert.match(await page.locator('.work-clock').innerText(), /8시간 0분/);
  await page.getByRole('link', { name: '내 근태', exact: true }).click();
  await page.getByRole('row').filter({ hasText: '2026-03-12' }).click();
  await page.getByRole('heading', { name: '2026-03-12', exact: true }).waitFor();
  await screenshot('history');
  await page.getByRole('dialog').getByRole('button').first().click();
  checks.push('시연 시각/퇴근 취소 및 확정/8시간 계산/근태 상세');
  await page.route(apiPattern, (route) => route.abort());
  await page.reload();
  await page.getByRole('heading', { name: '연결을 확인해 주세요' }).waitFor();
  await screenshot('connection-error');
  await page.unroute(apiPattern);
  await page.getByRole('button', { name: '다시 연결' }).click();
  await page.getByRole('link', { name: '오늘', exact: true }).click();
  await page.locator('.balance-grid').waitFor();
  checks.push('연결 실패/재연결/기존 로그인 유지');
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 680));
  await page.getByRole('link', { name: '신청', exact: true }).click();
  await page.getByRole('cell', { name: '2026-03-13', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot('minimum-window');
  checks.push('최소 창 860×680 가로 넘침 없음');
  await server.close();
  await page.reload();
  await page.getByRole('heading', { name: '연결을 확인해 주세요' }).waitFor();
  server = await createApp({ path: path.join(temp, 'test.sqlite'), demo: true });
  await server.app.listen(port, '127.0.0.1');
  await page.getByRole('button', { name: '다시 연결' }).click();
  await page.locator('#password').waitFor();
  await login('김근태 팀원 · kim');
  await page.getByText('퇴근 완료', { exact: true }).waitFor();
  assert.match(await page.locator('.balance-card').first().innerText(), /0일/);
  checks.push('실제 서버 종료·재시작/재로그인/근태·잔여·시연 시각 보존');
  await desktop.close();
  desktop = await _electron.launch({
    executablePath: process.env.ELECTRON_EXECUTABLE || require('electron'),
    args: process.env.ELECTRON_EXECUTABLE ? [] : [root],
    cwd: root,
  });
  page = await desktop.firstWindow();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('.balance-grid, #password').first().waitFor();
  if (await page.locator('#password').isVisible()) await login('김근태 팀원 · kim');
  await page.getByText('퇴근 완료', { exact: true }).waitFor();
  checks.push('앱 종료·재실행/저장된 오늘 상태 복원');
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(artifacts, 'report.json'),
    JSON.stringify({ passed: true, checks, pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, checks, artifacts }, null, 2));
} finally {
  if (desktop) await desktop.close();
  await server.close();
  rmSync(temp, { recursive: true, force: true });
}
