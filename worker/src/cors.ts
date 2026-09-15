import type {Env} from './types';

const methods='GET, POST, DELETE, OPTIONS';
const headers='Authorization, Content-Type';

function configuredOrigins(value:string|undefined){
  if(!value)return null;
  const entries=value.split(',').map(item=>item.trim()).filter(Boolean);
  if(!entries.length||entries.includes('*'))return null;
  const normalized=new Set<string>();
  for(const entry of entries){
    try{
      const url=new URL(entry);
      if(entry!==url.origin||url.username||url.password)return null;
      normalized.add(url.origin);
    }catch{return null}
  }
  return normalized;
}

function corsHeaders(origin:string){
  return {
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':methods,
    'Access-Control-Allow-Headers':headers,
    'Access-Control-Max-Age':'600',
    'Vary':'Origin',
  };
}

export function checkOrigin(request:Request,env:Env):{origin:string}|{response:Response}{
  const allowed=configuredOrigins(env.ALLOWED_ORIGINS);
  const origin=request.headers.get('Origin');
  if(!allowed||!origin||!allowed.has(origin)){
    return {response:Response.json({error:'请求来源不允许'},{status:403,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})};
  }
  if(request.method==='OPTIONS'){
    return {response:new Response(null,{status:204,headers:corsHeaders(origin)})};
  }
  return {origin};
}

export function addCors(response:Response,origin:string){
  const output=new Response(response.body,response);
  for(const [name,value] of Object.entries(corsHeaders(origin)))output.headers.set(name,value);
  return output;
}

