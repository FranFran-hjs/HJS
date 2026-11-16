/** 2026 화담집. Public RPC functions are explicitly authorized; helpers end with _. */
const CONFIG = Object.freeze({
  categories: ['상상과 창작', '학교생활 경험', '반별 워드클라우드'],
  sheetName: '원고', maxPages: 5, maxImageBytes: 2 * 1024 * 1024,
  maxText: 40000, sessionSeconds: 7200,
  headers: ['ID','제출일시','목차','학년','반','작성자','편집위원','제목','원고내용','상태','수정일시']
});
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('2026 화담집 편집실')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function props_() { return PropertiesService.getScriptProperties(); }
function fail_(message) { throw new Error('HWADAM:' + message); }
function digest_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function equal_(a,b) {
  const x=digest_(a), y=digest_(b); let d=0;
  for(let i=0;i<x.length;i++) d |= x.charCodeAt(i)^y.charCodeAt(i);
  return d===0;
}
function lock_(fn) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000)) fail_('요청이 많습니다. 입력을 유지한 채 잠시 후 다시 시도해 주세요.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function domain_() {
  const domain=String(props_().getProperty('ALLOWED_DOMAIN')||'').trim().toLowerCase();
  if(!domain || !/^[a-z0-9.-]+$/.test(domain)) fail_('학교 도메인 설정이 필요합니다. 담당 교사에게 알려 주세요.');
  const email=String(Session.getActiveUser().getEmail()||'').toLowerCase();
  if(!email || email.split('@')[1]!==domain) fail_('허용된 학교 계정으로 접속해 주세요. 계정 확인이 불가능하면 담당 교사에게 문의해 주세요.');
  return digest_(email); // 이메일 자체는 저장하지 않습니다.
}
function login_(password) {
  const user=domain_();
  if(typeof password!=='string' || password.length>256) fail_('비밀번호를 확인해 주세요.');
  const p=props_(), admin=p.getProperty('ADMIN_PASSWORD'), editor=p.getProperty('EDITOR_PASSWORD');
  if(!admin || !editor || admin===editor || admin.length<12 || editor.length<12) fail_('서로 다른 12자 이상 비밀번호를 서버에 설정해 주세요.');
  const cache=CacheService.getScriptCache(), key='attempt:'+user;
  const role=lock_(() => {
    const attempts=Number(cache.get(key)||0);
    if(attempts>=10) fail_('로그인 시도가 많습니다. 10분 후 다시 시도해 주세요.');
    cache.put(key,String(attempts+1),600);
    const r=equal_(password,admin)?'admin':equal_(password,editor)?'editor':'';
    if(!r) fail_('비밀번호가 올바르지 않습니다.');
    cache.remove(key); return r;
  });
  const token=Utilities.getUuid()+Utilities.getUuid();
  cache.put('session:'+digest_(token),JSON.stringify({role,user,expires:Date.now()+CONFIG.sessionSeconds*1000,
    credential:digest_(role==='admin'?admin:editor)}),CONFIG.sessionSeconds);
  return {token,role,categories:CONFIG.categories,maxPages:CONFIG.maxPages,maxImageBytes:CONFIG.maxImageBytes,maxText:CONFIG.maxText};
}
function auth_(token,required) {
  const user=domain_();
  if(typeof token!=='string' || token.length>100) fail_('로그인이 필요합니다. 원고를 복사해 보관한 후 다시 로그인해 주세요.');
  const raw=CacheService.getScriptCache().get('session:'+digest_(token));
  if(!raw) fail_('로그인이 만료되었습니다. 입력한 원고는 화면에 유지됩니다. 다시 로그인해 주세요.');
  const s=JSON.parse(raw), pw=props_().getProperty(s.role==='admin'?'ADMIN_PASSWORD':'EDITOR_PASSWORD');
  if(s.user!==user || s.expires<Date.now() || digest_(pw||'')!==s.credential) fail_('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  if(required && s.role!==required) fail_('관리자 권한이 필요합니다.');
  return s;
}
function logout_(token) { auth_(token); CacheService.getScriptCache().remove('session:'+digest_(token)); return true; }
function sheet_() {
  const id=props_().getProperty('SPREADSHEET_ID');
  if(!id) fail_('저장소 설정이 필요합니다. 담당 교사에게 알려 주세요.');
  const sh=SpreadsheetApp.openById(id).getSheetByName(CONFIG.sheetName);
  if(!sh) fail_('담당 교사가 setup_ 함수를 먼저 실행해야 합니다.');
  if(JSON.stringify(sh.getRange(1,1,1,11).getValues()[0])!==JSON.stringify(CONFIG.headers)) fail_('시트 열 구성이 변경되었습니다. 담당 교사에게 알려 주세요.');
  return sh;
}
/** Apps Script 편집기에서 교사만 실행. 끝의 _ 때문에 브라우저 RPC 호출 불가. */
function setup_() {
  const p=props_();
  ['SPREADSHEET_ID','ADMIN_PASSWORD','EDITOR_PASSWORD','ALLOWED_DOMAIN'].forEach(k=>{if(!p.getProperty(k)) fail_(k+' 속성을 설정해 주세요.');});
  if(p.getProperty('ADMIN_PASSWORD')===p.getProperty('EDITOR_PASSWORD') || p.getProperty('ADMIN_PASSWORD').length<12 || p.getProperty('EDITOR_PASSWORD').length<12) fail_('비밀번호를 서로 다른 12자 이상으로 설정하세요.');
  lock_(()=>{
    const ss=SpreadsheetApp.openById(p.getProperty('SPREADSHEET_ID'));
    ss.setSpreadsheetTimeZone('Asia/Seoul');
    let sh=ss.getSheetByName(CONFIG.sheetName);
    if(!sh) sh=ss.insertSheet(CONFIG.sheetName);
    if(sh.getLastRow()===0) sh.getRange(1,1,1,11).setValues([CONFIG.headers]);
    sheet_(); sh.setFrozenRows(1); sh.getRange('A:K').setNumberFormat('@');
    sh.getRange(1,1,1,11).setFontWeight('bold').setBackground('#dce6db');
    sh.setColumnWidth(9,500); sh.getRange('I:I').setWrap(true);
    if(!p.getProperty('OCR_FOLDER_ID')) {
      const folder=DriveApp.createFolder('화담집_OCR_임시_비공유'); p.setProperty('OCR_FOLDER_ID',folder.getId());
    }
    if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='cleanupOcr_')) ScriptApp.newTrigger('cleanupOcr_').timeBased().everyHours(1).create();
  });
  console.log('설정 완료. 임시 폴더와 시트를 학생에게 공유하지 마세요.');
}
function text_(value,max,required) {
  if(typeof value!=='string' || value.length>max || /\u0000/.test(value)) fail_('입력값의 형식 또는 길이를 확인해 주세요.');
  const v=value.replace(/\r\n?/g,'\n');
  if(required && !v.trim()) fail_('목차, 작성자, 편집위원, 제목, 원고 내용을 입력해 주세요.');
  return v;
}
function manuscript_(d) {
  if(!d || typeof d!=='object') fail_('원고 입력을 확인해 주세요.');
  if(!CONFIG.categories.includes(d.category)) fail_('올바른 목차를 선택해 주세요.');
  const grade=text_(d.grade,1,false), classroom=text_(d.classroom,3,false);
  if(grade && !/^[123]$/.test(grade)) fail_('학년은 1~3 중 선택해 주세요.');
  if(classroom && !/^[1-9]\d{0,2}$/.test(classroom)) fail_('반은 1~999의 숫자로 입력해 주세요.');
  return [d.category,grade,classroom,text_(d.author,80,true),text_(d.editor,80,true),text_(d.title,200,true),text_(d.content,CONFIG.maxText,true)];
}
function now_() { return Utilities.formatDate(new Date(),'Asia/Seoul',"yyyy-MM-dd HH:mm:ss")+' KST'; }
function records_(sh) { return sh.getLastRow()<2?[]:sh.getRange(2,1,sh.getLastRow()-1,11).getDisplayValues(); }
function object_(r) {
  return {id:r[0],submitted:r[1],category:r[2],grade:r[3],classroom:r[4],author:r[5],editor:r[6],title:r[7],content:r[8],status:r[9],updated:r[10],version:digest_(JSON.stringify(r))};
}
function rawWrite_(sh,row,values) {
  // Sheets API RAW prevents =, +, -, @ user text from being interpreted as a formula.
  Sheets.Spreadsheets.Values.update({values:[values]},props_().getProperty('SPREADSHEET_ID'),
    "'"+CONFIG.sheetName.replace(/'/g,"''")+"'!A"+row+':K'+row,{valueInputOption:'RAW'});
}
function submitManuscript_(token,d) {
  auth_(token);
  const fields=manuscript_(d), id=text_(d.id,36,true);
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) fail_('제출 번호가 올바르지 않습니다.');
  return lock_(()=>{
    const sh=sheet_(), rows=records_(sh), found=rows.find(r=>r[0]===id);
    if(found) return {id,duplicate:true}; // Same id on retry, even after response loss.
    const t=now_(); rawWrite_(sh,sh.getLastRow()+1,[id,t].concat(fields,['검토 대기',t]));
    return {id,duplicate:false};
  });
}
function listManuscripts_(token) { auth_(token,'admin'); return records_(sheet_()).map(object_); }
function updateManuscript_(token,d) {
  auth_(token,'admin'); const fields=manuscript_(d);
  if(!['검토 대기','편집 완료'].includes(d.status)) fail_('검토 상태가 올바르지 않습니다.');
  return lock_(()=>{
    const sh=sheet_(), rows=records_(sh), index=rows.findIndex(r=>r[0]===d.id);
    if(index<0) fail_('원고를 찾을 수 없습니다. 새로고침해 주세요.');
    if(object_(rows[index]).version!==d.version) fail_('다른 관리자가 수정했습니다. 현재 내용을 복사해 보관하고 목록을 새로고침해 주세요.');
    const values=[d.id,rows[index][1]].concat(fields,[d.status,now_()]); rawWrite_(sh,index+2,values);
    return object_(values);
  });
}
function ocrPage_(token,page) {
  const s=auth_(token), p=props_();
  if(!page || page.mime!=='image/jpeg' || typeof page.base64!=='string' || page.base64.length>Math.ceil(CONFIG.maxImageBytes/3)*4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(page.base64)) fail_('사진은 압축된 JPG, 장당 2MB 이하만 사용할 수 있습니다.');
  const bytes=Utilities.base64Decode(page.base64);
  if(bytes.length>CONFIG.maxImageBytes || bytes.length<4 || (bytes[0]&255)!==255 || (bytes[1]&255)!==216) fail_('올바른 JPG 사진을 선택해 주세요.');
  const batch=text_(page.batch,36,true), index=Number(page.index);
  if(!/^[a-f0-9-]{36}$/i.test(batch) || !Number.isInteger(index) || index<0 || index>=CONFIG.maxPages) fail_('한 번에 사진은 5장까지 변환할 수 있습니다.');
  const cache=CacheService.getScriptCache(), quotaKey='ocr:'+s.user+':'+Utilities.formatDate(new Date(),'UTC','yyyyMMddHH');
  const busy='ocrbusy:'+s.user;
  lock_(()=>{
    if(cache.get(busy)) fail_('현재 사진을 변환 중입니다. 잠시 후 다시 시도해 주세요.');
    const n=Number(cache.get(quotaKey)||0); if(n>=30) fail_('시간당 사진 변환 한도(30장)에 도달했습니다. 직접 입력하거나 다음 시간에 시도해 주세요.');
    cache.put(quotaKey,String(n+1),3600); cache.put(busy,'1',360);
  });
  let fileId;
  try {
    const folder=p.getProperty('OCR_FOLDER_ID'); if(!folder) fail_('OCR 초기 설정이 필요합니다.');
    // Drive API v3: image upload + Google Docs MIME imports image with OCR. No v2 convert/ocr flags.
    const file=Drive.Files.create({name:'hwadam-ocr-'+Utilities.getUuid(),mimeType:'application/vnd.google-apps.document',parents:[folder],appProperties:{hwadamOcr:'1'}},
      Utilities.newBlob(bytes,'image/jpeg','page.jpg'),{ocrLanguage:'ko',fields:'id'});
    fileId=file.id;
    let content='', read=false;
    for(let attempt=0;attempt<3;attempt++) {
      try { content=DocumentApp.openById(fileId).getBody().getText(); read=true; break; }
      catch(e) { if(attempt<2) Utilities.sleep(1000*(attempt+1)); }
    }
    if(!read) fail_('변환 문서를 읽지 못했습니다. 직접 입력하거나 잠시 후 다시 시도해 주세요.');
    return {text:content.slice(0,CONFIG.maxText),truncated:content.length>CONFIG.maxText,empty:!content.trim()};
  } catch(e) {
    // Never return provider errors that could expose IDs or configuration.
    fail_('사진 변환에 실패했습니다. 학교 Drive API 권한·사용량을 확인하거나 직접 입력해 주세요.');
  } finally {
    if(fileId) { try { Drive.Files.remove(fileId); } catch(e) { console.warn('OCR 삭제 지연: 정리 트리거 재시도'); } }
    cache.remove(busy);
  }
}
/** Private hourly cleanup: only tagged files in the dedicated folder; permanent removal. */
function cleanupOcr_() {
  const folder=props_().getProperty('OCR_FOLDER_ID'); if(!folder) return;
  const cutoff=new Date(Date.now()-60*60*1000).toISOString(); let token;
  do {
    const result=Drive.Files.list({q:"'"+folder+"' in parents and appProperties has { key='hwadamOcr' and value='1' } and createdTime < '"+cutoff+"'",fields:'nextPageToken,files(id)',pageSize:100,pageToken:token});
    (result.files||[]).forEach(f=>{try { Drive.Files.remove(f.id); } catch(e) { console.warn('OCR 정리 재시도 필요'); }});
    token=result.nextPageToken;
  } while(token);
}

// Only these RPC endpoints are exposed. Platform exceptions never disclose resource IDs.
function safe_(fn) {
  try { return fn(); } catch(e) {
    const message=String(e.message||'');
    if(message.indexOf('HWADAM:')===0) throw new Error(message.slice(7));
    console.warn('화담집 요청 처리 실패: 학교 권한·서비스 설정 확인 필요');
    throw new Error('요청을 처리하지 못했습니다. 입력한 내용은 유지됩니다. 잠시 후 재시도하고, 계속되면 담당 교사에게 학교 API 권한과 저장소 설정을 확인해 달라고 알려 주세요.');
  }
}
function login(password) { return safe_(()=>login_(password)); }
function logout(token) { return safe_(()=>logout_(token)); }
function submitManuscript(token,data) { return safe_(()=>submitManuscript_(token,data)); }
function listManuscripts(token) { return safe_(()=>listManuscripts_(token)); }
function updateManuscript(token,data) { return safe_(()=>updateManuscript_(token,data)); }
function ocrPage(token,page) { return safe_(()=>ocrPage_(token,page)); }
