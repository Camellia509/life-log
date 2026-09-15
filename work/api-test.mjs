import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {Miniflare} from 'miniflare';

const allowedOrigin='http://localhost:5173';
const password=crypto.randomBytes(24).toString('hex');
const reports=[];
const miniflare=new Miniflare({
  modules:true,
  scriptPath:path.resolve('work/worker-dry-run/index.js'),
  compatibilityDate:'2026-05-22',
  bindings:{ALLOWED_ORIGINS:'http://localhost:5173,http://127.0.0.1:5173',MINT_LOCAL_SETUP:'1'},
  d1Databases:{DB:'mint-stage2-qa'},
  port:0,
});
const database=await miniflare.getD1Database('DB');
for(const name of fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort()){
  const statements=fs.readFileSync(path.join('drizzle',name),'utf8').split('--> statement-breakpoint').map(statement=>statement.trim()).filter(Boolean);
  await database.batch(statements.map(statement=>database.prepare(statement)));
}
const base=(await miniflare.ready).origin;

function client(initialToken='',deviceId=crypto.randomUUID()){
  let token=initialToken;
  const request=async(pathname,method='GET',value,expected=200,origin=allowedOrigin)=>{
    const response=await fetch(base+'/api/life/'+pathname,{
      method,
      signal:AbortSignal.timeout(20000),
      headers:{
        Connection:'close',
        Origin:origin,
        ...(token?{Authorization:`Bearer ${token}`}:{ }),
        ...(value!==undefined?{'Content-Type':'application/json'}:{ }),
      },
      body:value===undefined?undefined:JSON.stringify(value),
    });
    const text=await response.text();
    let data;
    try{data=text?JSON.parse(text):{}}catch{data=text}
    assert.equal(response.status,expected,`${method} ${pathname}: ${response.status} ${text.slice(0,200)}`);
    if(origin===allowedOrigin)assert.equal(response.headers.get('access-control-allow-origin'),allowedOrigin);
    if((pathname==='login'||pathname==='setup')&&response.ok){
      assert.match(data.token,/^[a-f0-9]{64}$/);
      token=data.token;
    }
    return data;
  };
  return {request,deviceId,get token(){return token}};
}

