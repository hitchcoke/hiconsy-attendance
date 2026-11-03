# DB / API 계약

## 데이터
- users: id, login(unique), passwordHash, name, role(MEMBER/LEAD), hireDate.
- attendances: id, userId(FK), workDate, checkIn, checkOut(nullable), workSeconds, late, early, manual, mode. unique(userId,workDate).
- requests: id, userId(FK), kind(ANNUAL/HALF_AM/HALF_PM/REMOTE/HOLIDAY), date, reason, ip/startTime/endTime(nullable), createdAt, status, reviewedBy, reviewedAt, reviewNote. 대기·승인 상태에만 unique(userId,date) 적용.
- balance_entries: id, userId(FK), kind(ANNUAL/HOLIDAY), amount(+지급/-사용, 정수 1단위=0.5일), sourceKey(unique), grantId(nullable FK), requestId(nullable FK), grantedDate, expiresDate(nullable).
- holidays: date(PK), name. 초기 목록의 지원 연도 밖 날짜는 명시적 오류.
- audit_logs: id, actorId(nullable FK), action, target, result, code, at, ip. 요청 본문·비밀번호·토큰 저장 금지.
- app_settings: key(PK), value. 시연 시각 보존.

날짜 YYYY-MM-DD(KST), 시각 UTC ISO 문자열, 정수 초로 근무시간 보존. 요청 쓰기는 단일 서버의 쓰기 큐와 SQLite 트랜잭션에서 검증부터 완료까지 처리한다. 단일 서버 프로세스 운영.

## API (/api)
POST /auth/login {login,password} → {token,user}; POST /auth/logout; GET /me.
GET /clock → {now,demo}; POST /demo/clock {now:offset포함ISO} → 리드·시연 전용.
GET /today → 사용자, 시각, 오늘근태, 당일신청, 미기록, 잔여, 버튼가능여부·사유.
POST /attendance/check-in; POST /attendance/check-out; POST /attendance/:id/correct {checkOut:offset포함ISO}.
GET /attendance?from&to → 본인 근태; GET /attendance/:id → 본인 또는 리드, 관련 이력 포함.
GET /balances → 통합 연차/예약 일수/재택 요약 및 지급사용내역.
GET /requests → 본인 신청; POST /requests {kind,date,reason,ip?,startTime?,endTime?}.
GET /request-options?date → 서버 계산 마감, 영업일 여부.
GET /team?date → 리드 전용 팀 현황, 신청, 미기록, 직접입력.
GET /team/:id?from&to → 리드 전용 팀원 근태/신청/이력.
모든 업무 API는 Bearer 세션 토큰. 미로그인 진입은 연구실 또는 유효한 신청 IP에서만 허용하며 로그인 후 소유자를 재검사한다.

오류: {code,message}, 상태 400 입력/규칙, 401 인증, 403 IP/권한, 404 없음, 409 중복/잔여/미기록. 반환 타입은 src/shared/contracts.ts가 코드 기준이다.

## T15 변경
신청 종류 HALF_AM/HALF_PM 추가, OFF 제거. Balances는 annual(통합 잔여 일수), reservedDays, remote, expiring[{date,days}], entries를 반환한다. 원장 amount는 정수 반일 단위. 월 적립 +2, 휴일 보상 +1, 하루 사용 -2, 반차 -1. 여러 적립분을 사용할 때 requestId에 여러 차감 행이 연결된다. 기존 OFF 개발 신청은 HALF_PM으로 이관하고 과거 계산 결과는 보존한다.

## 응답·조회 범위

공통 타입의 정확한 필드는 `src/shared/contracts.ts`를 기준으로 한다. 로그인 성공은 `{token, user}`, 로그아웃 성공은 `{ok: true}`다. 근태 쓰기는 저장한 `Attendance`, 신청 쓰기는 `WorkRequest`를 반환한다. 목록은 배열이며 페이지 분할은 구현하지 않았다.

- `/attendance`는 본인 기록만 `from`~`to`(양끝 포함)로 조회한다. 상세는 본인 또는 리드가 조회하고, 보정은 본인에게만 허용한다.
- `/requests`는 본인의 전체 신청, `/balances`는 본인 통합 잔여/원장을 반환한다.
- `/team`은 선택일 팀원별 `User`, 근태, 신청, 상태와 미기록/직접 입력 목록을 반환한다. `/team/:id`는 해당 사용자의 기간별 근태·신청과 최근 이력 30건이다.
- `/today`는 `Today`, `/team`은 `TeamData`, `/attendance/:id`는 `AttendanceDetail`, `/team/:id`는 `MemberDetail` 타입이다.
- 프론트는 서버의 `ActionState.enabled/reason`과 판정값을 표시한다. API가 반환한 오류 메시지를 그대로 안내한다.

