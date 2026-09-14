import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
if(!fs.existsSync('dist/server/wrangler.json'))throw new Error('Build the project before initializing local storage.');
const marker='.wrangler/local-migrations.json';const applied=fs.existsSync(marker)?JSON.parse(fs.readFileSync(marker,'utf8')):[];
for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){if(applied.includes(name))continue;const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file','drizzle/'+name],{stdio:'inherit'});if(r.status!==0)throw new Error('Local migration failed: '+name);applied.push(name);fs.mkdirSync('.wrangler',{recursive:true});fs.writeFileSync(marker,JSON.stringify(applied))}
console.log('Local storage is ready. No cloud resources were created.');
