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
check('documented backup variables are consumed',workflow.includes('vars.BACKUP_BRANCH')&&workflow.includes('vars.BACKUP_KEEP_DAILY')&&workflow.includes('vars.BACKUP_KEEP_WEEKLY')&&workflow.includes('vars.BACKUP_KEEP_MONTHLY'));
check('backup branch and retention values are validated',workflow.includes('git check-ref-format --branch')&&workflow.includes("*[!0-9]*"));
check('snapshot fetch maps the configured remote branch',workflow.includes('refs/heads/$BACKUP_BRANCH:refs/remotes/origin/$BACKUP_BRANCH'));
check('publish uses dynamic branch lease protection',workflow.includes('--force-with-lease=refs/heads/$BACKUP_BRANCH:'));
check('snapshot commit has no parent',workflow.includes('commit-tree "$TREE"')&&!workflow.includes('commit-tree "$TREE" -p'));
check('temporary plaintext is removed',workflow.includes('if: always()')&&workflow.includes('wrangler-backup.toml'));

console.log(JSON.stringify({passed:checks.length,checks},null,2));
