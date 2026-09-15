import {body,cleanUser,csrf,db,equal,fail,guard,hash,json,limit,mustUser,passwordHash,random,runtime,seedHabits,session,unpack,user,validateHabit,validateRecord} from '@/lib/server';
import {defaultSettings,type LifeRecord} from '@/lib/life';

export const dynamic='force-dynamic';

function parts(req:Request){return new URL(req.url).pathname.replace(/^\/api\/life\/?/,'').split('/')}

export async function GET(req:Request){return guard(async()=>{
  const [op]=parts(req);
  const u=await user(req);
  if(op==='session'){
    const n=await db().prepare('SELECT COUNT(*) AS n FROM users').first<{n:number}>();
    return json({user:u?cleanUser(u):null,setup:n?.n===0,canSetup:runtime.MINT_LOCAL_SETUP==='1'||!!(runtime.MINT_OWNER_EMAIL&&runtime.MINT_SETUP_TOKEN),setupCodeRequired:runtime.MINT_LOCAL_SETUP!=='1'});
  }
  if(!u)fail(401,'请先登录');
  if(op==='records'){
    const month=new URL(req.url).searchParams.get('month');
    const rows=month
      ?await db().prepare('SELECT * FROM records WHERE date LIKE ? ORDER BY date DESC,updated DESC').bind(month+'%').all()
      :await db().prepare('SELECT * FROM records ORDER BY date DESC,updated DESC').all();
    return json(rows.results.map(unpack));
  }
  if(op==='habits'){
    const rows=await db().prepare('SELECT * FROM habits ORDER BY rowid').all();
    return json(rows.results.map(h=>({...JSON.parse(String(h.payload)),revision:h.revision})));
  }
  return json({error:'未找到'},404);
})}

