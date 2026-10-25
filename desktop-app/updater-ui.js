'use strict';
document.addEventListener('DOMContentLoaded', () => {
 const box=document.getElementById('vortex-update-banner');
 const title=document.getElementById('vortex-update-title');
 const detail=document.getElementById('vortex-update-detail');
 const open=document.getElementById('vortex-update-open');
 const dismiss=document.getElementById('vortex-update-dismiss');
 if(!box || !window.electronAPI?.checkForUpdates) return;
 let releaseUrl='';
 function show(result) {
   if(!result || result.status!=='available') return;
   releaseUrl=result.url;
   title.textContent='Доступна новая версия VortexChat';
   detail.textContent=String(result.version||'');
   box.hidden=false;
 }
 window.electronAPI.onUpdateCheckResult(show);
 open.addEventListener('click',()=>window.electronAPI.openUpdateReleases());
 dismiss.addEventListener('click',()=>box.hidden=true);
 // Manual rechecks remain possible after temporary connectivity errors.
 document.addEventListener('keydown',async event=>{
   if(!(event.ctrlKey&&event.shiftKey&&event.code==='KeyU'))return;
   event.preventDefault();
   const result=await window.electronAPI.checkForUpdates();
   if(result.status==='available')show(result);
   else if(result.status==='unavailable'){
     title.textContent='Не удалось проверить обновления';
     detail.textContent=result.reason==='private_repository'?'Репозиторий приватный — открой релизы через GitHub':'Проверь интернет-соединение';
     box.hidden=false;
   }
 });
});
