import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const pattern=/^backup-(\d{4}-\d{2}-\d{2})\.sql\.age$/;
const companions=date=>[`backup-${date}.sql.age`,`manifest-${date}.json.age`,`backup-${date}.sha256`];
function isoWeek(date){
  const value=new Date(date+'T00:00:00Z');
  value.setUTCDate(value.getUTCDate()+4-(value.getUTCDay()||7));
  const start=new Date(Date.UTC(value.getUTCFullYear(),0,1));
  return `${value.getUTCFullYear()}-${String(Math.ceil((((value-start)/86400000)+1)/7)).padStart(2,'0')}`;
}
export function retentionPlan(files,{daily=7,weekly=4,monthly=6}={}){
  const available=[...new Set(files.map(name=>name.match(pattern)?.[1]).filter(Boolean))].filter(date=>companions(date).every(name=>files.includes(name))).sort().reverse();
  const keep=new Set(available.slice(0,daily));
  const weeks=new Set(),months=new Set();
  for(const date of available){const week=isoWeek(date);if(weeks.size<weekly&&!weeks.has(week)){weeks.add(week);keep.add(date)}const month=date.slice(0,7);if(months.size<monthly&&!months.has(month)){months.add(month);keep.add(date)}}
  return {available,keep:[...keep].sort().reverse(),remove:available.filter(date=>!keep.has(date))};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).map(value=>{const [key,item='1']=value.replace(/^--/,'').split('=',2);return [key,item]}));
  if(!args.dir)throw new Error('Usage: retention.mjs --dir=<backup-directory> [--dry-run]');
  const directory=path.resolve(args.dir);
  const files=fs.existsSync(directory)?fs.readdirSync(directory):[];
  const plan=retentionPlan(files,{daily:Number(args.daily||7),weekly:Number(args.weekly||4),monthly:Number(args.monthly||6)});
  if(!('dry-run' in args))for(const date of plan.remove)for(const name of companions(date))fs.rmSync(path.join(directory,name),{force:true});
  console.log(JSON.stringify({...plan,dryRun:'dry-run' in args},null,2));
}
