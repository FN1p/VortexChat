/* YouTube Live Chat: bounded 7TV global emote rendering, without chat injection. */
(() => {
  'use strict';
  if (globalThis.__vortexYouTubeAppearance) return;
  globalThis.__vortexYouTubeAppearance = true;
  const isChatFrame = /^\/live_chat(?:_replay)?\/?$/.test(location.pathname);
  let emotes = new Map();
  let observer = null;
  let observedRoot = null;
  let disposed = false;
  const rendered = new WeakSet();
  const queue = new Set();
  let scheduled = false;

  function renderMessage(message) {
    const body = message.querySelector('#message');
    if (!body || rendered.has(body)) return;
    rendered.add(body);
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('a, button, .vortex-yt-emote')) continue;
      if (node.textContent && /\S/.test(node.textContent)) nodes.push(node);
    }
    for (const node of nodes) {
      const parts = node.textContent.split(/(\s+)/);
      if (!parts.some(part => emotes.has(part))) continue;
      const fragment = document.createDocumentFragment();
      for (const part of parts) {
        const emote = emotes.get(part);
        if (!emote) { fragment.appendChild(document.createTextNode(part)); continue; }
        const img = document.createElement('img');
        img.className = 'vortex-yt-emote';
        img.src = emote.url;
        img.alt = part;
        img.title = part + ' · 7TV';
        img.loading = 'lazy';
        img.decoding = 'async';
        fragment.appendChild(img);
      }
      node.replaceWith(fragment);
    }
  }

  function flush() {
    scheduled = false;
    let count = 0;
    for (const item of queue) {
      queue.delete(item);
      if (item.isConnected) renderMessage(item);
      if (++count >= 100) break;
    }
    if (queue.size) schedule();
  }
  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    requestAnimationFrame(flush);
  }
  function startChat() {
    if (!isChatFrame || disposed) return;
    const root = document.querySelector('yt-live-chat-item-list-renderer #items');
    if (!root || (root === observedRoot && observer)) return;
    observer?.disconnect();
    observedRoot = root;
    root.querySelectorAll('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer').forEach(item => queue.add(item));
    schedule();
    observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType !== 1 || node.classList?.contains('vortex-yt-emote')) continue;
        if (node.matches?.('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer')) queue.add(node);
        node.querySelectorAll?.('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer').forEach(item => queue.add(item));
      }
      if (queue.size) schedule();
    });
    observer.observe(root, {childList:true, subtree:true});
  }

  async function loadGlobal() {
    try {
      const result = await chrome.runtime.sendMessage({action:'VORTEX_FETCH_PROVIDER',url:'https://7tv.io/v3/emote-sets/global'});
      if (!result?.ok || disposed) return;
      emotes = new Map(VortexCore.parse7TV(result.data?.emotes, false).map(emote => [emote.code, emote]));
      startChat();
    } catch { /* YouTube chat stays usable when 7TV is offline. */ }
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.action !== 'GET_VORTEXCHAT_STATUS') return;
    const isLive = isChatFrame || Boolean(document.querySelector('ytd-live-chat-frame, #chatframe'));
    respond({platform:'youtube',channel:isLive?'Live':'',loadState:emotes.size?'ready':'loading',
      eventState:'connected',emoteCount:emotes.size});
  });
  if (isChatFrame) {
    const style = document.createElement('style');
    style.textContent = '.vortex-yt-emote{display:inline-block;height:28px;max-width:112px;width:auto;vertical-align:middle;object-fit:contain;margin:0 2px}';
    (document.head || document.documentElement).appendChild(style);
    loadGlobal();
    const timer = setInterval(() => { if (!document.hidden) startChat(); }, 2000);
    window.addEventListener('pagehide', () => { disposed = true; clearInterval(timer); observer?.disconnect(); observedRoot = null; queue.clear(); }, {once:true});
  }
})();
