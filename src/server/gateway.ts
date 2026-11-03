import type { Request } from 'express';
import type { EntityManager } from 'typeorm';
import { Platform, Context } from './platform';
import { DomainError, fail, normalizeIp } from './rules';
export async function gateway<T>(p:Platform,req:Request,action:string,handler:(c:Context)=>Promise<T>,lead=false):Promise<T> {
  return p.serial(async()=> {
    let actorId:number|null=null;
    const now=await p.now();
    const ip=normalizeIp(req.socket.remoteAddress||'');
    try {
      return await p.db.transaction(async m=> {
        if(!await p.allowed(m,ip,now)) fail('IP_DENIED','등록되지 않은 IP이거나 허용 시간이 아닙니다.',403);
        const token=(req.headers.authorization||'').replace(/^Bearer /,'');
        const user=await p.identity(m,token);actorId=user.id;
        if(!await p.allowed(m,ip,now,user.id)) fail('IP_DENIED','본인 신청의 IP·시간대에서 접속해 주세요.',403);
        if(lead&&user.role!=='LEAD') fail('FORBIDDEN','리드만 이용할 수 있습니다.',403);
        const value=await handler({user,now,ip,m});
        const target=action.startsWith('ATTENDANCE_')&&value&&typeof value==='object'&&'id' in value?`attendance:${value.id}`:action==='REQUEST_CREATE'&&value&&typeof value==='object'&&'id' in value?`request:${value.id}`:req.path;
        await p.log(m,user.id,action,target,'SUCCESS','',now,ip);
        return value;
      });
    } catch(e) {
      await p.log(p.db.manager,actorId,action,req.path,'FAILURE',e instanceof DomainError?e.code:'INTERNAL_ERROR',now,ip);
      throw e;
    }
  });
}
export async function loginGateway(p:Platform,req:Request) {
  return p.serial(async()=> {
    const now=await p.now(),ip=normalizeIp(req.socket.remoteAddress||'');
    try {
      return await p.db.transaction(async m=> {
        if(!await p.allowed(m,ip,now)) fail('IP_DENIED','등록된 IP·시간대에서만 로그인할 수 있습니다.',403);
        const result=await p.login(m,req.body,now,ip);
        await p.log(m,result.user.id,'LOGIN',req.path,'SUCCESS','',now,ip);return result;
      });
    } catch(e) {await p.log(p.db.manager,null,'LOGIN',req.path,'FAILURE',e instanceof DomainError?e.code:'INTERNAL_ERROR',now,ip);throw e;}
  });
}