const preflight=await fetch(base+'/api/life/records',{method:'OPTIONS',headers:{Origin:allowedOrigin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,content-type'}});
assert.equal(preflight.status,204);
assert.equal(preflight.headers.get('access-control-allow-origin'),allowedOrigin);
assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
assert.match(preflight.headers.get('access-control-allow-methods'),/DELETE/);
assert.match(preflight.headers.get('access-control-allow-headers'),/Authorization/);
reports.push('CORS preflight permits only the configured origin and bearer headers');

const illegal=await fetch(base+'/api/life/session',{headers:{Origin:'https://other.invalid'}});
assert.equal(illegal.status,403);
assert.equal(illegal.headers.get('access-control-allow-origin'),null);
const wildcard=await fetch(base+'/api/life/session',{headers:{Origin:'*'}});
assert.equal(wildcard.status,403);
reports.push('illegal and wildcard request origins are rejected without CORS access');

const corsSource=fs.readFileSync('worker/src/cors.ts','utf8');
const corsModule=ts.transpileModule(corsSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
fs.writeFileSync('work/cors-test.mjs',corsModule);
const {checkOrigin}=await import('./cors-test.mjs?'+Date.now());
assert.equal(checkOrigin(new Request(base+'/api/life/session',{headers:{Origin:allowedOrigin}}),{ALLOWED_ORIGINS:'*'}).response.status,403);
assert.equal(checkOrigin(new Request(base+'/api/life/session',{headers:{Origin:allowedOrigin}}),{}).response.status,403);
reports.push('missing and wildcard ALLOWED_ORIGINS fail closed');

const owner=client();
const secondAccount=client();
const anonymous=client();
const invalidToken=client('a'.repeat(64));

await anonymous.request('records','GET',undefined,401);
reports.push('unauthenticated access denied');

await invalidToken.request('records','GET',undefined,401);
assert.equal((await invalidToken.request('session')).user,null);
reports.push('invalid bearer token denied');

const initial=await owner.request('session');
assert.equal(initial.setup,true,'QA database must start empty');
assert.equal(initial.canSetup,true);
reports.push('empty database exposes one-time setup');

await owner.request('setup','POST',{email:'owner@mint-qa.invalid',password,name:'本地验收',deviceId:owner.deviceId},403,'https://other.invalid');
reports.push('cross-origin setup denied before database access');

await owner.request('setup','POST',{email:'owner@mint-qa.invalid',password,name:'本地验收',deviceId:owner.deviceId});
assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token=?').bind(owner.token).first()).n,0,'raw bearer token must never be stored');
assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token=?').bind(crypto.createHash('sha256').update(owner.token).digest('hex')).first()).n,1,'bearer token digest must be stored');
const signedIn=await owner.request('session');
assert.equal(signedIn.setup,false);
assert.equal(signedIn.user.email,'owner@mint-qa.invalid');
assert.equal('role' in signedIn.user,false);
reports.push('sole account setup returns a bearer session');

await secondAccount.request('setup','POST',{email:'second@mint-qa.invalid',password,name:'第二账号',deviceId:secondAccount.deviceId},409);
assert.equal((await secondAccount.request('session')).setup,false);
reports.push('second account creation permanently rejected');

const habits=await owner.request('habits');
const emptyRecords=await owner.request('records');
assert.equal(habits.length,21);
assert.equal(emptyRecords.length,0);
assert.equal(habits.some(h=>'owner' in h),false);
reports.push('single-user presets load without examples or ownership fields');

for(const pathname of ['members','invites','shares','file/legacy'])await owner.request(pathname,'GET',undefined,404);
for(const pathname of ['register','invite','share','upload'])await owner.request(pathname,'POST',{},404);
for(const pathname of ['invite/legacy','share/legacy','file/legacy'])await owner.request(pathname,'DELETE',undefined,404);
reports.push('removed multiplayer and image endpoints stay absent');

const sleep=await owner.request('record','POST',{kind:'sleep',date:'2026-09-14',data:{bed:'23:30',wake:'07:30',rating:4},revision:1});
await owner.request('record','POST',{kind:'study',date:'2026-09-14',data:{project:'测试课程',actual:45,complete:true},revision:1});
await owner.request('record','POST',{kind:'meal',date:'2026-09-14',data:{breakfast:'正常',lunch:'食堂',canteen:true},revision:1});
await owner.request('record','POST',{kind:'sleep',date:'2026-09-14',data:{bed:'22:30',wake:'07:30'},revision:1},409);
assert.deepEqual(new Set((await owner.request('records')).map(record=>record.kind)),new Set(['sleep','study','meal']));
reports.push('sleep study and meal records persist with daily uniqueness');

const saved=(await owner.request('records')).find(record=>record.id===sleep.id);
await owner.request('record','POST',{...saved,data:{...saved.data,notes:'updated'}});
await owner.request('record','POST',saved,409);
reports.push('optimistic concurrency conflict preserved');

await owner.request('habit','POST',{id:'',name:'晚间整理',category:'每日 SOP',frequency:'daily',days:[],monthDay:1,minutes:10,target:0,active:true,revision:1});
const refreshedHabits=await owner.request('habits');
const byCategory=category=>refreshedHabits.find(habit=>habit.category===category);
for(const category of ['运动','清洁','每日 SOP']){
  const habit=byCategory(category);
  assert.ok(habit,`missing ${category} habit`);
  await owner.request('check','POST',{habitId:habit.id,date:'2026-09-15',complete:true});
}
const checks=(await owner.request('records')).filter(record=>record.kind==='check'&&record.date==='2026-09-15');
assert.deepEqual(new Set(checks.map(record=>record.data.category)),new Set(['运动','清洁','每日 SOP']));
reports.push('exercise cleaning and SOP habits can be checked');

const imported={kind:'check',date:'2026-09-16',data:{name:refreshedHabits[0].name,category:refreshedHabits[0].category,complete:true}};
const importedResult=await owner.request('import','POST',{records:[imported,imported]});
assert.equal(importedResult.imported,1);
assert.equal(importedResult.skipped,1);
await owner.request('record','POST',{kind:'study',date:'2026-08-31',data:{project:'跨月测试',actual:30,complete:true},revision:1});
assert.equal((await owner.request('records?month=2026-08')).length,1);
assert.ok((await owner.request('records?month=2026-09')).length>=7);
reports.push('import deduplication and month filtering preserve history');

const beforeSettings=await owner.request('session');
const updatedSettings={...beforeSettings.user.settings,hidden:['meal'],focusByMonth:{...beforeSettings.user.settings.focusByMonth,'2026-09':'完成阶段 2 验收'}};
await owner.request('settings','POST',{name:'长期记录',settings:updatedSettings,revision:beforeSettings.user.revision});
const afterSettings=await owner.request('session');
assert.equal(afterSettings.user.name,'长期记录');
assert.deepEqual(afterSettings.user.settings.hidden,['meal']);
assert.equal(afterSettings.user.settings.focusByMonth['2026-09'],'完成阶段 2 验收');
reports.push('monthly focus and custom module visibility persist');

await owner.request('record/'+sleep.id,'DELETE');
assert.equal((await owner.request('records')).some(record=>record.id===sleep.id),false);

const deviceTwo=client('',crypto.randomUUID());
await deviceTwo.request('login','POST',{email:'owner@mint-qa.invalid',password,deviceId:deviceTwo.deviceId});
const sessions=await owner.request('sessions');
assert.equal(sessions.length,2);
assert.equal(sessions.filter(session=>session.current).length,1);
assert.ok(sessions.every(session=>session.deviceLabel&&session.expiresAt>session.createdAt));
const secondSession=sessions.find(session=>!session.current);
await owner.request('sessions/'+secondSession.id,'DELETE');
await deviceTwo.request('records','GET',undefined,401);
reports.push('device sessions can be listed and individually revoked');

const currentSession=(await owner.request('sessions')).find(session=>session.current);
await database.prepare('UPDATE sessions SET expires=? WHERE id=?').bind(Date.now()-1,currentSession.id).run();
await owner.request('records','GET',undefined,401);
reports.push('expired bearer token is rejected');

await owner.request('login','POST',{email:'owner@mint-qa.invalid',password,deviceId:owner.deviceId});
await owner.request('logout','POST',{});
await owner.request('records','GET',undefined,401);
await owner.request('login','POST',{email:'owner@mint-qa.invalid',password,deviceId:owner.deviceId});
assert.equal((await owner.request('session')).user.email,'owner@mint-qa.invalid');
reports.push('record deletion logout revocation and password login remain available');

assert.equal(reports.length,19);
const report={passed:reports.length,stage1Regression:14,securityAdditions:5,checks:reports};
fs.writeFileSync('work/qa-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await miniflare.dispose();
