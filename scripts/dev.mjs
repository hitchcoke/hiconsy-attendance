import { spawn } from 'node:child_process';
const children=[];
function run(command,args,env={}) {const child=spawn(command,args,{stdio:'inherit',env:{...process.env,...env}});children.push(child);return child;}
function once(command,args) {return new Promise((resolve,reject)=>run(command,args).on('exit',code=>code===0?resolve():reject(new Error(`${command} failed: ${code}`))));}
function stop() {for(const child of children) child.kill('SIGTERM');}
process.on('SIGINT',()=>{stop();process.exit();});process.on('SIGTERM',()=>{stop();process.exit();});
await once('npm',['run','build:server']);
run(process.execPath,['--env-file=.env.demo','--watch','dist/server/main.js']);
run('npm',['exec','--','tsc','-p','tsconfig.server.json','--watch']);
run('npm',['run','dev:web']);
for(let attempt=0;attempt<100;attempt++) {
  try {await fetch('http://127.0.0.1:5173');break;} catch {await new Promise(r=>setTimeout(r,200));}
}
const desktop=run('npm',['exec','--','electron','.'],{VITE_DEV_SERVER_URL:'http://127.0.0.1:5173'});
desktop.on('exit',()=>{stop();process.exit();});
