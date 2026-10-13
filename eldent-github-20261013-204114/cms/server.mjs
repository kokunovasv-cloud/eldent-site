import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=path.resolve(process.env.CMS_DATA_DIR||path.join(root,'.cms-data'));
await fs.mkdir(path.join(dataDir,'uploads'),{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(dataDir,'content.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, draft TEXT, published TEXT, revision INTEGER, published_revision INTEGER); CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY, login TEXT, salt TEXT, hash TEXT); CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, content TEXT);`);
if(!db.prepare('SELECT id FROM state WHERE id=1').get()) {const initial=await fs.readFile(path.join(root,'cms/initial-content.json'),'utf8');db.prepare('INSERT INTO state VALUES(1,?,?,1,1)').run(initial,initial);}
const sessions=new Map(),attempts=new Map(),port=Number(process.env.PORT||4175),host=process.env.HOST||'127.0.0.1';
const secure=process.env.CMS_SECURE_COOKIE==='1';
const readState=()=>db.prepare('SELECT * FROM state WHERE id=1').get();
function respond(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function assert(ok,message,status=400){if(!ok)throw Object.assign(new Error(message),{status});}
function session(req){const key=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('eldent_session='))?.slice(15);const s=sessions.get(key);if(s&&s.expires>Date.now())return s;if(key)sessions.delete(key);return null;}
function originOK(req){try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}}
async function body(req,max=2*1024*1024){let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;assert(n<=max,'Файл или данные слишком большие.',413);chunks.push(chunk);}return Buffer.concat(chunks);}
async function json(req){try{return JSON.parse((await body(req)).toString());}catch(e){if(e.status)throw e;throw Object.assign(new Error('Некорректные данные.'),{status:400});}}
function validate(section,value){
 assert(['home','about','services','doctors','prices','contacts','documents'].includes(section),'Неизвестный раздел.');assert(value&&typeof value==='object','Заполните содержимое раздела.');
 const text=(v,max=6000)=>assert(typeof v==='string'&&v.length<=max,'Текст слишком длинный или имеет неверный формат.');
 const url=v=>{text(v,2000);assert(!v||/^(https?:\/\/|\/uploads\/|(?:\/preview\/)?assets\/)/.test(v),'Используйте ссылку https или загруженный файл.');};
 const list=(v,limit)=>assert(Array.isArray(v)&&v.length<=limit,'Слишком много записей.');
 const item=(v,keys)=>{assert(v&&typeof v==='object','Неверная запись.');text(v.id,100);assert(typeof v.visible==='boolean','Укажите видимость записи.');for(const k of keys)text(v[k]);};
 if(section==='home'){for(const k of ['title','description'])text(value[k]);url(value.image);list(value.faq,30);for(const x of value.faq)item(x,['question','answer']);}
 if(section==='about'){for(const k of ['title','description','history'])text(value[k]);url(value.image);list(value.advantages,30);for(const x of value.advantages)item(x,['title','description']);}
 if(section==='contacts'){for(const k of ['phone','address','hours','email'])text(value[k],500);text(value.bookingUrl,2000);assert(/^https:\/\//.test(value.bookingUrl),'Для записи нужна ссылка https.');}
 if(section==='services'){list(value,100);for(const x of value)item(x,['name','description']);}
 if(section==='doctors'){list(value,100);for(const x of value){item(x,['name','role','specialty','description']);url(x.image);}}
 if(section==='documents'){list(value,100);for(const x of value){item(x,['name']);url(x.url);}}
 if(section==='prices'){list(value.categories,50);const ids=new Set();for(const c of value.categories){text(c.id,100);text(c.name,200);assert(c.name.trim(),'Введите название категории.');assert(!ids.has(c.id),'Категории должны иметь разные идентификаторы.');ids.add(c.id);list(c.rows,1000);for(const x of c.rows){item(x,['name','price']);assert(x.name.trim()&&x.price.trim(),'Укажите название и стоимость услуги.');}}}
}
function createSession(res){const key=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(key,{csrf,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`eldent_session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`);return csrf;}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.pdf':'application/pdf'};
async function serve(req,res){
 const route=new URL(req.url,'http://localhost').pathname;
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
 if(route.startsWith('/admin'))res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
 if(route==='/api/content'&&req.method==='GET')return respond(res,200,JSON.parse(readState().published));
 if(route==='/api/admin/session'&&req.method==='GET'){const s=session(req);return respond(res,200,{setup:!db.prepare('SELECT id FROM admin').get(),authenticated:!!s,csrf:s?.csrf});}
 if(route.startsWith('/api/admin/')){
  if(req.method!=='GET')assert(originOK(req),'Запрос с другого сайта запрещён.',403);
  if(['/api/admin/setup','/api/admin/login'].includes(route)&&req.method==='POST'){
   const key=req.socket.remoteAddress;const attempt=attempts.get(key)||{count:0,expires:Date.now()+600000};if(attempt.expires<Date.now()){attempt.count=0;attempt.expires=Date.now()+600000;}assert(attempt.count<10,'Слишком много попыток. Повторите через 10 минут.',429);attempt.count++;attempts.set(key,attempt);
   const b=await json(req);assert(typeof b.login==='string'&&typeof b.password==='string','Укажите логин и пароль.');assert(b.password.length>=12&&b.password.length<=200,'Пароль должен содержать от 12 до 200 символов.');
   if(route.endsWith('/setup')){assert(!db.prepare('SELECT id FROM admin').get(),'Администратор уже создан.',409);assert(/^[a-zA-Z0-9@._-]{3,100}$/.test(b.login),'Логин: от 3 символов, латинские буквы, цифры, @, точка или дефис.');const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO admin VALUES(1,?,?,?)').run(b.login,salt,scryptSync(b.password,salt,64).toString('hex'));}
   else{const a=db.prepare('SELECT * FROM admin WHERE id=1').get();assert(a&&b.login===a.login&&timingSafeEqual(scryptSync(b.password,a.salt,64),Buffer.from(a.hash,'hex')),'Неверный логин или пароль.',401);}
   attempts.delete(key);return respond(res,200,{csrf:createSession(res)});
  }
  const s=session(req);assert(s,'Войдите в панель управления.',401);if(req.method!=='GET')assert(req.headers['x-csrf-token']===s.csrf,'Обновите страницу и повторите действие.',403);
  if(route==='/api/admin/logout'&&req.method==='POST'){for(const [key,v]of sessions)if(v===s)sessions.delete(key);res.setHeader('Set-Cookie','eldent_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return respond(res,200,{ok:true});}
  if(route==='/api/admin/content'&&req.method==='GET'){const st=readState();return respond(res,200,{content:JSON.parse(st.draft),revision:st.revision,publishedRevision:st.published_revision});}
  if(route==='/api/admin/content'&&req.method==='PUT'){const b=await json(req);validate(b.section,b.value);const st=readState();assert(b.revision===st.revision,'Данные изменились в другой вкладке. Обновите раздел перед сохранением.',409);const c=JSON.parse(st.draft);c[b.section]=b.value;db.prepare('UPDATE state SET draft=?,revision=revision+1 WHERE id=1').run(JSON.stringify(c));return respond(res,200,{revision:st.revision+1,publishedRevision:st.published_revision});}
  if(route==='/api/admin/publish'&&req.method==='POST'){const b=await json(req),st=readState();assert(b.revision===st.revision,'Данные изменились. Обновите страницу.',409);db.exec('BEGIN');try{db.prepare('INSERT INTO history(created,content) VALUES(?,?)').run(new Date().toISOString(),st.published);db.prepare('UPDATE state SET published=draft,published_revision=revision WHERE id=1').run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return respond(res,200,{revision:st.revision,publishedRevision:st.revision});}
  if(route==='/api/admin/discard'&&req.method==='POST'){const b=await json(req),st=readState();assert(b.revision===st.revision,'Данные изменились. Обновите страницу.',409);db.prepare('UPDATE state SET draft=published,revision=revision+1,published_revision=revision+1 WHERE id=1').run();return respond(res,200,{ok:true});}
  if(route==='/api/admin/export'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename="eldent-content.json"');return respond(res,200,{exportedAt:new Date().toISOString(),...readState(),history:db.prepare('SELECT * FROM history').all()});}
  if(route==='/api/admin/upload'&&req.method==='POST'){const b=await body(req,10*1024*1024);let ext='';if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='.png';else if(b[0]===255&&b[1]===216&&b[2]===255)ext='.jpg';else if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')ext='.webp';else if(b.subarray(0,5).toString()==='%PDF-')ext='.pdf';assert(ext,'Разрешены JPG, PNG, WebP и PDF до 10 МБ.');const name=randomUUID()+ext;await fs.writeFile(path.join(dataDir,'uploads',name),b,{mode:0o600});return respond(res,200,{url:'/uploads/'+name});}
  return respond(res,404,{error:'Действие не найдено.'});
 }
 assert(req.method==='GET'||req.method==='HEAD','Метод не поддерживается.',405);
 let base,target;if(route.startsWith('/uploads/')){base=path.join(dataDir,'uploads');target=route.slice(9);}else if(route==='/admin'||route.startsWith('/admin/')){base=path.join(root,'src/admin');target=route==='/admin'||route==='/admin/'?'index.html':route.slice(7);}else{base=path.join(root,'public');target=route==='/'?'preview/index.html':route.slice(1);}
 const dest=path.resolve(base,decodeURIComponent(target));assert(dest.startsWith(base+path.sep),'Доступ запрещён.',403);
 try{const bytes=await fs.readFile(dest);res.writeHead(200,{'Content-Type':mime[path.extname(dest)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);}catch(e){if(e.code==='ENOENT')return respond(res,404,{error:'Страница не найдена.'});throw e;}
}
http.createServer((req,res)=>serve(req,res).catch(e=>{if(!res.headersSent)respond(res,e.status||500,{error:e.status?e.message:'Не удалось выполнить действие. Повторите позже.'});else res.end();})).listen(port,host,()=>console.log(`ЭлДент: http://${host}:${port}/ — админка /admin/`));
