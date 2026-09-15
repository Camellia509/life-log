import {defaultSettings,type Habit,type LifeRecord,type Settings} from '../../lib/life';
import {body,cleanUser,createSession,db,equal,fail,guard,json,limit,mustUser,passwordHash,randomToken,seedHabits,unpack,user,validateHabit,validateRecord} from './server';
import type {Env} from './types';

function parts(request:Request){return new URL(request.url).pathname.replace(/^\/api\/life\/?/,'').split('/').filter(Boolean)}

export function handleApi(request:Request,env:Env){return guard(async()=>{
  const [operation,id]=parts(request);
  if(request.method==='GET'){
    const current=await user(request,env);
    if(operation==='session'){
      const count=await db(env).prepare('SELECT COUNT(*) AS n FROM users').first<{n:number}>();
      return json({user:current?cleanUser(current):null,setup:count?.n===0,canSetup:env.MINT_LOCAL_SETUP==='1'||!!(env.MINT_OWNER_EMAIL&&env.MINT_SETUP_TOKEN),setupCodeRequired:env.MINT_LOCAL_SETUP!=='1'});
    }
    const account=current||await mustUser(request,env);
    if(operation==='sessions'){
      const now=Date.now();
      const rows=await db(env).prepare('SELECT id,device_label AS deviceLabel,created_at AS createdAt,last_used_at AS lastUsedAt,expires AS expiresAt FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires>? ORDER BY last_used_at DESC').bind(account.id,now).all();
      return json(rows.results.map(row=>({...row,current:row.id===account.sessionId})));
    }
    if(operation==='records'){
      const month=new URL(request.url).searchParams.get('month');
      const rows=month?await db(env).prepare('SELECT * FROM records WHERE date LIKE ? ORDER BY date DESC,updated DESC').bind(month+'%').all():await db(env).prepare('SELECT * FROM records ORDER BY date DESC,updated DESC').all();
      return json(rows.results.map(unpack));
    }
    if(operation==='habits'){
      const rows=await db(env).prepare('SELECT * FROM habits ORDER BY rowid').all();
      return json(rows.results.map(row=>({...JSON.parse(String(row.payload)),revision:row.revision})));
    }
    return json({error:'未找到'},404);
  }

  if(request.method==='POST'){
    const parsed=await body(request);
    if(operation==='login'||operation==='setup'){
      const email=String(parsed.email||'').trim().toLowerCase();
      const password=String(parsed.password||'');
      const deviceId=parsed.deviceId;
      if(String(deviceId||'').length<16||String(deviceId||'').length>200)fail(400,'设备标识无效，请刷新页面后重试');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<12||password.length>200)fail(400,'请填写有效邮箱和至少 12 位密码');
      await limit(env,'login:'+email);
      await limit(env,'ip:'+(request.headers.get('cf-connecting-ip')||'local'),60);
      if(operation==='login'){
        const found=await db(env).prepare('SELECT * FROM users WHERE email=?').bind(email).first<{id:string;password:string;salt:string}>();
        const test=await passwordHash(password,found?.salt||'missing-user-salt');
        if(!found||!equal(test,found.password))fail(401,'邮箱或密码不正确');
        return json({ok:true,...await createSession(env,found.id,request,deviceId)});
      }
      const name=String(parsed.name||'').trim().slice(0,40);
      if(!name)fail(400,'请填写昵称');
      if(env.MINT_LOCAL_SETUP!=='1'&&(!env.MINT_OWNER_EMAIL||env.MINT_OWNER_EMAIL.toLowerCase()!==email||!env.MINT_SETUP_TOKEN||!equal(String(parsed.setupCode||''),env.MINT_SETUP_TOKEN)))fail(403,'请使用管理员邮箱和正确的空间创建码');
      const salt=randomToken();
      const digest=await passwordHash(password,salt);
      const created=await db(env).prepare('INSERT INTO users(id,email,name,password,salt,settings) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM users)').bind('personal',email,name,digest,salt,JSON.stringify(defaultSettings)).run();
      if(!created.meta.changes)fail(409,'网站已初始化，请登录');
      await seedHabits(env);
      return json({ok:true,...await createSession(env,'personal',request,deviceId)});
    }

    const account=await mustUser(request,env);
    if(operation==='logout'){
      await db(env).prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND user_id=?').bind(Date.now(),account.sessionId,account.id).run();
      return json({ok:true});
    }
    if(operation==='record'){
      const record=parsed as unknown as LifeRecord;
      validateRecord(record);
      const recordId=record.id||crypto.randomUUID();
      if(record.id){
        const result=await db(env).prepare('UPDATE records SET kind=?,date=?,payload=?,revision=revision+1,updated=? WHERE id=? AND revision=?').bind(record.kind,record.date,JSON.stringify(record.data),new Date().toISOString(),recordId,record.revision).run();
        if(!result.meta.changes)fail(409,'这条记录已在其他设备更新，请刷新后重试');
      }else{
        if(['sleep','meal'].includes(record.kind)&&await db(env).prepare('SELECT id FROM records WHERE kind=? AND date=?').bind(record.kind,record.date).first())fail(409,'这一天已有记录，请编辑原记录');
        await db(env).prepare('INSERT INTO records(id,kind,date,payload,updated) VALUES(?,?,?,?,?)').bind(recordId,record.kind,record.date,JSON.stringify(record.data),new Date().toISOString()).run();
      }
      return json({id:recordId});
    }
    if(operation==='check'){
      const habitId=String(parsed.habitId||'');
      const date=String(parsed.date||'');
      const habit=await db(env).prepare('SELECT payload FROM habits WHERE id=?').bind(habitId).first<{payload:string}>();
      if(!habit)fail(404,'习惯不存在');
      const data=JSON.parse(habit.payload) as Habit;
      const previous=await db(env).prepare("SELECT id FROM records WHERE kind='check' AND date=? AND (json_extract(payload,'$.habitId')=? OR (json_extract(payload,'$.name')=? AND json_extract(payload,'$.category')=?)) LIMIT 1").bind(date,habitId,data.name,data.category).first<{id:string}>();
      const recordId=previous?.id||'check:'+habitId+':'+date;
      const record={id:recordId,revision:1,kind:'check',date,data:{habitId,name:data.name,category:data.category,minutes:data.minutes,complete:!!parsed.complete}} as LifeRecord;
      validateRecord(record);
      await db(env).prepare('INSERT INTO records(id,kind,date,payload,updated) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=records.revision+1,updated=excluded.updated').bind(recordId,'check',date,JSON.stringify(record.data),new Date().toISOString()).run();
      return json({ok:true});
    }
    if(operation==='habit'){
      const habit=parsed as unknown as Habit;
      validateHabit(habit);
      if(habit.id){
        const result=await db(env).prepare('UPDATE habits SET payload=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(habit),habit.id,habit.revision).run();
        if(!result.meta.changes)fail(409,'习惯已在其他设备更新，请刷新');
      }else{
        habit.id=crypto.randomUUID();
        await db(env).prepare('INSERT INTO habits(id,payload) VALUES(?,?)').bind(habit.id,JSON.stringify(habit)).run();
      }
      return json({ok:true});
    }
    if(operation==='settings'){
      const settings=parsed.settings as Settings;
      if(!settings||!Array.isArray(settings.hidden)||settings.hidden.some(item=>!['sleep','study','meal','运动','清洁','每日 SOP'].includes(String(item)))||!Number.isFinite(settings.sleepGoal)||settings.sleepGoal<1||settings.sleepGoal>24||!Number.isFinite(settings.studyGoal)||settings.studyGoal<1||settings.studyGoal>1440||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(settings.bedtime)||String(settings.focus).length>2000)fail(400,'目标设置无效');
      const result=await db(env).prepare('UPDATE users SET settings=?,name=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(settings),String(parsed.name||account.name).slice(0,40),account.id,parsed.revision).run();
      if(!result.meta.changes)fail(409,'设置已在其他设备更新，请刷新');
      return json({ok:true});
    }
    if(operation==='import'){
      if(!Array.isArray(parsed.records)||parsed.records.length>40)fail(400,'单次请求最多导入 40 条记录');
      const existing=(await db(env).prepare('SELECT kind,date,payload FROM records').all()).results;
      const key=(record:LifeRecord)=>record.kind+'|'+record.date+'|'+(record.kind==='study'?JSON.stringify(Object.fromEntries(Object.entries(record.data).sort(([left],[right])=>left.localeCompare(right)))):record.kind==='check'?String(record.data.name):'');
      const known=new Set(existing.map(row=>key(unpack(row))));
      const unique:LifeRecord[]=[];
      let skipped=0;
      for(const item of parsed.records){const record=item as LifeRecord;validateRecord(record);const recordKey=key(record);if(known.has(recordKey)){skipped++;continue}known.add(recordKey);unique.push(record)}
      if(unique.length)await db(env).batch(unique.map(record=>db(env).prepare('INSERT INTO records(id,kind,date,payload,updated) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),record.kind,record.date,JSON.stringify(record.data),new Date().toISOString())));
      return json({imported:unique.length,skipped});
    }
    return json({error:'未找到'},404);
  }

  if(request.method==='DELETE'){
    const account=await mustUser(request,env);
    if(operation==='record'){
      const record=await db(env).prepare('SELECT id FROM records WHERE id=?').bind(id).first();
      if(!record)fail(404,'记录不存在');
      await db(env).prepare('DELETE FROM records WHERE id=?').bind(id).run();
      return json({ok:true});
    }
    if(operation==='sessions'){
      const result=await db(env).prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL').bind(Date.now(),id,account.id).run();
      if(!result.meta.changes)fail(404,'会话不存在');
      return json({ok:true,current:id===account.sessionId});
    }
    return json({error:'未找到'},404);
  }

  return json({error:'不支持的请求方法'},405,{'Allow':'GET, POST, DELETE, OPTIONS'});
})}
