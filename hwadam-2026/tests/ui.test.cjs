// Set PLAYWRIGHT_MODULE to an installed playwright module, or npm install --no-save playwright.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),http=require('node:http');
const categories=['상상과 창작','학교생활 경험','반별 워드클라우드'];
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fs.readFileSync('src/Index.html'));}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{for(const width of [390,768,1280]){
 const page=await browser.newPage({viewport:{width,height:950}});let errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({categories})=>{window.testCalls=[];window.testRows=[{id:'sample',submitted:'2026-11-16 09:00 KST',category:categories[0],grade:'2',classroom:'3',author:'학생',editor:'편집',title:'<img src=x onerror=alert(1)>',content:'첫 문단\n\n둘째 문단',status:'검토 대기',updated:'2026-11-16',version:'v1'}];let failSubmit=true;
 window.google={script:{run:new Proxy({},{get:(_,name)=>{if(name==='withSuccessHandler'||name==='withFailureHandler')return fn=>chain(name,fn);}})}};
 function chain(first,fn){let success,fail;if(first==='withSuccessHandler')success=fn;else fail=fn;const proxy=new Proxy({},{get:(_,name)=>{if(name==='withSuccessHandler')return f=>{success=f;return proxy};if(name==='withFailureHandler')return f=>{fail=f;return proxy};return(...args)=>{window.testCalls.push({name,args});setTimeout(()=>{try{let result;if(name==='login')result={token:'token',role:args[0]==='admin'?'admin':'editor',categories,maxPages:5,maxImageBytes:2097152,maxText:40000};if(name==='listManuscripts')result=window.testRows;if(name==='submitManuscript'){if(failSubmit){failSubmit=false;throw Error('통신 오류: 재시도하세요.');}result={id:args[1].id};}if(name==='ocrPage')result={text:'변환한 원문\n둘째 줄'};if(name==='updateManuscript'){result={...args[1],version:'v2'};window.testRows=[result];}success(result);}catch(e){fail(e)}},10);};}});return proxy;}
 },{categories});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('#password').fill('editor');await page.locator('#loginForm button').click();await page.locator('#e_category').selectOption(categories[0]);await page.locator('#e_author').fill('학생');await page.locator('#e_editor').fill('편집');await page.locator('#e_title').fill('제목');await page.locator('#content').fill('첫 문단\n\n둘째 문단');
 // Image compression and OCR append, preserving manually typed text.
 const jpg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=120;c.getContext('2d').fillRect(0,0,120,120);return c.toDataURL('image/jpeg').split(',')[1]});
 await page.locator('#images').setInputFiles({name:'page.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpg,'base64')});await page.waitForFunction(()=>document.querySelector('#photos img'));
 page.once('dialog',d=>d.accept());await page.locator('#ocrBtn').click();await page.waitForFunction(()=>document.querySelector('#content').value.includes('변환한 원문'));assert((await page.locator('#content').inputValue()).startsWith('첫 문단\n\n둘째 문단'));
 await page.locator('#submitBtn').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('통신 오류'));assert.equal(await page.locator('#content').inputValue(),'첫 문단\n\n둘째 문단\n\n변환한 원문\n둘째 줄');assert(await page.locator('#content').isDisabled());
 await page.locator('#submitBtn').click();await page.locator('#submittedBox').waitFor({state:'visible'});const calls=await page.evaluate(()=>window.testCalls.filter(c=>c.name==='submitManuscript'));assert.equal(calls[0].args[1].id,calls[1].args[1].id);assert.equal(await page.locator('#photos img').count(),0);
 await page.locator('#logoutBtn').click();await page.locator('#loginView').waitFor({state:'visible'});await page.locator('#password').fill('admin');await page.locator('#loginForm button').click();await page.locator('#list td button').waitFor();assert.equal(await page.locator('#list img').count(),0,'untrusted title must remain text');
 await page.locator('#list td button').click();await page.locator('#a_category').selectOption(categories[1]);await page.locator('#adminContent').fill('수정한 원고\n\n다음 문단');await page.locator('#doneBtn').click();await page.waitForFunction(()=>document.querySelector('#detailInfo').textContent.includes('편집 완료'));assert((await page.locator('#detailInfo').textContent()).includes('편집 완료'));
 await page.locator('#search').fill('없는 원고');assert.equal(await page.locator('#list tbody tr').count(),0);await page.locator('#search').fill('학생');assert.equal(await page.locator('#list tbody tr').count(),1);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'page must not overflow viewport');assert.deepEqual(errors,[]);
 await page.screenshot({path:'../../ui-'+width+'.png',fullPage:true});console.log('PASS '+width+'px: login, compression/OCR, failed-submit preservation, idempotent retry, safe text, admin save/filter, layout');await page.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
