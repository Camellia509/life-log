import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const version='1.3.2';
const platforms={
  'win32-x64':{archive:`age-v${version}-windows-amd64.zip`,sha256:'f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7',binary:'age.exe',keygen:'age-keygen.exe'},
  'linux-x64':{archive:`age-v${version}-linux-amd64.tar.gz`,sha256:'cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10',binary:'age',keygen:'age-keygen'},
};
const selected=platforms[`${process.platform}-${process.arch}`];
if(!selected)throw new Error(`Unsupported age platform: ${process.platform}-${process.arch}`);
const root=path.resolve(process.env.MINT_AGE_DIR||'work/tools/age');
const extractedDirectory=path.join(root,'age');
const binary=path.join(extractedDirectory,selected.binary);
const keygen=path.join(extractedDirectory,selected.keygen);

if(!fs.existsSync(binary)||!fs.existsSync(keygen)){
  fs.mkdirSync(root,{recursive:true});
  const archivePath=path.join(root,selected.archive);
  if(!fs.existsSync(archivePath)){
    const url=`https://github.com/FiloSottile/age/releases/download/v${version}/${selected.archive}`;
    const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(120_000)});
    if(!response.ok)throw new Error(`Unable to download age: HTTP ${response.status}`);
    fs.writeFileSync(archivePath,Buffer.from(await response.arrayBuffer()));
  }
  const digest=createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
  if(digest!==selected.sha256){fs.rmSync(archivePath,{force:true});throw new Error(`age archive SHA-256 mismatch: ${digest}`)}
  fs.rmSync(extractedDirectory,{recursive:true,force:true});
  const extracted=spawnSync('tar',['-xf',archivePath,'-C',root],{stdio:'inherit'});
  if(extracted.status!==0)throw new Error('Unable to extract the verified age archive');
}
if(process.platform!=='win32')for(const item of [binary,keygen])fs.chmodSync(item,0o755);
console.log(JSON.stringify({version,binary,keygen}));
