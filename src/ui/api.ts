const BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';
export class ApiError extends Error {constructor(public code:string,message:string){super(message);}}
export async function api<T>(path:string,body?:unknown):Promise<T> {
  const token=sessionStorage.getItem('token');
  let response:Response;
  try {response=await fetch(BASE+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});}
  catch {throw new ApiError('CONNECTION_FAILED','서버에 연결할 수 없습니다. 서버 실행 상태를 확인한 뒤 다시 시도해 주세요.');}
  const data=await response.json();
  if(!response.ok) {if(response.status===401){sessionStorage.removeItem('token');window.dispatchEvent(new Event('auth-expired'));}throw new ApiError(data.code||'ERROR',data.message||'요청을 처리하지 못했습니다.');}
  return data;
}