## 주요 오류 코드

| HTTP | 코드 | 처리 |
|---|---|---|
| 400 | INVALID_DATE, INVALID_TIME, INVALID_RANGE, INVALID_ID, INVALID_IP, INVALID_KIND, INVALID_REASON, INVALID_WINDOW | 입력 수정 |
| 400 | DEADLINE_PASSED, BEFORE_HIRE, CALENDAR_UNSUPPORTED | 신청일/지원 범위 확인 |
| 400 | TOO_EARLY, MORNING_LEAVE, AFTERNOON_LEAVE, ANNUAL_DAY, HOLIDAY_REQUEST_REQUIRED | 현재 업무 조건 표시 |
| 400 | NOT_CHECKED_IN, NOT_MISSING_DAY, INVALID_CHECKOUT | 근태·보정 조건 확인 |
| 401 | LOGIN_FAILED, UNAUTHORIZED | 로그인 안내 |
| 403 | IP_DENIED, WORK_IP_MISMATCH, WORK_WINDOW, FORBIDDEN, DEMO_DISABLED | IP/시간대/권한 제한 안내 |
| 404 | NOT_FOUND | 해당 기록 없음 |
| 409 | ALREADY_CHECKED_IN, ALREADY_CHECKED_OUT, MISSING_CHECKOUT, DUPLICATE_REQUEST | 기존 상태 새로고침 또는 누락 보정 |
| 409 | INSUFFICIENT_BALANCE, REMOTE_LIMIT | 잔여/한도 안내 |
| 500 | INTERNAL_ERROR | 일반 오류·재시도, 서버 내부 정보 숨김 |

## T17 승인 계약
- WorkRequest에 status(PENDING/APPROVED/REJECTED), reviewedBy(사용자 FK, nullable), reviewedAt, reviewNote(nullable) 추가. 기존 데이터의 기본 상태는 APPROVED.
- requests의 사용자·날짜 유일 제약은 PENDING/APPROVED에만 적용한다. REJECTED는 이력으로 남기고 마감 전 재신청 가능.
- GET /approvals: 리드 전용. 전체 연차·반차 신청을 신청자 이름/역할·승인 가능 여부·불가 사유와 반환. 날짜 선택 없이 향후 신청도 표시한다.
- POST /requests/:id/review {decision: APPROVED|REJECTED, reason?:string}: 리드 전용. 반려 사유 필수. 성공 시 WorkRequest 반환. 중복 심사 409, 본인 심사 403, 과거/이미 출근한 날 승인 409.
- Balances.pendingDays, approvedDays 추가. reservedDays는 두 값의 합계이며 반려분 제외. annual은 예약을 제외한 신청 가능 잔여.
- 반려 반환은 balance_entries에 양수 행으로 추가하되 grantId를 원래 지급 행으로 연결하고 sourceKey=release:requestId:grantId로 중복 방지. 양수 중 grantId가 없는 행만 지급 원본이다.
- 신청·예약, 심사·반환·이력은 각각 한 트랜잭션으로 처리한다. 출퇴근/IP 판단은 APPROVED만 사용한다.

## T19 월별 조회 계약
- GET /calendar?month=YYYY-MM&userId=양의정수. 생략 시 서버 현재 월·본인. 팀원의 타인 조회는 403, 리드의 없는 사용자 조회는 404, 잘못된 월은 INVALID_MONTH(400), 2026년 밖은 CALENDAR_UNSUPPORTED(400).
- CalendarMonth: month, today(KST), user(선택 사용자), users(선택 가능한 공개 사용자 목록), minMonth/maxMonth, days.
- CalendarDay: date, weekday(일=0), business, holidayName, attendance|null, attendanceState(NONE/WORKING/MISSING_CHECKOUT/COMPLETED), requests(신청 이력 전체, 최신 ID 순), deadline(UTC ISO), canRequest(ActionState).
- 날짜 범위는 월 첫날~말일 포함. 인접 월 기록은 반환하지 않는다. 달력은 출퇴근·신청 테이블을 읽으며 새로운 일정 테이블이나 복사본은 만들지 않는다.
- canRequest는 날짜·본인·마감·입사일·중복 조건이다. 종류별 잔여와 입력은 기존 신청 API가 최종 검증한다. 금액·근무 판정을 프론트에서 다시 계산하지 않는다.
- /requests?date=YYYY-MM-DD&kind=ANNUAL|HOLIDAY&from=calendar는 폼을 열기 위한 화면 경로다. 저장 API는 기존 POST /requests를 사용한다.
