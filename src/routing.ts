import {useSyncExternalStore} from 'react';

export type Page='home'|'records'|'habits'|'settings';

const routes:Record<string,Page>={
  '':'home',
  '/':'home',
  '/records':'records',
  '/habits':'habits',
  '/settings':'settings',
};

function currentPage():Page{
  if(typeof window==='undefined')return 'home';
  const route=window.location.hash.replace(/^#/,'').replace(/\/$/,'')||'/';
  return routes[route]||'home';
}

function subscribe(listener:()=>void){
  window.addEventListener('hashchange',listener);
  return()=>window.removeEventListener('hashchange',listener);
}

export function navigateTo(page:Page){
  const target=page==='home'?'#/':`#/${page}`;
  if(window.location.hash===target)return;
  window.location.hash=target;
}

export function usePageRoute():[Page,(page:Page)=>void]{
  const page=useSyncExternalStore<Page>(subscribe,currentPage,()=> 'home');
  return[page,navigateTo];
}
