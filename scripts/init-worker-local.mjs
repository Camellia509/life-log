import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const state=process.env.MINT_WORKER_STATE||'.wrangler/state';
const marker=state==='.wrangler/state'?'.wrangler/local-migrations.json':`${state}/local-migrations.json`;
const applied=fs.existsSync(marker)?JSON.parse(fs.readFileSync(marker,'utf8')):[];

for(const name of fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort()){
  if(applied.includes(name))continue;
  const result=spawnSync(process.execPath,[
    '--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local',
    '--config','worker/wrangler.jsonc','--persist-to',state,'--file',`drizzle/${name}`,
  ],{stdio:'inherit'});
  if(result.status!==0)throw new Error(`Local Worker migration failed: ${name}`);
  applied.push(name);
  fs.mkdirSync(state,{recursive:true});
  fs.writeFileSync(marker,JSON.stringify(applied,null,2));
}

console.log(`Worker local storage is ready at ${state}. No cloud resources were used.`);
