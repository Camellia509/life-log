import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const file='ops/backup-repo/.github/workflows/backup.yml';
const workflow=fs.readFileSync(file,'utf8');
const checks=[];
function check(name,condition){assert.ok(condition,name);checks.push(name)}

check('template is isolated from active workflows',!file.startsWith('.github/workflows/'));
check('daily schedule and manual trigger',workflow.includes('schedule:')&&workflow.includes('workflow_dispatch:'));
check('remote D1 export is explicit',workflow.includes('d1 export')&&workflow.includes('--remote'));
check('wrangler config has explicit account id',workflow.includes('account_id = "$CLOUDFLARE_ACCOUNT_ID"'));
check('read-only D1 preflight precedes export',workflow.includes('Preflight D1 read access')&&workflow.indexOf('Preflight D1 read access')<workflow.indexOf('Export remote D1'));
check('preflight uses database metadata GET',workflow.includes('--request GET')&&workflow.includes('/d1/database/$D1_DATABASE_ID'));
check('secret edge whitespace is rejected safely',workflow.includes('contains leading or trailing whitespace')&&!workflow.includes('echo "$CF_API_TOKEN"'));
check('preflight response is removed',workflow.includes('d1-preflight.json')&&workflow.includes('if: always()'));
check('export failure is explicit and guarded',workflow.includes('D1 export failed')&&workflow.includes('test -s "$RUNNER_TEMP/new-backup/export.sql"'));
check('no plaintext artifact upload',!workflow.includes('upload-artifact'));
check('age recipient comes from secret',workflow.includes('secrets.BACKUP_AGE_RECIPIENT'));
check('new backup validation precedes snapshot rebuild',workflow.indexOf('Verify, encrypt, and checksum')<workflow.indexOf('Build retained snapshot'));
check('documented backup variables are consumed',workflow.includes('vars.BACKUP_BRANCH')&&workflow.includes('vars.BACKUP_KEEP_DAILY')&&workflow.includes('vars.BACKUP_KEEP_WEEKLY')&&workflow.includes('vars.BACKUP_KEEP_MONTHLY'));
check('backup branch and retention values are validated',workflow.includes('git check-ref-format --branch')&&workflow.includes("*[!0-9]*"));
check('remote branch existence is checked before fetch',workflow.includes('ls-remote --exit-code --heads')&&workflow.indexOf('ls-remote --exit-code --heads')<workflow.indexOf('fetch --no-tags origin'));
check('missing remote branch is an explicit first-run case',workflow.includes('REMOTE_BRANCH_STATUS')&&workflow.includes('2)')&&workflow.includes('creating the first parentless snapshot'));
check('unexpected remote lookup failures stop safely',workflow.includes('Snapshot branch check failed')&&workflow.includes('exit "$REMOTE_BRANCH_STATUS"'));
check('snapshot fetch maps the configured remote branch',workflow.includes('refs/heads/$BACKUP_BRANCH:refs/remotes/origin/$BACKUP_BRANCH'));
check('remote snapshot commit is verified',workflow.includes('rev-parse --verify "refs/remotes/origin/$BACKUP_BRANCH^{commit}"'));
check('archive extraction requires a non-empty tree',workflow.includes('ls-tree -r --name-only')&&workflow.includes('test -s "$RUNNER_TEMP/existing-snapshot-files"'));
check('missing branch is not hidden by unconditional success',!workflow.includes('fetch origin "refs/heads/$BACKUP_BRANCH:refs/remotes/origin/$BACKUP_BRANCH" || true'));
check('publish uses dynamic branch lease protection',workflow.includes('--force-with-lease=refs/heads/$BACKUP_BRANCH:'));
check('first publish requires the branch to remain absent',workflow.includes('only if the remote branch is still absent')&&workflow.includes('LEASE="--force-with-lease=refs/heads/$BACKUP_BRANCH:"'));
check('snapshot commit has no parent',workflow.includes('commit-tree "$TREE"')&&!workflow.includes('commit-tree "$TREE" -p'));
check('temporary plaintext is removed',workflow.includes('if: always()')&&workflow.includes('wrangler-backup.toml'));

const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'mint-backup-first-run-'));
const remote=path.join(tempRoot,'remote.git');
const local=path.join(tempRoot,'local');
function git(cwd,args){return childProcess.execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()}
try{
  git(tempRoot,['init','--bare',remote]);
  fs.mkdirSync(local);
  git(local,['init']);
  git(local,['config','user.name','backup-test']);
  git(local,['config','user.email','backup-test@example.invalid']);
  fs.writeFileSync(path.join(local,'backup.sql.age'),'encrypted-test-placeholder');
  git(local,['add','backup.sql.age']);
  git(local,['commit','-m','first parentless snapshot']);
  const firstCommit=git(local,['rev-parse','HEAD']);
  git(local,['push',remote,`${firstCommit}:refs/heads/backups`,'--force-with-lease=refs/heads/backups:']);
  check('empty lease creates an absent backup branch',git(local,['--git-dir',remote,'rev-parse','refs/heads/backups'])===firstCommit);
  check('first backup branch commit is parentless',git(local,['--git-dir',remote,'rev-list','--parents','-n','1','refs/heads/backups']).split(/\s+/).length===1);
  fs.writeFileSync(path.join(local,'backup.sql.age'),'second-encrypted-test-placeholder');
  git(local,['add','backup.sql.age']);
  git(local,['commit','-m','competing snapshot']);
  const competingCommit=git(local,['rev-parse','HEAD']);
  assert.throws(()=>git(local,['push',remote,`${competingCommit}:refs/heads/backups`,'--force-with-lease=refs/heads/backups:']));
  check('empty lease refuses to overwrite an existing branch',git(local,['--git-dir',remote,'rev-parse','refs/heads/backups'])===firstCommit);
}finally{
  const resolvedTemp=fs.realpathSync(tempRoot);
  const resolvedOsTemp=fs.realpathSync(os.tmpdir());
  assert.ok(resolvedTemp.startsWith(`${resolvedOsTemp}${path.sep}`),'temporary test directory escaped the OS temp directory');
  fs.rmSync(resolvedTemp,{recursive:true,force:true});
}

console.log(JSON.stringify({passed:checks.length,checks},null,2));
