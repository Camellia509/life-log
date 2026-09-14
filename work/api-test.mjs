import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';
const base='http://127.0.0.1:5175';const password=crypto.randomBytes(24).toString('hex');const reports=[];
function client(){let cookie='';return async(path,method='GET',b,expected=200,origin=base)=>{const r=await fetch(base+'/api/life/'+path,{method,signal:AbortSignal.timeout(20000),headers:{Connection:'close',Origin:origin,...(cookie?{Cookie:cookie}:{}),...(b&&!(b instanceof FormData)?{'Content-Type':'application/json'}:{})},body:b instanceof FormData?b:b?JSON.stringify(b):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];let data;const t=await r.text();try{data=JSON.parse(t)}catch{data=t}assert.equal(r.status,expected,`${method} ${path}: ${r.status} ${t.slice(0,200)}`);return data}}
const a=client(),b=client(),anonymous=client();
await anonymous('records','GET',undefined,401);reports.push('anonymous access denied');
const state=await a('session');assert.equal(state.setup,true,'QA database must start empty');assert.equal(state.canSetup,true);
await a('setup','POST',{email:'owner@mint-qa.invalid',password,name:'本地验收'});reports.push('owner setup and session');
const hs=await a('habits');assert.equal(hs.length,21);assert.equal((await a('records')).length,0);reports.push('21 presets and zero example records');

await a('record','POST',{kind:'sleep',date:'2026-09-14',data:{bed:'23:30',wake:'07:30',rating:4}},403,'https://other.invalid');reports.push('cross-origin write denied');
const inv=await a('invite','POST',{email:'friend@mint-qa.invalid'});
await b('register','POST',{email:'friend@mint-qa.invalid',password,name:'测试亲友',token:inv.token});const uid=(await b('session')).user.id;
const s=await a('record','POST',{kind:'sleep',date:'2026-09-14',data:{bed:'23:30',wake:'07:30',rating:4}});
await a('record','POST',{kind:'sleep',date:'2026-09-14',data:{bed:'22:30',wake:'07:30'}},409);reports.push('duplicate daily record blocked');
const saved=(await a('records'))[0];await a('record','POST',{...saved,data:{...saved.data,notes:'updated'}});await a('record','POST',saved,409);reports.push('optimistic concurrency conflict');
assert.equal((await b('records')).length,0);await b('record','POST',{...saved,data:{notes:'forbidden'}},400);await b('record/'+s.id,'DELETE',undefined,404);reports.push('per-user data isolation');
const form=new FormData();form.set('recordId',s.id);form.set('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')],'qa.png',{type:'image/png'}));const f=await a('upload','POST',form);
await b('file/'+f.id,'GET',undefined,404);await a('share','POST',{recordId:s.id,viewer:uid});assert.equal((await b('shares')).received.length,1);await b('file/'+f.id);reports.push('image upload and selected read-only sharing');
const grant=(await a('shares')).own[0];await a('share/'+grant.id,'DELETE');assert.equal((await b('shares')).received.length,0);await b('file/'+f.id,'GET',undefined,404);reports.push('share revocation also denies image');
const imported={kind:'check',date:'2026-09-14',data:{name:hs[0].name,category:hs[0].category,complete:true}};let rr=await a('import','POST',{records:[imported,imported]});assert.equal(rr.imported,1);assert.equal(rr.skipped,1);await a('check','POST',{habitId:hs[0].id,date:'2026-09-14',complete:false});let cs=(await a('records')).filter(r=>r.kind==='check');assert.equal(cs.length,1);assert.equal(cs[0].data.complete,false);await a('check','POST',{habitId:hs[0].id,date:'2026-09-14',complete:true});assert.equal((await a('records')).filter(r=>r.kind==='check').length,1);reports.push('import deduplication and imported habit toggling');
await a('record','POST',{kind:'study',date:'2026-08-31',data:{project:'测试课程',actual:45,complete:true}});assert.equal((await a('records?month=2026-08')).length,1);assert.equal((await a('records?month=2026-09')).length,2);reports.push('month filtering preserves history');
for(let i=0;i<3;i++){const email=`extra${i}@mint-qa.invalid`;const t=await a('invite','POST',{email});await client()('register','POST',{email,password,name:'测试成员',token:t.token})}await a('invite','POST',{email:'sixth@mint-qa.invalid'},400);reports.push('five-person membership cap');
await a('file/'+f.id,'DELETE');await a('file/'+f.id,'GET',undefined,404);await a('record/'+s.id,'DELETE');reports.push('attachment and record deletion');
await a('logout','POST',{});await a('records','GET',undefined,401);await a('login','POST',{email:'owner@mint-qa.invalid',password});reports.push('logout invalidation and password login');

fs.writeFileSync('work/qa-report.json',JSON.stringify({passed:reports.length,checks:reports},null,2));console.log(JSON.stringify({passed:reports.length,checks:reports},null,2));
