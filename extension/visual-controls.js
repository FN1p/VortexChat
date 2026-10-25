/* VortexChat Beta visual layer. Does not inspect or modify chat messages. */
(() => {
'use strict';
if (globalThis.__vortexVisualControls) return;
globalThis.__vortexVisualControls=true;
const yt=/(^|\.)youtube\.com$/.test(location.hostname), tw=/(^|\.)twitch\.tv$/.test(location.hostname);
if(!yt&&!tw)return;
let settings=VortexCore.normalizeSettings(), theater=false, glow=null, loop=0;
const style=document.createElement('style');style.id='vortex-visual-styles';
(document.head||document.documentElement).append(style);
const chatFrame=yt && location.pathname.startsWith('/live_chat');
function video(){
 return [...document.querySelectorAll('video')].filter(v=>{const r=v.getBoundingClientRect();return r.width>300&&r.height>150})
 .sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0]||null;
}
function cleanup(){clearInterval(loop);loop=0;glow?.remove();glow=null;}
function startGlow(){
 if(loop||window!==window.top)return;
 glow=document.createElement('div');glow.className='vortex-ambient-canvas';
 Object.assign(glow.style,{position:'fixed',pointerEvents:'none',zIndex:'1',borderRadius:'16px',display:'none',transition:'box-shadow .8s ease'});
 document.documentElement.append(glow);
 loop=setInterval(()=>{
  const v=video();if(!v||document.hidden){glow.style.display='none';return;}
  const r=v.getBoundingClientRect(),power=settings.visualAmbilightIntensity/100;
  const hue=190+Math.round(Math.sin(Date.now()/2200)*48);
  Object.assign(glow.style,{display:'block',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',boxShadow:`0 0 ${Math.round(30+power*80)}px ${Math.round(8+power*28)}px hsla(${hue},95%,55%,${(.1+power*.3).toFixed(2)})`});
 },1200);
}
function apply(){
 const opacity=settings.chatOpacity/100, blur=settings.visualBlurEnabled&&!settings.performanceMode?settings.visualBlur:0;
 const radius=settings.visualCornerRadius||0, accent=/^#[0-9a-f]{6}$/i.test(settings.visualAccent)?settings.visualAccent:'#32d4da';
 const targets=yt ? (chatFrame
   ? 'html, body, yt-live-chat-app, yt-live-chat-renderer, #chat, #item-list, #items, #contents, #input-panel, #header'
   : 'ytd-live-chat-frame, ytd-live-chat-frame #chatframe')
   : '.chat-room, .stream-chat, .chat-shell, .chat-scrollable-area__message-container';
 const theaterCSS=theater?(yt?'#secondary, #related {display:none!important}':'.channel-root__right-column {display:none!important}'):'';
 style.textContent=`
  ${targets}{background-color:rgba(15,18,28,${opacity})!important; ${blur?`backdrop-filter:blur(${blur}px)!important;`:''}}
  ${yt && !chatFrame?'ytd-live-chat-frame{border-radius:'+radius+'px!important;overflow:hidden!important;}':''}
  ${yt && chatFrame?'yt-live-chat-renderer{border-radius:'+radius+'px!important;}':''}
  ${tw?'.chat-room{border-radius:'+radius+'px!important;}':''}
  ${settings.visualAccentEnabled ? (yt?'ytd-live-chat-frame, yt-live-chat-renderer':'.chat-room')+'{outline:1px solid '+accent+'66!important;}' : ''}
  ${theaterCSS}
 `;
 if(settings.visualAmbilightEnabled&&!settings.performanceMode&&!matchMedia('(prefers-reduced-motion:reduce)').matches)startGlow();else cleanup();
}
async function pip(){
 const v=video();if(!v||!document.pictureInPictureEnabled)return false;
 try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await v.requestPictureInPicture();return true;}catch{return false;}
}
document.addEventListener('keydown',e=>{
 if(e.repeat||!e.altKey||!e.shiftKey||e.ctrlKey||e.metaKey||e.target?.closest?.('input,textarea,select,[contenteditable],[role="textbox"]'))return;
 if(e.code==='KeyT'){if(window!==window.top)return;theater=!theater;apply();}
 else if(e.code==='KeyP'){if(window!==window.top)return;void pip();}
 else if(e.code==='KeyO'){
  const value=settings.chatOpacity===100?30:100;
  chrome.storage.local.get('vortexSettings').then(r=>chrome.storage.local.set({vortexSettings:{...r.vortexSettings,chatOpacity:value}}));
 }else return;
 e.preventDefault();e.stopPropagation();
},true);
chrome.storage.local.get('vortexSettings').then(r=>{settings=VortexCore.normalizeSettings(r.vortexSettings);apply();});
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area==='local'&&changes.vortexSettings){settings=VortexCore.normalizeSettings(changes.vortexSettings.newValue);apply();}
});
if(window===window.top){
 chrome.runtime.onMessage.addListener((m,_sender,send)=>{
  if(m?.action==='VORTEX_VISUAL_TOGGLE_THEATER'){theater=!theater;apply();send({ok:true,theater});}
  else if(m?.action==='VORTEX_VISUAL_PIP'){pip().then(ok=>send({ok}));return true;}
 });
}
addEventListener('pagehide',cleanup,{once:true});
})();
