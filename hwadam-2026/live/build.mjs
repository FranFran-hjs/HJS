import {readFile,writeFile,mkdir,rm,cp} from 'node:fs/promises';
const html=await readFile('web/index.html','utf8');
const worker=(await readFile('worker/index.mjs','utf8')).replace('__PAGE__',JSON.stringify(html));
await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',worker);await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/drizzle',{recursive:true});
const m=await import('data:text/javascript;base64,'+Buffer.from(worker).toString('base64'));if(typeof m.default.fetch!=='function')throw Error('Worker fetch export missing');
console.log('Built single-module Worker and schema migrations');
