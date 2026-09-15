import {spawn} from 'node:child_process';

const state=process.env.MINT_WORKER_STATE||'.wrangler/state';
const child=spawn(process.execPath,[
  '--import','./scripts/wrangler-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','worker/wrangler.jsonc',
  '--local','--persist-to',state,'--ip','127.0.0.1','--port','8787',
  '--var','MINT_LOCAL_SETUP:1',
],{stdio:'inherit'});

for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
