import {fileURLToPath,URL} from 'node:url';
import react from '@vitejs/plugin-react';
import {defineConfig,loadEnv} from 'vite';

function normalizeBase(value:string){
  const trimmed=value.trim();
  if(!trimmed||trimmed==='/')return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g,'')}/`;
}

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  return {
    base:normalizeBase(env.BASE_PATH||'/life-log/'),
    plugins:[react()],
    resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
    server:{host:'127.0.0.1',port:5173,strictPort:true},
    preview:{host:'127.0.0.1',port:4173,strictPort:true},
    build:{outDir:'dist',emptyOutDir:true},
  };
});
