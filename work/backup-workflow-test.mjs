import assert from 'node:assert/strict';
import fs from 'node:fs';

const file='ops/backup-repo/.github/workflows/backup.yml';
const workflow=fs.readFileSync(file,'utf8');
const checks=[];
function check(name,condition){assert.ok(condition,name);checks.push(name)}

check('template is isolated from active workflows',!file.startsWith('.github/workflows/'));
check('daily schedule and manual trigger',workflow.includes('schedule:')&&workflow.includes('workflow_dispatch:'));
check('remote D1 export is explicit',workflow.includes('d1 export')&&workflow.includes('--remote'));
check('no plaintext artifact upload',!workflow.includes('upload-artifact'));
check('age recipient comes from secret',workflow.includes('secrets.BACKUP_AGE_RECIPIENT'));
check('new backup validation precedes snapshot rebuild',workflow.indexOf('Verify, encrypt, and checksum')<workflow.indexOf('Build retained snapshot'));
check('publish uses lease protection',workflow.includes('--force-with-lease=refs/heads/backups:'));
check('temporary plaintext is removed',workflow.includes('if: always()')&&workflow.includes('wrangler-backup.toml'));

console.log(JSON.stringify({passed:checks.length,checks},null,2));
