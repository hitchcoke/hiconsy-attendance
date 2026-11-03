# Task 실행·인계

모든 Task는 완료했다. 이후 변경은 해당 명세·공통 계약·선행 완료 기록을 읽고 새 기능 브랜치에서 진행한다. 이 폴더의 인계 기록은 당시 결과이며, T12/T13에서 후속 검증을 마쳤다. 초기 OFF 용어는 **T15 연차 통합**, 승인 제외 기록은 **T17 휴가 승인** 변경을 따른다.

| Task | 선행 | 주요 파일·소유 범위 | 사용자 동작 / 완료 기준 |
|---|---|---|---|
| [T00](T00.md) 명세 | 없음 | docs/spec.md | 화면·권한·규칙과 요구사항 대응 확정 |
| [T01](T01.md) 계약 | T00 | docs/contracts.md, src/shared/contracts.ts | 요청·응답·오류·DB 제약을 공유 |
| [T02](T02.md) 기반 | T01 | package.json, electron/, src/server/db.ts·platform.ts·app.ts·main.ts, scripts/dev.mjs | 단일 실행, DB 생성·시계·이력 기반 |
| [T03](T03.md) 로그인 | T02 | src/server/gateway.ts, src/ui/App.vue·router.ts·store.ts·api.ts, pages/Login.vue | 샘플 로그인·역할 메뉴·권한·실패 안내 |
| [T04](T04.md) 출퇴근 | T03, T06 | src/server/attendance.ts·rules.ts, pages/Today.vue | 버튼 저장·새로고침·시간/중복 제한 |
| [T05](T05.md) 보정 | T04 | src/server/history.ts, pages/History.vue | 누락 퇴근 보정·다음 출근·본인 목록/상세 |
| [T06](T06.md) 잔여 | T03 | src/server/balances.ts, components/BalanceCards.vue | 입사일 적립·잔여·만료 근거, 중복 지급 방지 |
| [T07](T07.md) 신청 | T06 | src/server/requests.ts, pages/Requests.vue | 폼·마감·한도·원자적 신청/차감 |
| [T08](T08.md) 연결 | T04~T07 | src/server/attendance.ts·platform.ts, tests/work-access.test.ts | 재택/휴일 IP·시간대·휴일 보상·보정 연결 |
| [T09](T09.md) 팀 | T04~T08 | src/server/team.ts, pages/Team.vue | 리드 날짜별 상태·신청·미기록·상세 |
| [T10](T10.md) 이력 | T09 | src/server/gateway.ts·history.ts, src/ui/format.ts | 성공/실패 이력과 읽기 쉬운 상세 표시 |
| [T11](T11.md) 시연 | T10 | src/server/demo.ts·cli.ts, components/DemoPanel.vue, .env.demo | 리드 시각 변경·초기화·재시작 보존 |
| [T12](T12.md) 통합 UI | T11 | src/ui/, scripts/ui-smoke.mjs, docs/qa.md | 오류·빈 상태·키보드·창 크기·연속 시나리오 |
| [T15](T15.md) 반차 변경 | T12 | 계약·DB 마이그레이션·규칙·신청/잔여/근태 UI | 통합 연차, 오전/오후 각 0.5일, 점심 경계 |
| [T13](T13.md) 패키징 | T12, T15 | forge.config.cjs, electron/, vite.config.mts, 실행·검증 스크립트 | macOS 패키지 실제 실행·서버/앱 재시작 |
| [T14](T14.md) 제출 문서 | T13 | README, docs/, .github/workflows/, scripts/export-history.mjs | 실행·시연·FR·Git 기록 공개 |
| [T16](T16.md) 실행 환경 | T13 | scripts/dev.mjs, README | Node 21 오류 안내·Node 24 실행 확인 |
| [T17](T17.md) 휴가 승인 | T15/T16 | 서버 승인·원장·DB, 신청/승인 UI | 승인 대기·승인·반려·잔여 반환·재신청 |

파일 표의 `pages/`와 `components/`는 `src/ui/` 아래다. 정확한 변경 목록은 [Git 이력](../history.md)과 커밋 diff를 확인한다. T06/T07은 오늘 화면에 필요한 잔여·신청 계약을 먼저 연결하기 위해 T04보다 먼저 구현했다. 요청 변경 T15는 T12 이후, 패키징 전에 진행했다.

## 작업 절차

1. `docs/spec.md`, `docs/contracts.md`, 해당 Task와 선행 Task 완료 기록만 읽는다.
2. `main`에서 `task/Txx-name` 브랜치를 만든다. 정책 변경은 명세·계약을 먼저 수정한다.
3. 기능 단위로 커밋하고 관련 API·화면을 검증한다. Task 기록에 실제 결과와 제한을 남긴다.
4. 검증 후 `main`에 `--no-ff` 병합한다. 기능 커밋과 병합 커밋을 모두 원격으로 보낸다.
5. `npm run history:export`로 실제 SHA·부모·브랜치·병합 정보를 갱신한다. 기록을 위해 날짜나 과거 커밋을 조작하지 않는다.

공통 제외 범위는 관리자·사용자 정책 편집·PDF·월 정산이다. 별도 대화는 자동 생성하지 않는다.
