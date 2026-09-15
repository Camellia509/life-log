export type Kind='sleep'|'study'|'meal'|'check';
export type Data=Record<string,string|number|boolean>;
export type LifeRecord={id:string;kind:Kind;date:string;data:Data;revision:number;updated?:string};
export type Habit={id:string;name:string;category:'运动'|'清洁'|'每日 SOP';frequency:'daily'|'weekly'|'biweekly'|'monthly';days:number[];monthDay:number;minutes:number;target:number;active:boolean;revision:number};
export type Settings={hidden:string[];sleepGoal:number;studyGoal:number;bedtime:string;focus:string;focusByMonth?:Record<string,string>};
export const defaultSettings:Settings={hidden:[],sleepGoal:8,studyGoal:120,bedtime:'23:30',focus:''};
export const labels={sleep:'睡眠',study:'学习',meal:'餐饮',check:'习惯打卡'};
export function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function daysInMonth(m:string){return new Date(Number(m.slice(0,4)),Number(m.slice(5)),0).getDate()}
export function sleepHours(d:Data){if(!d.bed||!d.wake)return null;const mins=(s:string)=>{const [h,m]=s.split(':').map(Number);return h*60+m};const n=(mins(String(d.wake))-mins(String(d.bed))+1440)%1440;return Math.round(n/6)/10}
export function onTime(d:Data,bedtime:string){if(!d.bed)return null;const n=(s:string)=>{const [h,m]=s.split(':').map(Number);return (h*60+m+720)%1440};return n(String(d.bed))<=n(bedtime)}
export function due(h:Habit,date:string){if(!h.active)return false;const d=new Date(date+'T12:00:00');if(h.frequency==='daily')return true;if(h.frequency==='weekly')return h.days.includes(d.getDay());if(h.frequency==='monthly')return d.getDate()===Math.min(h.monthDay,daysInMonth(date.slice(0,7)));const base=Date.UTC(2026,0,5);return Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-base)/86400000)%14===((h.days[0]??1)+6)%7}
export function countDue(h:Habit,month:string){return Array.from({length:daysInMonth(month)},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`).filter(d=>due(h,d)).length}
export function frequencyText(h:Habit){return h.frequency==='daily'?'每天':h.frequency==='weekly'?`每周${h.days.map(d=>'日一二三四五六'[d]).join('、')}`:h.frequency==='biweekly'?'每两周（以 2026-01-05 周为起点）':`每月 ${h.monthDay} 日`}
export function presets():Habit[]{const base={active:true,revision:1,monthDay:1,minutes:0,target:0};return [
...(['摸高-倒V-眼镜蛇式（不耸肩）','欧阳春晓 沙漏腰3.0','瘦小腿','开胯练臀','欧阳春晓练背','练手臂','超慢跑','静态力量训练','游泳','骑行','散步'].map((name,i)=>({...base,id:`exercise-${i}`,name,category:'运动' as const,frequency:'weekly' as const,days:i===10?[0,2,4]:[1,3,6],minutes:[10,30,20,15,15,6,20,15,0,0,0][i],target:[12,8,12,8,8,12,8,8,4,4,12][i]}))),
...(['桌面归位','垃圾清理','洗衣/晾衣','扫地/拖地','整理床铺/除浮毛','换洗床单枕套','水杯/水壶深度清洁','手机/键盘清洁','资料/杂物断舍离','手机相册、文件清理'].map((name,i)=>({...base,id:`clean-${i}`,name,category:'清洁' as const,frequency:(i<2?'daily':i<5?'weekly':[5,7].includes(i)?'biweekly':'monthly') as Habit['frequency'],days:i===2?[3,0]:i===3?[6]:[0],monthDay:i>=8?31:1}))) ];}
export function recordTitle(r:LifeRecord){return r.kind==='sleep'?`${r.data.bed||'—'} → ${r.data.wake||'—'}`:r.kind==='study'?String(r.data.project||'学习记录'):r.kind==='meal'?'今日餐饮':String(r.data.name||'习惯打卡')}
export function recordDetail(r:LifeRecord){return r.kind==='sleep'?`${sleepHours(r.data)??'—'} 小时 · 评分 ${r.data.rating||'未填'}`:r.kind==='study'?`${r.data.actual??'—'} 分钟 · ${r.data.complete?'已完成':'未完成'}`:r.kind==='meal'?`早餐 ${r.data.breakfast||'未填'} · 午餐 ${r.data.lunch||'未填'} · 晚餐 ${r.data.dinner||'未填'}`:`${r.data.category||''} · ${r.data.complete?'已完成':'未完成'}`}
