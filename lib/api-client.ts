const TOKEN_KEY='mint_life_bearer';
const DEVICE_KEY='mint_life_device';
const configuredBase=(import.meta as ImportMeta&{env?:Record<string,string|undefined>}).env?.VITE_LIFE_API_BASE_URL;
const API_BASE=(configuredBase||'http://localhost:8787/api/life').replace(/\/$/,'');

export function getAuthToken(){return typeof window==='undefined'?null:window.localStorage.getItem(TOKEN_KEY)}
export function clearAuthToken(){if(typeof window!=='undefined')window.localStorage.removeItem(TOKEN_KEY)}
function saveAuthToken(token:string){window.localStorage.setItem(TOKEN_KEY,token)}
function deviceId(){
  const current=window.localStorage.getItem(DEVICE_KEY);
  if(current)return current;
  const created=crypto.randomUUID();
  window.localStorage.setItem(DEVICE_KEY,created);
  return created;
}

export async function api<T=unknown>(path:string,method='GET',value?:unknown):Promise<T>{
  const token=getAuthToken();
  const headers:Record<string,string>={};
  if(token)headers.Authorization=`Bearer ${token}`;
  if(value!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(`${API_BASE}/${path}`,{method,headers,body:value===undefined?undefined:JSON.stringify(value)});
  const text=await response.text();
  let data:unknown={};
  if(text){try{data=JSON.parse(text)}catch{data={error:'服务器返回了无法识别的内容'}}}
  if(response.status===401)clearAuthToken();
  if(!response.ok)throw new Error((data as {error?:string}).error||'操作失败');
  return data as T;
}

export async function authenticate(path:'login'|'setup',value:Record<string,unknown>){
  const result=await api<{token:string}>(path,'POST',{...value,deviceId:deviceId()});
  if(!/^[a-f0-9]{64}$/.test(result.token))throw new Error('登录响应无效');
  saveAuthToken(result.token);
}

export async function logout(){
  let revoked=true;
  try{await api('logout','POST',{})}catch{revoked=false}finally{clearAuthToken()}
  return revoked;
}

