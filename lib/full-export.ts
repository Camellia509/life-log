import type {Habit,LifeRecord,Settings} from './life';

export const FULL_EXPORT_FORMAT='mint-creek-full-export' as const;
export const FULL_EXPORT_VERSION=1 as const;

export type ExportSession={id:string;deviceLabel:string;createdAt:number;lastUsedAt:number;expiresAt:number;revokedAt:number|null;status:'active'|'expired'|'revoked';current:boolean};
export type FullExportPayload={
  format:typeof FULL_EXPORT_FORMAT;
  version:typeof FULL_EXPORT_VERSION;
  exportedAt:string;
  account:{id:string;email:string;name:string;revision:number};
  settings:Settings;
  records:LifeRecord[];
  habits:Habit[];
  sessions:ExportSession[];
};
export type FullExportFile=FullExportPayload&{integrity:{algorithm:'SHA-256';contentSha256:string}};

function canonical(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256(value:string){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),item=>item.toString(16).padStart(2,'0')).join('');
}

export async function sealFullExport(payload:FullExportPayload):Promise<FullExportFile>{
  if(payload.format!==FULL_EXPORT_FORMAT||payload.version!==FULL_EXPORT_VERSION)throw new Error('完整备份格式无效');
  return {...payload,integrity:{algorithm:'SHA-256',contentSha256:await sha256(canonical(payload))}};
}

export function downloadFullExport(file:FullExportFile){
  const stamp=file.exportedAt.replace(/[:.]/g,'-').replace('T','_').replace('Z','');
  const blob=new Blob([JSON.stringify(file,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=`薄荷溪居-完整数据-${stamp}.json`;
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),10_000);
}

function isObject(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)}

export async function parseFullExport(file:File){
  if(!file.name.toLowerCase().endsWith('.json'))throw new Error('请选择本站导出的 .json 完整备份');
  if(file.size>10*1024*1024)throw new Error('完整备份文件上限为 10 MB');
  let value:unknown;
  try{value=JSON.parse(await file.text())}catch{throw new Error('完整备份不是有效的 JSON 文件')}
  if(!isObject(value)||value.format!==FULL_EXPORT_FORMAT||value.version!==FULL_EXPORT_VERSION||!isObject(value.integrity)||value.integrity.algorithm!=='SHA-256'||typeof value.integrity.contentSha256!=='string')throw new Error('完整备份格式或版本不受支持');
  const {integrity,...payload}=value;
  if(await sha256(canonical(payload))!==integrity.contentSha256)throw new Error('完整备份校验失败，文件可能不完整或已被修改');
  if(!Array.isArray(payload.records)||!Array.isArray(payload.habits)||!Array.isArray(payload.sessions)||!isObject(payload.account)||!isObject(payload.settings))throw new Error('完整备份缺少必要数据');
  const records=payload.records as LifeRecord[];
  const invalid=records.some(record=>!isObject(record)||!['sleep','study','meal','check'].includes(String(record.kind))||!/^\d{4}-\d{2}-\d{2}$/.test(String(record.date))||!isObject(record.data));
  if(invalid)throw new Error('完整备份中的记录格式无效');
  return {
    records,
    warnings:[`备份包含 ${payload.habits.length} 个习惯和设置摘要；为避免覆盖当前配置，本次只恢复记录。`],
    summary:{accountName:String(payload.account.name||''),habitCount:payload.habits.length,sessionCount:payload.sessions.length,focusCount:Object.keys((payload.settings as Settings).focusByMonth||{}).length},
  };
}
