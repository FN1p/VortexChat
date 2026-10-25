/* Isolated visual controls for Twitch and YouTube. Never touches message content. */
(() => {
'use strict';
if (globalThis.__vortexVisualControls) return;
globalThis.__vortexVisualControls = true;
const twitch = /(^|\.)twitch\.tv$/.test(location.hostname);
const youtube = /(^|\.)youtube\.com$/.test(location.hostname);
if (!twitch && !youtube) return;
let settings = {}, theater = false, ambient = null, ambientTimer = null, lastVideo = null;
const css = document.createElement('style');
css.id = 'vortex-visual-controls';
(document.head || document.documentElement).appendChild(css);
const clamp = (n, fallback = 100) => Math.max(0, Math.min(100, Number.isFinite(+n) ? +n : fallback));
function getVideo() {
  return [...document.querySelectorAll('video')].filter(v => {
    const r = v.getBoundingClientRect(); return r.width > 300 && r.height > 150;
  }).sort((a,b) => b.clientWidth*b.clientHeight - a.clientWidth*a.clientHeight)[0];
}
function update() {
  const opacity = clamp(settings.chatOpacity) / 100;
  const blur = settings.visualBlurEnabled ? Math.min(24,Math.max(0,+settings.visualBlur || 0)) : 0;
  const reduced = settings.performanceMode || matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.toggleAttribute('data-vortex-theater',theater);
  document.documentElement.toggleAttribute('data-vortex-performance',!!settings.performanceMode);
  const selectors = twitch
    ? '.chat-room, .stream-chat, .chat-shell, .chat-scrollable-area__message-container'
    : 'ytd-live-chat-frame, yt-live-chat-app, yt-live-chat-renderer, #chat, #item-list, #input-panel';
  css.textContent = `
    ${selectors} { background-color: rgba(15,18,28,${opacity}) !important;
      ${blur && !reduced ? `backdrop-filter: blur(${blur}px) !important;` : ''} }
    ${theater ? (twitch ? '.channel-root__right-column { display:none !important; }' : '#secondary, #related { display:none !important; }') : ''}
    [data-vortex-performance] .vortex-ambient-canvas {display:none!important}
  `;
  if (reduced || !settings.visualAmbilightEnabled) removeAmbient();
  else ensureAmbient();
}
function removeAmbient() {
  clearInterval(ambientTimer); ambientTimer=null;
  ambient?.remove(); ambient=null;
  lastVideo=null;
}
function ensureAmbient() {
  if (ambientTimer) return;
  ambient = document.createElement('div'); ambient.className='vortex-ambient-canvas';
  Object.assign(ambient.style,{position:'fixed',pointerEvents:'none',zIndex:'1',borderRadius:'16px',
    boxShadow:'0 0 65px 15px rgba(38,170,230,.3)',transition:'box-shadow .7s ease',display:'none'});
  document.documentElement.appendChild(ambient);
  ambientTimer=setInterval(() => {
    if (document.hidden || settings.performanceMode) {ambient.style.display='none';return;}
    const v=getVideo();if(!v){ambient.style.display='none';return;}
    const r=v.getBoundingClientRect();if(r.width<300){ambient.style.display='none';return;}
    ambient.style.display='block';
    Object.assign(ambient.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
    // No pixel readback or network activity; simple low-cost color breathing effect.
    const t=Date.now()/2500; const hue=190+Math.round(Math.sin(t)*50);
    const intensity=clamp(settings.visualAmbilightIntensity,50)/100;
    ambient.style.boxShadow=`0 0 ${Math.round(22+intensity*75)}px ${Math.round(6+intensity*28)}px hsla(${hue},90%,55%,${(.1+intensity*.28).toFixed(2)})`;
  },1200);
}
async function pip() {
  const v=getVideo();if(!v || !document.pictureInPictureEnabled || !v.requestPictureInPicture) return false;
  try {if(document.pictureInPictureElement) await document.exitPictureInPicture();else await v.requestPictureInPicture();return true;}catch{return false;}
}
function keydown(event) {
  if (event.repeat || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
  const tag=event.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]');
  if(tag) return;
  const key=event.code;
  if(key==='KeyT'){theater=!theater;update();}
  else if(key==='KeyP'){void pip();}
  else if(key==='KeyO'){settings.chatOpacity=clamp(settings.chatOpacity)===100?35:100;
    chrome.storage.local.get('vortexSettings').then(r=>chrome.storage.local.set({vortexSettings:{...r.vortexSettings,chatOpacity:settings.chatOpacity}}));update();}
  else return;
  event.preventDefault();event.stopPropagation();
}
document.addEventListener('keydown',keydown,true);
chrome.storage.local.get('vortexSettings').then(r=>{settings={...r.vortexSettings};update();});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.vortexSettings){settings={...changes.vortexSettings.newValue};update();}});
chrome.runtime.onMessage.addListener((msg,_sender,respond)=>{
 if(msg?.action==='VORTEX_VISUAL_TOGGLE_THEATER'){theater=!theater;update();respond({ok:true,theater});}
 else if(msg?.action==='VORTEX_VISUAL_PIP'){pip().then(ok=>respond({ok}));return true;}
});
addEventListener('pagehide',removeAmbient,{once:true});
})();
