import type { Context } from './platform';import { Settings } from './db';import { Calendar,parseInstant,dateOf,fail } from './rules';
export async function setClock(c:Context,calendar:Calendar,demo:boolean,value:unknown){
 if(!demo)fail('DEMO_DISABLED','시연 모드에서만 사용할 수 있습니다.',403);
 const next=parseInstant(value);calendar.supported(dateOf(next));
 if(next<c.now)fail('CLOCK_BACKWARDS','시연 시각은 앞으로만 변경할 수 있어요. 과거 시연은 서버 종료 후 demo:reset을 사용해 주세요.');
 await c.m.update(Settings,{key:'demoNow'},{value:next.toISOString()});return {now:next.toISOString(),demo:true};
}
