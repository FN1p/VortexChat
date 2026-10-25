/* VortexChat YouTube Live integration: background appearance only.
 * Intentionally does not read, intercept, modify, or send chat messages.
 * Twitch scripts and desktop chat are untouched.
 */
(() => {
  'use strict';
  if (globalThis.__vortexYouTubeAppearance) return;
  globalThis.__vortexYouTubeAppearance = true;
  const inChatFrame = location.pathname.startsWith('/live_chat');
  const style = document.createElement('style');
  style.id = 'vortex-youtube-appearance';

  function render(settings) {
    const opacity = VortexCore.normalizeSettings(settings).chatOpacity / 100;
    // YouTube Live is often embedded in a same-origin iframe. Only its
    // containers' backgrounds change; text and chat content remain intact.
    if (inChatFrame) {
      style.textContent = `
        html, body, yt-live-chat-app, yt-live-chat-renderer,
        #chat, #item-list, #items, #contents, #message-input,
        #input-panel, #ticker, #header, #panel-pages {
          background-color: rgba(15, 18, 28, ${opacity}) !important;
        }
      `;
    } else {
      style.textContent = `
        ytd-live-chat-frame, ytd-live-chat-frame #chatframe {
          background-color: rgba(15, 18, 28, ${opacity}) !important;
        }
      `;
    }
    if (!style.isConnected) (document.head || document.documentElement).appendChild(style);
  }

  chrome.storage.local.get('vortexSettings').then(value => render(value.vortexSettings));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.vortexSettings) render(changes.vortexSettings.newValue);
  });

  if (window.top === window) {
    chrome.runtime.onMessage.addListener((message, _sender, respond) => {
      if (message?.action !== 'GET_VORTEXCHAT_STATUS') return;
      respond({
        platform: 'youtube',
        channel: 'Live',
        loadState: 'ready',
        eventState: 'connected',
        emoteCount: 0
      });
    });
  }
})();
