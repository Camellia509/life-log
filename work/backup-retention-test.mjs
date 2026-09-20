import assert from 'node:assert/strict';
import {retentionPlan} from '../scripts/backup/retention.mjs';

const dates=['2026-09-20','2026-09-19','2026-09-18','2026-09-17','2026-09-16','2026-09-15','2026-09-14','2026-09-13','2026-09-06','2026-08-30','2026-08-23','2026-07-31','2026-06-30','2026-05-31','2026-04-30','2026-03-31','2026-02-28'];
const files=dates.flatMap(date=>[`backup-${date}.sql.age`,`manifest-${date}.json.age`,`backup-${date}.sha256`]);
files.push('README.md','backup-2026-01-01.sql.age');
const plan=retentionPlan(files);
assert.deepEqual(plan.keep.slice(0,7),dates.slice(0,7));
assert.ok(plan.keep.includes('2026-09-13'),'weekly representative must be retained');
assert.ok(plan.keep.includes('2026-08-30'),'monthly representative must be retained');
assert.ok(plan.keep.includes('2026-04-30'),'sixth monthly representative must be retained');
assert.ok(plan.remove.includes('2026-03-31'),'older monthly representative must be removed');
assert.equal(plan.available.includes('2026-01-01'),false,'incomplete triples must never enter pruning');
assert.equal(new Set(plan.keep).size,plan.keep.length);
console.log(JSON.stringify({passed:7,checks:['latest daily set','weekly representative','monthly representative','monthly boundary','old backup removal','incomplete triple ignored','deduplicated union']},null,2));
