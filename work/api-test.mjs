import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const base='http://127.0.0.1:5175';
const password=crypto.randomBytes(24).toString('hex');
const reports=[];

function client(initialCookie=''){
  let cookie=initialCookie;
  return async(path,method='GET',value,expected=200,origin=base)=>{
    const response=await fetch(base+'/api/life/'+path,{
      method,
      signal:AbortSignal.timeout(20000),
      headers:{
        Connection:'close',
        Origin:origin,
        ...(cookie?{Cookie:cookie}:{}),
        ...(value?{'Content-Type':'application/json'}:{}),
      },
      body:value?JSON.stringify(value):undefined,
    });
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    const text=await response.text();
    let data;
    try{data=JSON.parse(text)}catch{data=text}
    assert.equal(response.status,expected,`${method} ${path}: ${response.status} ${text.slice(0,200)}`);
    return data;
  };
}

const owner=client();
const second=client();
const anonymous=client();
const invalidToken=client('mint_session='+'a'.repeat(64));

await anonymous('records','GET',undefined,401);
reports.push('unauthenticated access denied');

await invalidToken('records','GET',undefined,401);
assert.equal((await invalidToken('session')).user,null);
reports.push('invalid session token denied');

const initial=await owner('session');
assert.equal(initial.setup,true,'QA database must start empty');
assert.equal(initial.canSetup,true);
reports.push('empty database exposes one-time setup');

await owner('setup','POST',{email:'owner@mint-qa.invalid',password,name:'本地验收'},403,'https://other.invalid');
reports.push('cross-origin write denied');

await owner('setup','POST',{email:'owner@mint-qa.invalid',password,name:'本地验收'});
const signedIn=await owner('session');
assert.equal(signedIn.setup,false);
assert.equal(signedIn.user.email,'owner@mint-qa.invalid');
assert.equal('role' in signedIn.user,false);
reports.push('sole account setup creates a session');

await second('setup','POST',{email:'second@mint-qa.invalid',password,name:'第二账号'},409);
assert.equal((await second('session')).setup,false);
reports.push('second account creation permanently rejected');

const habits=await owner('habits');
const emptyRecords=await owner('records');
assert.equal(habits.length,21);
assert.equal(emptyRecords.length,0);
assert.equal(habits.some(h=>'owner' in h),false);
reports.push('single-user presets load without examples or ownership fields');

for(const path of ['members','invites','shares','file/legacy'])await owner(path,'GET',undefined,404);
for(const path of ['register','invite','share','upload'])await owner(path,'POST',{},404);
for(const path of ['invite/legacy','share/legacy','file/legacy'])await owner(path,'DELETE',undefined,404);
reports.push('removed multiplayer and image endpoints stay absent');

const sleep=await owner('record','POST',{kind:'sleep',date:'2026-09-14',data:{bed:'23:30',wake:'07:30',rating:4}});
await owner('record','POST',{kind:'study',date:'2026-09-14',data:{project:'测试课程',actual:45,complete:true}});
await owner('record','POST',{kind:'meal',date:'2026-09-14',data:{breakfast:'正常',lunch:'食堂',canteen:true}});
await owner('record','POST',{kind:'sleep',date:'2026-09-14',data:{bed:'22:30',wake:'07:30'}},409);
assert.deepEqual(new Set((await owner('records')).map(r=>r.kind)),new Set(['sleep','study','meal']));
reports.push('sleep study and meal records persist with daily uniqueness');

const saved=(await owner('records')).find(r=>r.id===sleep.id);
await owner('record','POST',{...saved,data:{...saved.data,notes:'updated'}});
await owner('record','POST',saved,409);
reports.push('optimistic concurrency conflict preserved');

await owner('habit','POST',{id:'',name:'晚间整理',category:'每日 SOP',frequency:'daily',days:[],monthDay:1,minutes:10,target:0,active:true,revision:1});
const refreshedHabits=await owner('habits');
const byCategory=category=>refreshedHabits.find(h=>h.category===category);
for(const category of ['运动','清洁','每日 SOP']){
  const habit=byCategory(category);
  assert.ok(habit,`missing ${category} habit`);
  await owner('check','POST',{habitId:habit.id,date:'2026-09-15',complete:true});
}
const checks=(await owner('records')).filter(r=>r.kind==='check'&&r.date==='2026-09-15');
assert.deepEqual(new Set(checks.map(r=>r.data.category)),new Set(['运动','清洁','每日 SOP']));
reports.push('exercise cleaning and SOP habits can be checked');

const imported={kind:'check',date:'2026-09-16',data:{name:refreshedHabits[0].name,category:refreshedHabits[0].category,complete:true}};
const importedResult=await owner('import','POST',{records:[imported,imported]});
assert.equal(importedResult.imported,1);
assert.equal(importedResult.skipped,1);
await owner('record','POST',{kind:'study',date:'2026-08-31',data:{project:'跨月测试',actual:30,complete:true}});
assert.equal((await owner('records?month=2026-08')).length,1);
assert.ok((await owner('records?month=2026-09')).length>=7);
reports.push('import deduplication and month filtering preserve history');

const beforeSettings=await owner('session');
const updatedSettings={
  ...beforeSettings.user.settings,
  hidden:['meal'],
  focusByMonth:{...beforeSettings.user.settings.focusByMonth,'2026-09':'完成阶段 1 验收'},
};
await owner('settings','POST',{name:'长期记录',settings:updatedSettings,revision:beforeSettings.user.revision});
const afterSettings=await owner('session');
assert.equal(afterSettings.user.name,'长期记录');
assert.deepEqual(afterSettings.user.settings.hidden,['meal']);
assert.equal(afterSettings.user.settings.focusByMonth['2026-09'],'完成阶段 1 验收');
reports.push('monthly focus and custom module visibility persist');

await owner('record/'+sleep.id,'DELETE');
assert.equal((await owner('records')).some(r=>r.id===sleep.id),false);
await owner('logout','POST',{});
await owner('records','GET',undefined,401);
await owner('login','POST',{email:'owner@mint-qa.invalid',password});
assert.equal((await owner('session')).user.email,'owner@mint-qa.invalid');
reports.push('record deletion logout invalidation and password login');

assert.equal(reports.length,14);
const report={passed:reports.length,checks:reports};
fs.writeFileSync('work/qa-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
