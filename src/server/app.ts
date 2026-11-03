import 'reflect-metadata';
import { Controller, Get, Post, Req, Inject, Module, Catch, ExceptionFilter, ArgumentsHost, HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createDatabase, seed, Settings, Holidays } from './db';
import { Platform } from './platform';
import { Calendar } from './rules';
import type { Request } from 'express';
import { gateway, loginGateway } from './gateway';
@Catch()
class ErrorFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const response=host.switchToHttp().getResponse();
    if(error instanceof HttpException) response.status(error.getStatus()).json(error.getResponse());
    else {console.error(error);response.status(500).json({code:'INTERNAL_ERROR',message:'처리 중 오류가 발생했습니다. 다시 시도해 주세요.'});}
  }
}
@Controller('api')
class ApiController {
  constructor(@Inject(Platform) private platform:Platform) {}
  @Post('auth/login') login(@Req() req:Request) {return loginGateway(this.platform,req);}
  @Post('auth/logout') logout(@Req() req:Request) {return gateway(this.platform,req,'LOGOUT',async()=>{this.platform.sessions.delete((req.headers.authorization||'').replace(/^Bearer /,''));return {ok:true};});}
  @Get('me') me(@Req() req:Request) {return gateway(this.platform,req,'PROFILE',async c=>c.user);}
  @Get('clock') clock(@Req() req:Request) {return gateway(this.platform,req,'CLOCK',async c=>({now:c.now.toISOString(),demo:this.platform.demo}));}
}
export async function createApp(options:{path?:string;demo?:boolean;now?:string;ips?:string[]}={}) {
  const db=await createDatabase(options.path||process.env.DB_PATH||'data/attendance.sqlite');
  await db.transaction(seed);
  const demo=options.demo??process.env.DEMO_MODE==='true';
  if(demo&&!await db.manager.findOneBy(Settings,{key:'demoNow'})) await db.manager.insert(Settings,{key:'demoNow',value:new Date(options.now||process.env.DEMO_NOW||'2026-03-12T09:00:00+09:00').toISOString()});
  const holidays=await db.manager.find(Holidays);
  const platform=new Platform(db,demo,new Calendar(new Set(holidays.map(h=>h.date))),options.ips||(process.env.OFFICE_IPS||'127.0.0.1,::1').split(','));
  @Module({controllers:[ApiController],providers:[{provide:Platform,useValue:platform}]}) class AppModule {}
  const app=await NestFactory.create(AppModule,{logger:false});
  app.enableCors({origin:['http://127.0.0.1:5173','http://localhost:5173','null'],methods:['GET','POST'],allowedHeaders:['Content-Type','Authorization']});
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  await app.init();
  return {app,db,platform,close:async()=>{await app.close();await db.destroy();}};
}
