/* VortexChat Beta visual layer: video-only effects; never reads chat messages. */
(() => {
'use strict';
if(globalThis.__vortexVisualControls)return;
globalThis.__vortexVisualControls=true;
const yt=/(^|\.)youtube\.com$/.test(location.hostname),tw=/(^|\.)twitch\.tv$/.test(location.hostname);
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
function stopLight(){
 clearInterval(timer);timer=0;
 light?.remove();light=null;currentVideo=null;
}
function startLight(){
 if(timer||!topPage)return;
 // The older glow used z-index:1, leaving it *behind* YouTube's opaque player.
 // The new transparent, pointer-events-none layer floats above page backgrounds.
 light=document.createElement('div');light.className='vortex-ambient-layer';
 Object.assign(light.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483000',
  borderRadius:'12px',display:'none',willChange:'box-shadow',transition:'box-shadow 400ms ease'});
 document.documentElement.append(light);
 const canvas=document.createElement('canvas');canvas.width=24;canvas.height=14;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 let samplingBlocked=false;
 let edges=[[48,134,218],[48,134,218],[48,134,218],[48,134,218]];
 function average(data,x0,x1,y0,y1){
  let r=0,g=0,b=0,n=0;
  for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){
   const i=(y*24+x)*4;r+=data[i];g+=data[i+1];b+=data[i+2];n++;
  }
  return [Math.round(r/n),Math.round(g/n),Math.round(b/n)];
 }
 timer=setInterval(()=>{
  const v=getVideo();
  if(!v||document.hidden||v.readyState<2||document.pictureInPictureElement===v){
   if(light)light.style.display='none';return;
  }
  const rect=v.getBoundingClientRect();
  if(rect.bottom<0||rect.top>innerHeight||rect.width<200){
   light.style.display='none';return;
  }
  currentVideo=v;
  if(!samplingBlocked){
   try{
    ctx.drawImage(v,0,0,24,14);
    const pixels=ctx.getImageData(0,0,24,14).data;
    edges=[
     average(pixels,1,23,0,3), average(pixels,21,24,1,13),
     average(pixels,1,23,11,14),average(pixels,0,3,1,13)
    ];
   }catch(error){
    // Protected/cross-origin video cannot be sampled. Keep the effect visible
    // using a calm fallback rather than hiding it or logging continuously.
    samplingBlocked=true;
   }
  }
  const power=clamp(settings.visualAmbilightIntensity,0,100)/100;
  const alpha=(.13+power*.48).toFixed(2);
  const spread=Math.round(5+power*26),blur=Math.round(28+power*65);
  const rgba=index=>'rgba('+edges[index].join(',')+','+alpha+')';
  Object.assign(light.style,{display:'block',left:rect.left+'px',top:rect.top+'px',
    width:rect.width+'px',height:rect.height+'px',
    boxShadow:[
      '0 -'+spread+'px '+blur+'px '+spread+'px '+rgba(0),
      spread+'px 0 '+blur+'px '+spread+'px '+rgba(1),
      '0 '+spread+'px '+blur+'px '+spread+'px '+rgba(2),
      '-'+spread+'px 0 '+blur+'px '+spread+'px '+rgba(3)
    ].join(',')});
 },250);
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
 if((yt?settings.youtubeAmbientEnabled:settings.visualAmbilightEnabled)&&!settings.performanceMode&&!matchMedia('(prefers-reduced-motion:reduce)').matches)startLight();else stopLight();
 updatePanelValues();
}
function save(key,value){
 settings=VortexCore.normalizeSettings({...settings,[key]:value});cssApply();
 chrome.storage.local.get('vortexSettings').then(r=>chrome.storage.local.set({vortexSettings:{...r.vortexSettings,[key]:value}}));
}
function updatePanelValues(){
 if(!panel)return;
 const toggle=panel.querySelector('[data-setting=youtubeAmbientEnabled]');
 const power=panel.querySelector('[data-setting=visualAmbilightIntensity]');
 const perf=panel.querySelector('[data-setting=performanceMode]');
 if(toggle)toggle.checked=settings.youtubeAmbientEnabled;
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
 <label>Ambilight <input type="checkbox" data-setting="youtubeAmbientEnabled"></label>
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
