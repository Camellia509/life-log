import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync('lib/full-export.ts','utf8');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
fs.writeFileSync('work/full-export.mjs',output);
const {FULL_EXPORT_FORMAT,FULL_EXPORT_VERSION,sealFullExport,parseFullExport}=await import('./full-export.mjs?'+Date.now());

const payload={
  format:FULL_EXPORT_FORMAT,
  version:FULL_EXPORT_VERSION,
  exportedAt:'2026-09-20T02:17:00.000Z',
  account:{id:'personal',email:'owner@mint-qa.invalid',name:'验收账号',revision:3},
  settings:{hidden:[],sleepGoal:8,studyGoal:120,bedtime:'23:30',focus:'',focusByMonth:{'2026-09':'完成备份'}},
  records:[{id:'one',kind:'study',date:'2026-09-20',data:{project:'阶段四',actual:45,complete:true},revision:1}],
  habits:[{id:'habit',name:'散步',category:'运动',frequency:'daily',days:[],monthDay:1,minutes:20,target:0,active:true,revision:1}],
  sessions:[{id:'session',deviceLabel:'Windows · Chrome',createdAt:1,lastUsedAt:2,expiresAt:3,revokedAt:null,status:'expired',current:true}],
};

const sealed=await sealFullExport(payload);
assert.match(sealed.integrity.contentSha256,/^[a-f0-9]{64}$/);
const parsed=await parseFullExport(new File([JSON.stringify(sealed)],'backup.json',{type:'application/json'}));
assert.deepEqual(parsed.records,payload.records);
assert.equal(parsed.summary.habitCount,1);
assert.equal(parsed.summary.focusCount,1);
assert.match(parsed.warnings[0],/只恢复记录/);

const tampered=structuredClone(sealed);
tampered.records[0].data.actual=999;
await assert.rejects(()=>parseFullExport(new File([JSON.stringify(tampered)],'tampered.json')),/校验失败/);
await assert.rejects(()=>parseFullExport(new File(['{}'],'unknown.json')),/格式或版本/);

const serialized=JSON.stringify(sealed);
for(const forbidden of ['password','salt','token','device_id_hash','user_agent_hash','attempts'])assert.equal(serialized.includes(`"${forbidden}"`),false);
console.log(JSON.stringify({passed:7,checks:['versioned format','content hash','record restore payload','non-record preview','tamper rejection','unknown format rejection','sensitive fields absent']},null,2));
