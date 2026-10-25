'use strict';
const https=require('https');
const API='https://api.github.com/repos/FN1p/VortexChat/releases?per_page=15';
const RELEASES='https://github.com/FN1p/VortexChat/releases';
function version(v){const m=String(v).match(/^v?(\d+)\.(\d+)\.(\d+)/);return m?m.slice(1).map(Number):null;}
function newer(a,b){a=version(a);b=version(b);if(!a||!b)return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
function read(url){return new Promise((resolve,reject)=>{
 const req=https.get(url,{headers:{'User-Agent':'VortexChat-Desktop','Accept':'application/vnd.github+json'},timeout:8000},res=>{
  let raw='';res.on('data',chunk=>{raw+=chunk;if(raw.length>250000)req.destroy(new Error('too large'));});
  res.on('end',()=>{if(res.statusCode!==200)return reject(Object.assign(new Error('HTTP '+res.statusCode),{status:res.statusCode}));
  try{resolve(JSON.parse(raw));}catch(e){reject(e);}});
 });req.on('timeout',()=>req.destroy(new Error('timeout')));req.on('error',reject);
});}
async function check(installed) {
 try {
  const releases=await read(API);
  if(!Array.isArray(releases))throw Error('invalid response');
  const available=releases.filter(r=>!r.draft&&newer(r.tag_name,installed)&&r.assets?.some(a=>/^VortexChat-Setup-.*\.exe$/i.test(a.name)));
  available.sort((a,b)=>{const x=version(a.tag_name),y=version(b.tag_name);for(let i=0;i<3;i++)if(x[i]!==y[i])return y[i]-x[i];return 0;});
  if(!available.length)return {status:'current',installed};
  const r=available[0];return {status:'available',installed,version:r.tag_name,url:r.html_url,prerelease:r.prerelease};
 } catch(e){return {status:'unavailable',installed,reason:e.status===404?'private_repository':'network_error',url:RELEASES};}
}
module.exports={check,newer,RELEASES};
