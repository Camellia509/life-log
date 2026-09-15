import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('dist');
const indexPath=path.join(root,'index.html');
assert.ok(fs.existsSync(indexPath),'dist/index.html must exist');
assert.equal(fs.existsSync(path.join(root,'server')),false,'static build must not contain a server bundle');
assert.equal(fs.existsSync(path.join(root,'_next')),false,'static build must not contain Next assets');

const html=fs.readFileSync(indexPath,'utf8');
assert.match(html,/\/life-log\/assets\//,'built entry must use the GitHub Pages base path');
assert.match(html,/\/life-log\/favicon\.svg/,'favicon must use the GitHub Pages base path');

const references=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1]);
for(const reference of references.filter(value=>value.startsWith('/life-log/'))){
  const relative=reference.slice('/life-log/'.length).split(/[?#]/,1)[0];
  assert.ok(fs.existsSync(path.join(root,relative)),`referenced file is missing: ${reference}`);
}

for(const name of ['bouquet.png','landscape.png','favicon.svg']){
  assert.ok(fs.existsSync(path.join(root,name)),`${name} must be copied into dist`);
}

const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));
for(const removed of ['next','next-themes','vinext','react-server-dom-webpack','@vitejs/plugin-rsc','@cloudflare/vite-plugin']){
  assert.equal(packageJson.dependencies?.[removed]??packageJson.devDependencies?.[removed],undefined,`${removed} must be removed`);
}

const js=fs.readdirSync(path.join(root,'assets')).filter(name=>name.endsWith('.js')).map(name=>fs.readFileSync(path.join(root,'assets',name),'utf8')).join('\n');
const expectedApi=process.env.STATIC_EXPECTED_API_BASE_URL||'http://localhost:8787';
assert.ok(js.includes(expectedApi),'bundle must contain the configured Worker origin');
for(const route of ['/records','/habits','/settings'])assert.ok(js.includes(route),`hash route missing from bundle: ${route}`);
assert.equal(fs.existsSync(path.join(root,'service-worker.js')),false,'PWA service worker is deferred');

console.log(JSON.stringify({passed:10,checks:['static index','no server bundle','no Next assets','base-aware assets','base-aware favicon','all entry references exist','watercolor assets copied','Next and Vinext dependencies removed','configured Worker origin and hash routes bundled','PWA deferred']},null,2));
