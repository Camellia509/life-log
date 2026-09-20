import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd();
const output=path.join(root,'work','stage4-rehearsal');
const staging=path.join(output,'staging');
const date=new Date().toISOString().slice(0,10);

function run(command,args,{json=false,cwd=root}={}){
  const result=spawnSync(command,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
  if(result.status!==0)throw new Error(`${command} failed (${result.status}): ${result.error?.message||''}\n${result.stderr||result.stdout||''}`);
  return json?JSON.parse(result.stdout.trim()):result.stdout.trim();
}

function findPython(){
  const candidates=[];
  if(process.env.PYTHON) candidates.push([process.env.PYTHON,[]]);
  if(process.platform==='win32'){
    candidates.push(
      [path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe'),[]],
      ['py',['-3']],['python',[]],
    );
  }else candidates.push(['python3',[]],['python',[]]);
  for(const [command,prefix] of candidates){
    if(path.isAbsolute(command)&&!fs.existsSync(command))continue;
    const probe=spawnSync(command,[...prefix,'-c','import sqlite3'],{stdio:'ignore',windowsHide:true});
    if(probe.status===0)return {command,prefix};
  }
  throw new Error('Python with sqlite3 is required. Set PYTHON to its executable path.');
}

function findD1(){
  const directory=path.join(root,'.wrangler','state','v3','d1','miniflare-D1DatabaseObject');
  const candidates=fs.readdirSync(directory,{withFileTypes:true})
    .filter(item=>item.isFile()&&item.name.endsWith('.sqlite')&&item.name!=='metadata.sqlite')
    .map(item=>path.join(directory,item.name));
  if(candidates.length!==1)throw new Error(`Expected one local D1 database, found ${candidates.length}`);
  return candidates[0];
}

function sha256(file){return createHash('sha256').update(fs.readFileSync(file)).digest('hex')}

fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(staging,{recursive:true});
const {command:python,prefix}=findPython();
const source=findD1();
const verifier=path.join(root,'scripts','verify-sql-backup.py');
const exportDir=path.join(staging,'export');
const restoredDir=path.join(staging,'restored');
const keyFile=path.join(staging,'rehearsal-identity.txt');

try{
  const initial=run(python,[...prefix,verifier,'--source',source,'--backup-dir',exportDir],{json:true});
  const ageTools=run(process.execPath,[path.join(root,'scripts','backup','install-age.mjs')],{json:true});
  run(ageTools.keygen,['-o',keyFile]);
  const keyText=fs.readFileSync(keyFile,'utf8');
  const recipient=keyText.match(/^# public key: (age1\S+)$/m)?.[1];
  if(!recipient)throw new Error('Unable to read the temporary rehearsal recipient');

  const sqlPlain=path.join(exportDir,'d1-baseline.sql');
  const manifestPlain=path.join(exportDir,'restore-verification.json');
  const sqlEncrypted=path.join(output,`backup-${date}.sql.age`);
  const manifestEncrypted=path.join(output,`manifest-${date}.json.age`);
  const checksum=path.join(output,`backup-${date}.sha256`);
  run(ageTools.binary,['-r',recipient,'-o',sqlEncrypted,sqlPlain]);
  run(ageTools.binary,['-r',recipient,'-o',manifestEncrypted,manifestPlain]);
  fs.writeFileSync(checksum,
    `${sha256(sqlEncrypted)}  ${path.basename(sqlEncrypted)}\n${sha256(manifestEncrypted)}  ${path.basename(manifestEncrypted)}\n`,
    'utf8');

  const decryptedSql=path.join(staging,'decrypted.sql');
  const decryptedManifest=path.join(staging,'decrypted-manifest.json');
  run(ageTools.binary,['-d','-i',keyFile,'-o',decryptedSql,sqlEncrypted]);
  run(ageTools.binary,['-d','-i',keyFile,'-o',decryptedManifest,manifestEncrypted]);
  const restored=run(python,[...prefix,verifier,'--sql',decryptedSql,'--backup-dir',restoredDir,'--expected-report',decryptedManifest],{json:true});
  if(!initial.matches||!restored.matches)throw new Error('Rehearsal verification did not match');

  const report={
    rehearsal:'local-empty-d1',date,
    encryptedFiles:[path.basename(sqlEncrypted),path.basename(manifestEncrypted),path.basename(checksum)],
    integrity:restored.snapshot.integrity,
    schemaSha256:restored.snapshot.schema_sha256,
    tables:restored.snapshot.tables,
    sqlSha256:restored.sql_sha256,
    exportRestoreMatches:initial.matches,
    decryptRestoreMatches:restored.matches,
    plaintextRemoved:true,
    ephemeralPrivateKeyRemoved:true,
  };
  fs.writeFileSync(path.join(output,'rehearsal-report.json'),JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify(report,null,2));
}finally{
  fs.rmSync(staging,{recursive:true,force:true});
}
