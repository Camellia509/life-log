import {defaultSettings,presets,type Habit,type LifeRecord} from '../../lib/life';
import type {Env,JsonObject} from './types';

export function db(env:Env){if(!env.DB)throw new Error('数据库尚未配置');return env.DB}
export function json(value:unknown,status=200,headers:Record<string,string>={}){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}})}
export class ApiError extends Error{constructor(public status:number,message:string){super(message)}}
export function fail(status:number,message:string):never{throw new ApiError(status,message)}
export async function body(request:Request):Promise<JsonObject>{const raw=await request.text();if(raw.length>2_000_000)fail(413,'内容过大');try{const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail(400,'无效的请求内容');return parsed as JsonObject}catch(error){if(error instanceof ApiError)throw error;fail(400,'无效的请求内容')}}
export const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer)).map(value=>value.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export async function hash(value:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))}
export async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256))}
export function equal(left:string,right:string){let result=left.length^right.length;for(let index=0;index<Math.max(left.length,right.length);index++)result|=(left.charCodeAt(index)||0)^(right.charCodeAt(index)||0);return result===0}

export type User={id:string;email:string;name:string;settings:string;revision:number};
export type AuthenticatedUser=User&{sessionId:string};

function bearer(request:Request){
  const match=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/);
  return match?.[1]||null;
}

export async function user(request:Request,env:Env){
  const token=bearer(request);
  if(!token)return null;
  const now=Date.now();
  const found=await db(env).prepare('SELECT u.id,u.email,u.name,u.settings,u.revision,s.id AS sessionId,s.last_used_at AS lastUsedAt FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.revoked_at IS NULL AND s.expires>?').bind(await hash(token),now).first<AuthenticatedUser&{lastUsedAt:number}>();
  if(found&&found.lastUsedAt<now-3_600_000)await db(env).prepare('UPDATE sessions SET last_used_at=? WHERE id=?').bind(now,found.sessionId).run();
  return found;
}

export async function mustUser(request:Request,env:Env){const found=await user(request,env);if(!found)fail(401,'请先登录');return found}
export async function limit(env:Env,key:string,max=12){const now=Date.now();const result=await db(env).prepare('INSERT INTO attempts(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN attempts.until<? THEN 1 ELSE attempts.count+1 END,until=CASE WHEN attempts.until<? THEN excluded.until ELSE attempts.until END RETURNING count').bind(key,now+900000,now,now).first<{count:number}>();if(result&&result.count>max)fail(429,'尝试次数过多，请 15 分钟后重试')}

function deviceLabel(userAgent:string){
  const platform=/iPhone/i.test(userAgent)?'iPhone':/iPad/i.test(userAgent)?'iPad':/Android/i.test(userAgent)?'Android':/Windows/i.test(userAgent)?'Windows':/Macintosh|Mac OS/i.test(userAgent)?'Mac':/Linux/i.test(userAgent)?'Linux':'未知设备';
  const browser=/Edg\//i.test(userAgent)?'Edge':/Firefox\//i.test(userAgent)?'Firefox':/Chrome\//i.test(userAgent)?'Chrome':/Safari\//i.test(userAgent)?'Safari':'浏览器';
  return `${platform} · ${browser}`;
}

export async function createSession(env:Env,userId:string,request:Request,deviceId:unknown){
  const rawDeviceId=String(deviceId||'');
  if(rawDeviceId.length<16||rawDeviceId.length>200)fail(400,'设备标识无效，请刷新页面后重试');
  const now=Date.now();
  const expiresAt=now+7*86_400_000;
  const token=randomToken();
  const tokenHash=await hash(token);
  const publicId=crypto.randomUUID();
  const rawUserAgent=(request.headers.get('User-Agent')||'').slice(0,1000);
  const deviceIdHash=await hash(rawDeviceId);
  const userAgentHash=await hash(rawUserAgent);
  await db(env).batch([
    db(env).prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND (expires<=? OR device_id_hash=?)').bind(now,userId,now,deviceIdHash),
    db(env).prepare('INSERT INTO sessions(token,user_id,expires,id,device_id_hash,device_label,user_agent_hash,created_at,last_used_at,revoked_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)').bind(tokenHash,userId,expiresAt,publicId,deviceIdHash,deviceLabel(rawUserAgent),userAgentHash,now,now),
  ]);
  return {token,expiresAt,sessionId:publicId};
}

export function cleanUser(found:User){return {id:found.id,email:found.email,name:found.name,revision:found.revision,settings:{...defaultSettings,...JSON.parse(found.settings)}}}
export async function seedHabits(env:Env){await db(env).batch(presets().map(habit=>db(env).prepare('INSERT OR IGNORE INTO habits(id,payload) VALUES(?,?)').bind(habit.id,JSON.stringify(habit))))}
export function unpack(row:Record<string,unknown>):LifeRecord{return {...row,data:JSON.parse(String(row.payload))} as unknown as LifeRecord}
export function validateRecord(record:LifeRecord){if(!record||!['sleep','study','meal','check'].includes(record.kind)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(record.date)||new Date(record.date+'T12:00:00Z').toISOString().slice(0,10)!==record.date)fail(400,'记录类别或日期无效');if(!record.data||typeof record.data!=='object'||Array.isArray(record.data)||JSON.stringify(record.data).length>15000)fail(400,'记录内容无效');for(const [key,value] of Object.entries(record.data)){if(!['string','number','boolean'].includes(typeof value))fail(400,'字段内容无效');if(typeof value==='number'&&(!Number.isFinite(value)||value<0||value>100000))fail(400,'数值不在允许范围');if(['bed','wake'].includes(key)&&value&&!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(value)))fail(400,'时间格式无效')}if(record.kind==='sleep'&&(!record.data.bed||!record.data.wake||record.data.bed===record.data.wake))fail(400,'请填写不同的入睡和起床时间');if(record.kind==='study'&&(!String(record.data.project||'').trim()||record.data.actual===undefined))fail(400,'请填写课程/项目和实际分钟');for(const key of ['rating','focus'])if(record.data[key]!==undefined&&record.data[key]!==''&&(!Number.isFinite(+record.data[key]!)||+record.data[key]!<1||+record.data[key]!>5))fail(400,'评分范围为 1–5')}
export function validateHabit(habit:Habit){if(!habit.name?.trim()||habit.name.length>120||!['运动','清洁','每日 SOP'].includes(habit.category)||!['daily','weekly','biweekly','monthly'].includes(habit.frequency)||!Array.isArray(habit.days)||habit.days.some(day=>!Number.isInteger(day)||day<0||day>6)||habit.monthDay<1||habit.monthDay>31||habit.target<0||habit.target>1000||habit.minutes<0||habit.minutes>1440)fail(400,'习惯项目或频率无效');if(['weekly','biweekly'].includes(habit.frequency)&&!habit.days.length)fail(400,'请至少选择一个星期')}
export async function guard(run:()=>Promise<Response>){try{return await run()}catch(error){if(error instanceof ApiError)return json({error:error.message},error.status);console.error('Request failed',error instanceof Error?error.message:'unknown');return json({error:'暂时无法完成操作，请稍后重试。输入内容已保留。'},503)}}