export async function POST(req:Request){return guard(async()=>{
  const [op]=parts(req);
  const parsed=await body(req);
  csrf(req);
  if(op==='login'||op==='setup'){
    const email=String(parsed.email||'').trim().toLowerCase();
    const password=String(parsed.password||'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<12||password.length>200)fail(400,'请填写有效邮箱和至少 12 位密码');
    await limit('login:'+email);
    await limit('ip:'+(req.headers.get('cf-connecting-ip')||'local'),60);
    if(op==='login'){
      const found=await db().prepare('SELECT * FROM users WHERE email=?').bind(email).first<{id:string;password:string;salt:string}>();
      const test=await passwordHash(password,found?.salt||'missing-user-salt');
      if(!found||!equal(test,found.password))fail(401,'邮箱或密码不正确');
      return json({ok:true},200,{'Set-Cookie':await session(found.id,req)});
    }
    const name=String(parsed.name||'').trim().slice(0,40);
    if(!name)fail(400,'请填写昵称');
    const allowed=runtime.MINT_OWNER_EMAIL;
    if(runtime.MINT_LOCAL_SETUP!=='1'&&(!allowed||allowed.toLowerCase()!==email||!runtime.MINT_SETUP_TOKEN||!equal(String(parsed.setupCode||''),runtime.MINT_SETUP_TOKEN)))fail(403,'请使用管理员邮箱和正确的空间创建码');
    const salt=random();
    const passwordDigest=await passwordHash(password,salt);
    const created=await db().prepare('INSERT INTO users(id,email,name,password,salt,settings) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM users)').bind('personal',email,name,passwordDigest,salt,JSON.stringify(defaultSettings)).run();
    if(!created.meta.changes)fail(409,'网站已初始化，请登录');
    await seedHabits();
    return json({ok:true},200,{'Set-Cookie':await session('personal',req)});
  }

  const u=await mustUser(req);
  if(op==='logout'){
    const token=req.headers.get('cookie')?.match(/mint_session=([a-f0-9]{64})/)?.[1];
    if(token)await db().prepare('DELETE FROM sessions WHERE token=?').bind(await hash(token)).run();
    return json({ok:true},200,{'Set-Cookie':'mint_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
  }
  const b=parsed;
  if(op==='record'){
    validateRecord(b);
    const id=b.id||crypto.randomUUID();
    if(b.id){
      const result=await db().prepare('UPDATE records SET kind=?,date=?,payload=?,revision=revision+1,updated=? WHERE id=? AND revision=?').bind(b.kind,b.date,JSON.stringify(b.data),new Date().toISOString(),id,b.revision).run();
      if(!result.meta.changes)fail(409,'这条记录已在其他设备更新，请刷新后重试');
    }else{
      if(['sleep','meal'].includes(b.kind)&&await db().prepare('SELECT id FROM records WHERE kind=? AND date=?').bind(b.kind,b.date).first())fail(409,'这一天已有记录，请编辑原记录');
      await db().prepare('INSERT INTO records(id,kind,date,payload,updated) VALUES(?,?,?,?,?)').bind(id,b.kind,b.date,JSON.stringify(b.data),new Date().toISOString()).run();
    }
    return json({id});
  }
  if(op==='check'){
    const habit=await db().prepare('SELECT payload FROM habits WHERE id=?').bind(b.habitId).first<{payload:string}>();
    if(!habit)fail(404,'习惯不存在');
    const data=JSON.parse(habit.payload);
    const previous=await db().prepare("SELECT id FROM records WHERE kind='check' AND date=? AND (json_extract(payload,'$.habitId')=? OR (json_extract(payload,'$.name')=? AND json_extract(payload,'$.category')=?)) LIMIT 1").bind(b.date,b.habitId,data.name,data.category).first<{id:string}>();
    const id=previous?.id||'check:'+b.habitId+':'+b.date;
    const record={id,revision:1,kind:'check',date:b.date,data:{habitId:b.habitId,name:data.name,category:data.category,minutes:data.minutes,complete:!!b.complete}} as LifeRecord;
    validateRecord(record);
    await db().prepare('INSERT INTO records(id,kind,date,payload,updated) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=records.revision+1,updated=excluded.updated').bind(id,'check',b.date,JSON.stringify(record.data),new Date().toISOString()).run();
    return json({ok:true});
  }
  if(op==='habit'){
    validateHabit(b);
    if(b.id){
      const result=await db().prepare('UPDATE habits SET payload=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(b),b.id,b.revision).run();
      if(!result.meta.changes)fail(409,'习惯已在其他设备更新，请刷新');
    }else{
      b.id=crypto.randomUUID();
      await db().prepare('INSERT INTO habits(id,payload) VALUES(?,?)').bind(b.id,JSON.stringify(b)).run();
    }
    return json({ok:true});
  }
  if(op==='settings'){
    const s=b.settings;
    if(!s||!Array.isArray(s.hidden)||s.hidden.some((x:unknown)=>!['sleep','study','meal','运动','清洁','每日 SOP'].includes(String(x)))||!Number.isFinite(s.sleepGoal)||s.sleepGoal<1||s.sleepGoal>24||!Number.isFinite(s.studyGoal)||s.studyGoal<1||s.studyGoal>1440||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.bedtime)||String(s.focus).length>2000)fail(400,'目标设置无效');
    const result=await db().prepare('UPDATE users SET settings=?,name=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(s),String(b.name||u.name).slice(0,40),u.id,b.revision).run();
    if(!result.meta.changes)fail(409,'设置已在其他设备更新，请刷新');
    return json({ok:true});
  }
  if(op==='import'){
    if(!Array.isArray(b.records)||b.records.length>40)fail(400,'单次请求最多导入 40 条记录');
    const existing=(await db().prepare('SELECT kind,date,payload FROM records').all()).results;
    const key=(r:LifeRecord)=>r.kind+'|'+r.date+'|'+(r.kind==='study'?JSON.stringify(Object.fromEntries(Object.entries(r.data).sort(([a],[b])=>a.localeCompare(b)))):r.kind==='check'?String(r.data.name):'');
    const known=new Set(existing.map(r=>key(unpack(r))));
    const unique:LifeRecord[]=[];
    let skipped=0;
    for(const record of b.records){validateRecord(record);const k=key(record);if(known.has(k)){skipped++;continue}known.add(k);unique.push(record)}
    if(unique.length)await db().batch(unique.map(record=>db().prepare('INSERT INTO records(id,kind,date,payload,updated) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),record.kind,record.date,JSON.stringify(record.data),new Date().toISOString())));
    return json({imported:unique.length,skipped});
  }
  return json({error:'未找到'},404);
})}

export async function DELETE(req:Request){return guard(async()=>{
  csrf(req);
  await mustUser(req);
  const [op,id]=parts(req);
  if(op==='record'){
    const record=await db().prepare('SELECT id FROM records WHERE id=?').bind(id).first();
    if(!record)fail(404,'记录不存在');
    await db().prepare('DELETE FROM records WHERE id=?').bind(id).run();
    return json({ok:true});
  }
  return json({error:'未找到'},404);
})}
