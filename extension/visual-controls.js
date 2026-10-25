/* VortexChat Beta visual layer: video-only effects; never reads chat messages. */
(() => {
'use strict';
if(globalThis.__vortexVisualControls)return;
globalThis.__vortexVisualControls=true;
const yt=/(^|\\.)youtube\\.com$/.test(location.hostname),tw=/(^|\\.)twitch\\.tv$/.test(location.hostname);
if(!yt&&!tw)return;
const frame=yt&&location.pathname.startsWith('/live_chat');
const topPage=window===window.top;
let settings=VortexCore.normalizeSettings(),theater=false,light=null,timer=0,currentVideo=null,settingsButton=null,panel=null;
const style=document.createElement('style');style.id='vortex-visual-styles';(document.head||document.documentElement).append(style);
const clamp=(x,min,max)=>Math.min(max,Math.max(min,Number(x)||0));
function getVideo(){
 return [...document.querySelectorAll('video')].filter(v=>{const r=v.getBoundingClientRect();return r.width>200&&r.height>110})
 .sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0]||null;
}
function stopLight(){clearInterval(timer);timer=0;light?.remove();light=null;currentVideo=null;}
function startLight(){
 if(timer||!topPage)return;
 light=document.createElement('div');light.className='vortex-ambient-layer';
 Object.assign(light.style,{position:'fixed',pointerEvents:'none',zIndex:'1',borderRadius:'14px',display:'none',willChange:'box-shadow',transition:'box-shadow 320ms ease'});
 document.documentElement.append(light);
 const canvas=document.createElement('canvas');canvas.width=12;canvas.height=8;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 let sampled=false;let color=[35,166,230];
 timer=setInterval(()=>{
  const v=getVideo();
  if(!v||document.hidden||v.readyState<2||v.paused||document.pictureInPictureElement===v){light.style.display='none';return;}
  const rect=v.getBoundingClientRect();
  if(rect.bottom<0||rect.top>innerHeight){light.style.display='none';return;}
  currentVideo=v;
  // Video pixels may be inaccessible due to video origin/DRM. Fall back gracefully.
  if(!sampled||v.currentTime>0){
   try{
    ctx.drawImage(v,0,0,12,8);
    const pixels=ctx.getImageData(0,0,12,8).data;let r=0,g=0,b=0,n=0;
    for(let i=0;i<pixels.length;i+=16){r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];n++;}
    color=[Math.round(r/n),Math.round(g/n),Math.round(b/n)];sampled=true;
   }catch{sampled=false;const phase=Date.now()/3500;color=[Math.round(45+25*Math.sin(phase)),75,175];}
  }
  const power=clamp(settings.visualAmbilightIntensity,0,100)/100;
  Object.assign(light.style,{display:'block',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',
   boxShadow:`0 0 ${Math.round(35+power*95)}px ${Math.round(10+power*42)}px rgba(${color.join(',')},${(.18+power*.48).toFixed(2)})`});
 },350);
}
function cssApply(){
 const opacity=settings.chatOpacity/100,blur=settings.visualBlurEnabled&&!settings.performanceMode?settings.visualBlur:0;
 const radius=settings.visualCornerRadius||0;
 const accent=/^#[0-9a-f]{6}$/i.test(settings.visualAccent)?settings.visualAccent:'#32d4da';
 const sel=yt?(frame?'html,body,yt-live-chat-app,yt-live-chat-renderer,#chat,#item-list,#items,#contents,#input-panel,#header':'ytd-live-chat-frame,ytd-live-chat-frame #chatframe')
 :'.chat-room,.stream-chat,.chat-shell,.chat-scrollable-area__message-container';
 style.textContent=`
 ${sel}{background-color:rgba(15,18,28,${opacity})!important;${blur?`backdrop-filter:blur(${blur}px)!important;`:''}}
 ${yt?'ytd-live-chat-frame,yt-live-chat-renderer':'.chat-room'}{border-radius:${radius}px!important;${settings.visualAccentEnabled?`outline:1px solid ${accent}88!important;`:''}}
 ${theater?(yt?'#secondary,#related{display:none!important}':'.channel-root__right-column{display:none!important}') : ''}
 .vortex-yt-settings{font-family:Arial,sans-serif!important;background:#171a26!important;color:#eaf5ff!important;border:1px solid #45d4d866!important;border-radius:9px!important;cursor:pointer!important}
 .vortex-yt-panel{position:absolute;bottom:56px;right:12px;width:255px;box-sizing:border-box;z-index:2147483646;background:#111724;color:#f0f6ff;border:1px solid #39d8d077;border-radius:14px;padding:15px;box-shadow:0 12px 35px #000b;font:13px Arial,sans-serif}
 .vortex-yt-panel label{display:flex;justify-content:space-between;gap:10px;margin:10px 0;align-items:center}
 .vortex-yt-panel input[type=range]{width:112px;accent-color:#39d8d0}
 .vortex-yt-panel button{border:1px solid #39d8d077;background:#1e2c3b;color:#fff;padding:7px;border-radius:7px;cursor:pointer}
 `;
 if(settings.visualAmbilightEnabled&&!settings.performanceMode&&!matchMedia('(prefers-reduced-motion:reduce)').matches)startLight();else stopLight();
 updatePanelValues();
}
function save(key,value){
 settings=VortexCore.normalizeSettings({...settings,[key]:value});cssApply();
 chrome.storage.local.get('vortexSettings').then(r=>chrome.storage.local.set({vortexSettings:{...r.vortexSettings,[key]:value}}));
}
function updatePanelValues(){
 if(!panel)return;
 const toggle=panel.querySelector('[data-setting=visualAmbilightEnabled]');
 const power=panel.querySelector('[data-setting=visualAmbilightIntensity]');
 const perf=panel.querySelector('[data-setting=performanceMode]');
 if(toggle)toggle.checked=settings.visualAmbilightEnabled;
 if(power)power.value=settings.visualAmbilightIntensity;
 if(perf)perf.checked=settings.performanceMode;
 const out=panel.querySelector('output');if(out)out.textContent=settings.visualAmbilightIntensity+'%';
}
function initButton(){
 if(!yt||!topPage||!/^\/(watch|live|shorts)/.test(location.pathname))return;
 const player=document.querySelector('#movie_player');
 if(!player)return;
 if(settingsButton?.isConnected)return;
 settingsButton=document.createElement('button');settingsButton.type='button';settingsButton.className='vortex-yt-settings';
 settingsButton.textContent='✦ Vortex';settingsButton.title='Настройки VortexChat';
 Object.assign(settingsButton.style,{position:'absolute',right:'15px',top:'15px',padding:'8px 12px',zIndex:'2147483645'});
 settingsButton.addEventListener('click',e=>{e.stopPropagation();if(panel){panel.remove();panel=null;return;}openPanel(player);});
 player.append(settingsButton);
}
function openPanel(player){
 panel=document.createElement('section');panel.className='vortex-yt-panel';panel.setAttribute('aria-label','VortexChat — настройки YouTube');
 panel.innerHTML=`<strong style="color:#39d8d0;font-size:16px">✦ VortexChat Beta</strong>
 <label>Ambilight <input type="checkbox" data-setting="visualAmbilightEnabled"></label>
 <label>Интенсивность <input type="range" min="0" max="100" data-setting="visualAmbilightIntensity"></label>
 <output>50%</output>
 <label>Экономия ресурсов <input type="checkbox" data-setting="performanceMode"></label>
 <div style="display:flex;gap:8px;margin-top:14px"><button type="button" data-action="pip">PiP</button><button type="button" data-action="theater">Кинотеатр</button><button type="button" data-action="close">Закрыть</button></div>`;
 panel.addEventListener('click',e=>e.stopPropagation());
 panel.addEventListener('change',e=>{
  const input=e.target;if(!input.dataset.setting)return;
  save(input.dataset.setting,input.type==='checkbox'?input.checked:Number(input.value));
 });
 panel.addEventListener('input',e=>{
  if(e.target.dataset.setting==='visualAmbilightIntensity'){panel.querySelector('output').textContent=e.target.value+'%';}
 });
 panel.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.action==='close'){panel.remove();panel=null;}
  if(b.dataset.action==='theater'){theater=!theater;cssApply();}
  if(b.dataset.action==='pip')void pip();
 });
 player.append(panel);updatePanelValues();
}
async function pip(){const v=getVideo();if(!v||!document.pictureInPictureEnabled)return false;try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await v.requestPictureInPicture();return true;}catch{return false;}}
document.addEventListener('keydown',e=>{
 if(e.repeat||!e.altKey||!e.shiftKey||e.ctrlKey||e.metaKey||e.target?.closest?.('input,textarea,select,[contenteditable],[role=textbox]'))return;
 if(e.code==='KeyT'&&topPage){theater=!theater;cssApply();}
 else if(e.code==='KeyP'&&topPage){void pip();}
 else if(e.code==='KeyO')save('chatOpacity',settings.chatOpacity===100?30:100);
 else return;
 e.preventDefault();e.stopPropagation();
},true);
chrome.storage.local.get('vortexSettings').then(r=>{settings=VortexCore.normalizeSettings(r.vortexSettings);cssApply();initButton();});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.vortexSettings){settings=VortexCore.normalizeSettings(changes.vortexSettings.newValue);cssApply();}});
if(yt&&topPage){new MutationObserver(()=>{if(!settingsButton?.isConnected){panel=null;initButton();}}).observe(document.documentElement,{childList:true,subtree:true});}
if(topPage)chrome.runtime.onMessage.addListener((m,_s,reply)=>{if(m?.action==='VORTEX_VISUAL_TOGGLE_THEATER'){theater=!theater;cssApply();reply({ok:true});}else if(m?.action==='VORTEX_VISUAL_PIP'){pip().then(ok=>reply({ok}));return true;}});
addEventListener('pagehide',stopLight,{once:true});
})();
