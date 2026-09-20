import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const candidates=process.platform==='win32'?
  [[process.env.PYTHON,[]],[path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe'),[]],['py',['-3']],['python',[]]]:
  [[process.env.PYTHON,[]],['python3',[]],['python',[]]];
const selected=candidates.find(([command,args])=>{
  if(!command||(path.isAbsolute(command)&&!fs.existsSync(command)))return false;
  return spawnSync(command,[...args,'-c','import sqlite3'],{stdio:'ignore'}).status===0;
});
if(!selected){console.error('No Python runtime with sqlite3 found');process.exit(1)}
const [command,prefix]=selected;
const result=spawnSync(command,[...prefix,'work/migration-test.py'],{stdio:'inherit'});

if(result.error){
  console.error(`Unable to start ${command}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status??1);
