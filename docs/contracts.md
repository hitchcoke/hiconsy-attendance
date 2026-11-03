# DB / API 계약

## 데이터
- users: id, login(unique), passwordHash, name, role(MEMBER/LEAD), hireDate.
- attendances: id, userId(FK), workDate, checkIn, checkOut(nullable), workSeconds, late, early, manual, mode. unique(userId,workDate).
- requests: id, userId(FK), kind(ANNUAL/HALF_AM/HALF_PM/REMOTE/HOLIDAY), date, reason, ip/startTime/endTime(nullable), createdAt. unique(userId,date). 모두 확정 상태.
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
