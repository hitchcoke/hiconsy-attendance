export const datetime=(v:string|Date)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v));
export const time=(v:string|null)=>v?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'—';
export const hours=(s:number)=>`${Math.floor(s/3600)}시간 ${Math.floor(s%3600/60)}분`;
export const kindLabel:Record<string,string>={ANNUAL:'연차',REMOTE:'재택근무',OFF:'반일 OFF',HOLIDAY:'휴일 근무',OFFICE:'사무실'};
