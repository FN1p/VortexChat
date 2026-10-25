/* YouTube Live integration: read-only platform detection. No chat message processing. */
(() => {
  'use strict';
  if (globalThis.__vortexYouTubeAppearance) return;
  globalThis.__vortexYouTubeAppearance = true;
  if (window !== window.top) return;
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.action !== 'GET_VORTEXCHAT_STATUS') return;
    const isLive = Boolean(document.querySelector('ytd-live-chat-frame, #chatframe')) || location.pathname.startsWith('/live_chat');
    respond({platform:'youtube',channel: isLive ? 'Live' : '',loadState:'ready',eventState:'connected',emoteCount:0});
  });
})();
