import {spawn} from 'node:child_process';

const child=spawn(process.execPath,[
  '--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','worker/wrangler.jsonc',
  '--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--port','8787',
  '--var','MINT_LOCAL_SETUP:1',
],{stdio:'inherit'});

for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
