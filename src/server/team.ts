import { Between,IsNull,LessThanOrEqual } from 'typeorm';
import type { Context } from './platform';
import { Users,Attendances,Requests,Logs,publicUser } from './db';
import { dateOf,parseDate,fail } from './rules';
import { range,history } from './history';
import type { TeamData,TeamRow } from '../shared/contracts';
export async function team(c:Context,value:unknown):Promise<TeamData> {
 const date=parseDate(value||dateOf(c.now)),users=(await c.m.find(Users)).map(publicUser),records=await c.m.findBy(Attendances,{workDate:date}),requests=await c.m.findBy(Requests,{date}),open=await c.m.findBy(Attendances,{checkOut:IsNull(),workDate:LessThanOrEqual(date)});
 const missing=open.filter(a=>a.workDate<dateOf(c.now));
 const rows:TeamRow[]=users.map(user=>{const attendance=records.find(a=>a.userId===user.id)||null,req=requests.find(r=>r.userId===user.id)||null;return {user,attendance,request:req,status:attendance?.checkOut?'퇴근':attendance?(req?.kind==='REMOTE'?'재택':req?.kind==='OFF'?'OFF 근무':'근무 중'):req?.kind==='ANNUAL'?'연차':req?.kind==='OFF'?'OFF 예정':req?.kind==='REMOTE'?'재택 예정':req?.kind==='HOLIDAY'?'휴일 근무 예정':'미출근',missing:missing.filter(a=>a.userId===user.id).length};});
 const named=(a:any)=>({...a,name:users.find(u=>u.id===a.userId)!.name});
 return {date,rows,missing:missing.map(named),manual:records.filter(a=>a.manual).map(named)};
}
export async function member(c:Context,id:number,query:Record<string,unknown>) {
 const user=await c.m.findOneBy(Users,{id});if(!user)fail('NOT_FOUND','사용자를 찾을 수 없습니다.',404);
 const {from,to}=range(c,query);
 return {user:publicUser(user!),attendances:await history(c,query,id),requests:await c.m.find(Requests,{where:{userId:id,date:Between(from,to)},order:{date:'DESC'}}),logs:await c.m.find(Logs,{where:{actorId:id},order:{id:'DESC'},take:30})};
}
