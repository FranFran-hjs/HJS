const PAGE = __PAGE__;
export const CATEGORIES = ['상상과 창작','학교생활 경험','반별 워드클라우드'];
const MAX_BODY = 180000;
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
function reject(status,message){throw new HttpError(status,message);}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function equal(a,b){const x=await digest(a),y=await digest(b);let d=0;for(let i=0;i<x.length;i++)d|=x.charCodeAt(i)^y.charCodeAt(i);return d===0;}
function text(value,max,required=true){if(typeof value!=='string'||value.length>max||value.includes('\0'))reject(400,'입력값의 형식과 길이를 확인해 주세요.');const t=value.replace(/\r\n?/g,'\n');if(required&&!t.trim())reject(400,'목차, 작성자 학번·이름, 제목, 편집위원, 본문을 모두 입력해 주세요.');return t;}
function uuid(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))reject(400,'제출 번호가 올바르지 않습니다.');return value;}
function validate(d){if(!d||typeof d!=='object'||Array.isArray(d)||!CATEGORIES.includes(d.category))reject(400,'목차를 선택해 주세요.');const number=text(d.studentNo,10);if(!/^\d{3,10}$/.test(number))reject(400,'학번은 숫자 3~10자리로 입력해 주세요.');return {category:d.category,studentNo:number,author:text(d.author,80),editor:text(d.editor,80),title:text(d.title,200),content:text(d.content,40000)};}
async function body(request){if(!request.headers.get('content-type')?.includes('application/json'))reject(415,'요청 형식을 확인해 주세요.');const length=Number(request.headers.get('content-length'));if(length>MAX_BODY)reject(413,'입력한 원고가 너무 큽니다. 40,000자 이하로 나누어 주세요.');const reader=request.body?.getReader();if(!reader)reject(400,'입력한 원고를 확인해 주세요.');let total=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BODY){await reader.cancel();reject(413,'입력한 원고가 너무 큽니다.');}chunks.push(value);}const all=new Uint8Array(total);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}try{return JSON.parse(new TextDecoder().decode(all));}catch{reject(400,'입력한 원고를 확인해 주세요.');}}
function origin(request){const o=request.headers.get('origin');if(o&&o!==new URL(request.url).origin)reject(403,'이 편집실 화면에서 다시 요청해 주세요.');if(request.headers.get('sec-fetch-site')==='cross-site')reject(403,'다른 사이트에서는 요청할 수 없습니다.');}
function db(env){if(!env.DB)reject(503,'저장소를 준비 중입니다. 입력을 유지한 채 잠시 후 다시 시도해 주세요.');return env.DB;}
async function admin(request,env,required=true){
 const id=request.headers.get('oai-authenticated-user-id');
 if(!id){if(required)reject(401,'관리자 계정으로 들어와 주세요.');return false;}
 const store=db(env),existing=await store.prepare('SELECT user_id FROM administrators WHERE user_id = ?').bind(id).first();if(existing)return true;
 const email=request.headers.get('oai-authenticated-user-email');
 if(email&&env.BOOTSTRAP_ADMIN_EMAIL&&email.toLowerCase()===env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase()){
  await store.prepare('INSERT INTO administrators(user_id, created) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM administrators)').bind(id,new Date().toISOString()).run();
  if(await store.prepare('SELECT user_id FROM administrators WHERE user_id = ?').bind(id).first())return true;
 }
 if(required)reject(403,'이 계정에는 관리자 권한이 없습니다.');return false;
}
async function invite(store){let row=await store.prepare("SELECT value FROM settings WHERE key = 'room_code'").first();if(!row){const code=crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');await store.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('room_code',?)").bind(code).run();row=await store.prepare("SELECT value FROM settings WHERE key = 'room_code'").first();}return row.value;}
async function editor(request,env){const code=request.headers.get('x-room-code');if(!code||code.length>150)reject(403,'선생님이 공유한 제출 전용 링크로 들어와 주세요.');const row=await db(env).prepare("SELECT value FROM settings WHERE key = 'room_code'").first();if(!row||!await equal(code,row.value))reject(403,'제출 링크가 변경되었거나 올바르지 않습니다. 선생님에게 새 링크를 받아 주세요.');}
function record(r){const n=r.student_no;return {id:r.id,category:r.category,studentNo:n,grade:n.length===5?n[0]:'',classroom:n.length===5?String(Number(n.slice(1,3))):'',author:r.author,editor:r.editor,title:r.title,content:r.content,status:r.status,included:!!r.included,submitted:r.submitted,updated:r.updated,version:r.version};}
async function rate(request,store){const now=Math.floor(Date.now()/1000),window=Math.floor(now/3600);const key=await digest('submit:'+window+':'+(request.headers.get('cf-connecting-ip')||'local'));const result=await store.prepare('INSERT INTO request_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+7200).first();if(result.count>40)reject(429,'제출 요청이 많습니다. 잠시 후 다시 시도하거나 선생님에게 알려 주세요.');await store.prepare('DELETE FROM request_limits WHERE expires < ?').bind(now).run();}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  try{
   if(path==='/'&&request.method==='GET')return new Response(PAGE,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"}});
   if(!path.startsWith('/api/'))return json({error:'페이지를 찾을 수 없습니다.'},404);
   origin(request);
   if(path==='/api/me'&&request.method==='GET'){const isAdmin=await admin(request,env,false);return json({admin:isAdmin,signedIn:!!request.headers.get('oai-authenticated-user-id'),categories:CATEGORIES});}
   if(path==='/api/room'&&request.method==='POST'){await editor(request,env);return json({ok:true,categories:CATEGORIES});}
   if(path==='/api/manuscripts'&&request.method==='POST'){
    await editor(request,env);const data=await body(request),fields=validate(data),id=uuid(data.id),store=db(env),hash=await digest(JSON.stringify(fields));
    const existing=await store.prepare('SELECT payload_hash FROM manuscripts WHERE id = ?').bind(id).first();
    if(existing){if(existing.payload_hash!==hash)reject(409,'같은 접수 번호로 다른 내용이 요청되었습니다. 선생님에게 접수 번호를 알려 주세요.');return json({id,duplicate:true});}
    await rate(request,store);const now=new Date().toISOString();
    const result=await store.prepare('INSERT OR IGNORE INTO manuscripts (id,payload_hash,category,student_no,author,editor,title,content,status,submitted,updated,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,hash,fields.category,fields.studentNo,fields.author,fields.editor,fields.title,fields.content,'검토 대기',now,now,crypto.randomUUID()).run();
    if(!result.meta.changes){const prior=await store.prepare('SELECT payload_hash FROM manuscripts WHERE id = ?').bind(id).first();if(prior?.payload_hash!==hash)reject(409,'접수 번호가 충돌했습니다. 선생님에게 알려 주세요.');}
    return json({id,duplicate:!result.meta.changes},result.meta.changes?201:200);
   }
   if(path==='/api/admin/invite'){
    await admin(request,env);const store=db(env);
    if(request.method==='GET')return json({url:new URL(request.url).origin+'/#room='+await invite(store)});
    if(request.method==='POST'){const code=crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');await store.prepare("INSERT INTO settings(key,value) VALUES('room_code',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(code).run();return json({url:new URL(request.url).origin+'/#room='+code});}
   }
   if(path==='/api/admin/manuscripts'&&request.method==='GET'){
    await admin(request,env);const store=db(env),url=new URL(request.url),limit=100,offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)reject(400,'목록 위치가 올바르지 않습니다.');const {results}=await store.prepare('SELECT * FROM manuscripts ORDER BY submitted DESC,id DESC LIMIT ? OFFSET ?').bind(limit+1,offset).all();return json({items:results.slice(0,limit).map(record),next:results.length>limit?offset+limit:null});
   }
   const inclusion=path.match(/^\/api\/admin\/manuscripts\/([a-f0-9-]+)\/inclusion$/i);
   if(inclusion&&request.method==='PATCH'){
    await admin(request,env);const id=uuid(inclusion[1]),data=await body(request);if(typeof data.included!=='boolean')reject(400,'반영완료 체크 값을 확인해 주세요.');const version=text(data.version,80),store=db(env);
    const result=await store.prepare('UPDATE manuscripts SET included=?, updated=?, version=? WHERE id=? AND version=?').bind(data.included?1:0,new Date().toISOString(),crypto.randomUUID(),id,version).run();
    if(!result.meta.changes)reject(409,'다른 창에서 먼저 수정했습니다. 내용을 복사해 보관한 후 목록을 새로고침해 주세요.');
    return json(record(await store.prepare('SELECT * FROM manuscripts WHERE id=?').bind(id).first()));
   }
   if(path.startsWith('/api/admin/manuscripts/')&&request.method==='PUT'){
    await admin(request,env);const id=uuid(path.split('/').pop()),data=await body(request),fields=validate(data);if(!['검토 대기','편집 완료'].includes(data.status))reject(400,'검토 상태를 확인해 주세요.');const version=text(data.version,80),next=crypto.randomUUID(),now=new Date().toISOString(),store=db(env);
    const result=await store.prepare('UPDATE manuscripts SET category=?,student_no=?,author=?,editor=?,title=?,content=?,status=?,updated=?,version=? WHERE id=? AND version=?').bind(fields.category,fields.studentNo,fields.author,fields.editor,fields.title,fields.content,data.status,now,next,id,version).run();
    if(!result.meta.changes)reject(409,'다른 창에서 먼저 수정했거나 원고를 찾을 수 없습니다. 현재 내용을 복사해 보관한 후 목록을 새로고침해 주세요.');
    return json(record(await store.prepare('SELECT * FROM manuscripts WHERE id=?').bind(id).first()));
   }
   return json({error:'지원하지 않는 요청입니다.'},405);
  }catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);console.error('화담집 저장소 요청 실패',e?.name||'Error');return json({error:'요청을 처리하지 못했습니다. 입력한 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.'},503);}
 }
};
