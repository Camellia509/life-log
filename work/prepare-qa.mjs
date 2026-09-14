import fs from 'node:fs';import path from 'node:path';
const c=JSON.parse(fs.readFileSync('dist/server/wrangler.json','utf8'));c.main=path.resolve('dist/server/index.js');c.assets.directory=path.resolve('dist/client');c.vars={MINT_LOCAL_SETUP:'1'};fs.writeFileSync('work/qa-wrangler.json',JSON.stringify(c));
