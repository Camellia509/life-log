import {spawnSync} from 'node:child_process';

const command=process.platform==='win32'?'py':'python3';
const args=process.platform==='win32'?['-3','work/migration-test.py']:['work/migration-test.py'];
const result=spawnSync(command,args,{stdio:'inherit'});

if(result.error){
  console.error(`Unable to start ${command}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status??1);
