import {handleApi} from './api';
import {addCors,checkOrigin} from './cors';
import type {Env} from './types';

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/health')return Response.json({ok:true},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if(url.pathname!=='/api/life'&&!url.pathname.startsWith('/api/life/'))return Response.json({error:'未找到'},{status:404});
    const originCheck=checkOrigin(request,env);
    if('response' in originCheck)return originCheck.response;
    return addCors(await handleApi(request,env),originCheck.origin);
  },
} satisfies ExportedHandler<Env>;
