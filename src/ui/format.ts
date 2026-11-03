export const datetime=(v:string|Date)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v));
export const time=(v:string|null)=>v?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'—';
export const hours=(s:number)=>`${Math.floor(s/3600)}시간 ${Math.floor(s%3600/60)}분`;
export const kindLabel:Record<string,string>={ANNUAL:'연차',REMOTE:'재택근무',OFF:'반일 OFF',HOLIDAY:'휴일 근무',OFFICE:'사무실'};
export const actionLabel:Record<string,string>={LOGIN:'로그인',LOGOUT:'로그아웃',PROFILE:'내 정보 조회',CLOCK:'현재 시각 확인',BALANCES:'잔여 조회',REQUEST_LIST:'신청 내역 조회',REQUEST_CREATE:'신청 확정',REQUEST_OPTIONS:'신청 가능 여부 확인',TODAY:'오늘 현황 조회',ATTENDANCE_CHECK_IN:'출근 등록',ATTENDANCE_CHECK_OUT:'퇴근 등록',ATTENDANCE_CORRECT:'퇴근 직접 입력',HISTORY:'근태 목록 조회',HISTORY_DETAIL:'근태 상세 조회',TEAM:'팀 현황 조회',TEAM_MEMBER:'팀원 상세 조회',DEMO_CLOCK:'시연 시각 변경'};
