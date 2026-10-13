import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
test('CMS: authentication, draft isolation, publication, conflicts, uploads and persistence',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'eldent-cms-test-'));let proc;const port=4186,url=`http://127.0.0.1:${port}`;
 const start=()=>new Promise((resolve,reject)=>{proc=spawn(process.execPath,['cms/server.mjs'],{env:{...process.env,PORT:String(port),CMS_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});proc.stdout.once('data',resolve);proc.once('error',reject);proc.once('exit',code=>{if(code)reject(new Error('CMS startup failed'));});});
 const stop=()=>new Promise(resolve=>{proc.once('exit',resolve);proc.kill();});let cookie='',csrf='';
 async function api(route,method='GET',body,headers={}){const res=await fetch(url+route,{method,headers:{Origin:url,Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});const set=res.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return{status:res.status,data:await res.json()};}
 try{
  await start();assert.equal((await api('/api/admin/content')).status,401);
  const password=randomBytes(18).toString('hex');const login=await api('/api/admin/setup','POST',{login:'test-admin',password});assert.equal(login.status,200);csrf=login.data.csrf;
  assert.equal((await api('/api/admin/setup','POST',{login:'other',password})).status,409);
  const state=(await api('/api/admin/content')).data;const old=(await api('/api/content')).data.home.title;const changed={...state.content.home,title:'Проверка публикации'};
  assert.equal((await api('/api/admin/content','PUT',{section:'home',value:changed,revision:state.revision},{'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await api('/api/admin/content','PUT',{section:'home',value:changed,revision:state.revision},{Origin:'https://other.example'})).status,403);
  const save=await api('/api/admin/content','PUT',{section:'home',value:changed,revision:state.revision});assert.equal(save.status,200);
  assert.equal((await api('/api/content')).data.home.title,old,'Draft must not be public');
  assert.equal((await api('/api/admin/content','PUT',{section:'home',value:changed,revision:state.revision})).status,409);
  assert.equal((await api('/api/admin/publish','POST',{revision:save.data.revision})).status,200);
  assert.equal((await api('/api/content')).data.home.title,'Проверка публикации');
  const doc={id:'test-pdf',visible:true,name:'Документ',url:'javascript:alert(1)'};assert.equal((await api('/api/admin/content','PUT',{section:'documents',value:[doc],revision:save.data.revision})).status,400);
  const upload=await fetch(url+'/api/admin/upload',{method:'POST',headers:{Origin:url,Cookie:cookie,'X-CSRF-Token':csrf},body:'<svg></svg>'});assert.equal(upload.status,400);
  const pdf=await fetch(url+'/api/admin/upload',{method:'POST',headers:{Origin:url,Cookie:cookie,'X-CSRF-Token':csrf},body:'%PDF-1.4\nTest file'});assert.equal(pdf.status,200);const file=await pdf.json();assert.equal((await fetch(url+file.url)).status,200);
  const backup=(await api('/api/admin/export')).data;assert.equal(backup.history.length,1);assert.ok(!JSON.stringify(backup).includes(password));
  await stop();await start();assert.equal((await api('/api/content')).data.home.title,'Проверка публикации');assert.equal((await api('/api/admin/content')).status,401);
 }finally{if(proc?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
