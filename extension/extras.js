/* Small chat and channel controls that reuse Twitch's existing page. */
(() => {
  'use strict';
  if (window.__vortexExtrasInstalled) return;
  window.__vortexExtrasInstalled = true;

  let settings = VortexCore.normalizeSettings();
  const seenMentions = new WeakMap();
  const drafts = new Map();
  let historyIndex = -1;
  let initialDraft = '';
  let audioContext;
  let lastSound = 0;
  let previewTimer;
  let preview;
  let mentionScanFrame = 0;
  let mentionsInitialized = false;
  let catchupVideo = null;

  function channel() { return VortexCore.channelFromPath(location.pathname); }
  function editor() {
    return document.querySelector('[data-slate-editor="true"], textarea[data-a-target="chat-input"], [data-a-target="chat-input"] [contenteditable="true"]');
  }
  function editorText(node) { return node?.tagName === 'TEXTAREA' ? node.value : (node?.innerText || node?.textContent || ''); }
  function replaceEditor(text) {
    window.dispatchEvent(new CustomEvent('vortex-chat-bridge', {
      detail: { type: 'INSERT_TEXT', text, replaceAll: true, exact: true, requestId: `history-${Date.now()}` }
    }));
  }
  function playMention() {
    if (!settings.mentionSound || Date.now() - lastSound < 2000) return;
    lastSound = Date.now();
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const tone = audioContext.createOscillator();
      const gain = audioContext.createGain();
      tone.type = 'sine';
      tone.frequency.value = 660;
      gain.gain.setValueAtTime(0.035, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
      tone.connect(gain).connect(audioContext.destination);
      tone.start();
      tone.stop(audioContext.currentTime + 0.19);
    } catch { /* Browsers may block sound until the user interacts with the page. */ }
  }
  function scanMentions(notify = true) {
    const name = settings.mentionName;
    const expression = name ? new RegExp(`(^|[^a-z0-9_])@${name}(?![a-z0-9_])`, 'i') : null;
    document.querySelectorAll('.chat-line__message, [data-a-target="chat-line-message"]').forEach(line => {
      const key = `${channel()}:${line.dataset.vortexMessageId || line.getAttribute('data-id') || ''}:${name}`;
      const firstSeen = !seenMentions.has(line);
      const ownName = line.querySelector('[data-a-target="chat-message-username"], .chat-line__username')?.textContent?.trim().toLowerCase();
      const ignored = VortexCore.matchesExactList(ownName || '', settings.mentionIgnoreUsers) ||
        VortexCore.matchesExactList(channel(), settings.mentionMuteChannels);
      const body = line.querySelector('[data-a-target="chat-line-message-body"], .chat-line__message--content') || line;
      const mentioned = Boolean(expression && !ignored && ownName !== name && expression.test(body.textContent || ''));
      if (line.classList.contains('vortex-named-mention') !== mentioned) line.classList.toggle('vortex-named-mention', mentioned);
      if (mentioned && line.style.getPropertyValue('--vortex-mention-color') !== settings.mentionColor)
        line.style.setProperty('--vortex-mention-color', settings.mentionColor);
      if (mentioned && notify && mentionsInitialized && (firstSeen || seenMentions.get(line) !== key)) playMention();
      seenMentions.set(line, key);
    });
    mentionsInitialized = true;
  }

  document.addEventListener('keydown', event => {
    const node = editor();
    if (!settings.inputHistory || !node || !node.contains(event.target) || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    const name = channel();
    if (!name) return;
    const text = editorText(node).trim();
    if (event.key === 'Enter' && !event.shiftKey && event.isTrusted && text) {
      const items = drafts.get(name) || [];
      if (items.at(-1) !== text) items.push(text.slice(0, 500));
      if (items.length > 40) items.shift();
      drafts.set(name, items);
      historyIndex = -1;
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const items = drafts.get(name) || [];
    if (!items.length || (historyIndex < 0 && (event.key !== 'ArrowUp' || text))) return;
    if (historyIndex < 0) initialDraft = editorText(node);
    historyIndex = event.key === 'ArrowUp' ? Math.min(items.length - 1, historyIndex + 1) : historyIndex - 1;
    event.preventDefault();
    event.stopPropagation();
    replaceEditor(historyIndex < 0 ? initialDraft : items[items.length - 1 - historyIndex]);
  }, true);

  function syncQuickLinks() {
    let menu = document.getElementById('vortex-channel-links');
    const name = channel();
    const header = document.querySelector('.stream-chat-header');
    if (!settings.channelQuickLinks || !name || !header) { menu?.remove(); return; }
    if (!menu) {
      menu = document.createElement('details');
      menu.id = 'vortex-channel-links';
      menu.innerHTML = '<summary aria-label="Ссылки канала">⋯</summary><nav aria-label="Ссылки канала"></nav>';
      header.append(menu);
    }
    if (menu.dataset.channel === name) return;
    menu.dataset.channel = name;
    const nav = menu.querySelector('nav');
    nav.replaceChildren();
    for (const [label, path] of [['Клипы', `/${name}/clips`], ['Записи', `/${name}/videos`], ['О канале', `/${name}/about`]]) {
      const link = document.createElement('a');
      link.href = path;
      link.textContent = label;
      nav.append(link);
    }
  }

  function syncLiveButton() {
    let button = document.getElementById('vortex-back-to-live');
    const name = channel();
    const video = [...document.querySelectorAll('video')].find(item => {
      const rect = item.getBoundingClientRect();
      return rect.width > 300 && rect.height > 150 && !item.closest('#vortex-clip-dialog');
    });
    const restoreRate = () => {
      if (catchupVideo?.playbackRate === 1.05) catchupVideo.playbackRate = 1;
      catchupVideo = null;
    };
    if ((!settings.liveControls && !settings.autoCatchup) || !name || !video || /\/(videos|clip)\//.test(location.pathname) || !video.seekable?.length) {
      restoreRate(); button?.remove(); return;
    }
    let end;
    try { end = video.seekable.end(video.seekable.length - 1); } catch { restoreRate(); button?.remove(); return; }
    const delay = end - video.currentTime;
    if (catchupVideo && (catchupVideo !== video || !settings.autoCatchup || !Number.isFinite(delay) || delay <= 3 || video.playbackRate !== 1.05)) restoreRate();
    if (settings.autoCatchup && delay > 6 && !catchupVideo && video.playbackRate === 1) {
      try { video.playbackRate = 1.05; catchupVideo = video; } catch { /* Some players lock playback speed. */ }
    }
    if (!settings.liveControls || !Number.isFinite(delay) || delay < 3) { button?.remove(); return; }
    if (!button) {
      button = document.createElement('button');
      button.id = 'vortex-back-to-live';
      button.type = 'button';
      button.addEventListener('click', () => {
        const current = [...document.querySelectorAll('video')].find(item => item.getBoundingClientRect().width > 300);
        if (current?.seekable?.length) current.currentTime = Math.max(0, current.seekable.end(current.seekable.length - 1) - 0.5);
      });
      document.body.append(button);
    }
    button.textContent = `В эфир · ${Math.round(delay)} с`;
    const rect = video.getBoundingClientRect();
    button.style.left = `${Math.max(8, rect.right - 128)}px`;
    button.style.top = `${Math.max(8, rect.bottom - 48)}px`;
  }

  document.addEventListener('pointerover', event => {
    if (!settings.sidebarPreview || preview || previewTimer) return;
    const link = event.target.closest?.('.side-nav-card__link');
    if (!link) return;
    const name = VortexCore.channelFromPath(new URL(link.href).pathname);
    if (!name) return;
    previewTimer = setTimeout(() => {
      previewTimer = null;
      if (!link.isConnected) return;
      const card = document.createElement('div');
      card.id = 'vortex-sidebar-preview';
      const image = document.createElement('img');
      image.src = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${name}-320x180.jpg`;
      image.alt = `Превью канала ${name}`;
      const title = document.createElement('strong');
      title.textContent = `#${name}`;
      card.append(image, title);
      document.body.append(card);
      const rect = link.getBoundingClientRect();
      card.style.left = `${Math.min(innerWidth - 340, rect.right + 8)}px`;
      card.style.top = `${Math.max(8, Math.min(innerHeight - 220, rect.top))}px`;
      preview = card;
    }, 450);
  });
  document.addEventListener('pointerout', event => {
    const link = event.target.closest?.('.side-nav-card__link');
    if (!link || link.contains(event.relatedTarget)) return;
    clearTimeout(previewTimer);
    previewTimer = null;
    preview?.remove();
    preview = null;
  });

  chrome.storage.local.get('vortexSettings').then(saved => {
    settings = VortexCore.normalizeSettings(saved.vortexSettings);
    scanMentions(false);
    syncQuickLinks();
  });
  chrome.storage.onChanged.addListener(changes => {
    if (!changes.vortexSettings) return;
    settings = VortexCore.normalizeSettings(changes.vortexSettings.newValue);
    scanMentions(false);
    syncQuickLinks();
    if (!settings.sidebarPreview) { preview?.remove(); preview = null; }
  });
  const observer = new MutationObserver(() => {
    if (mentionScanFrame) return;
    mentionScanFrame = requestAnimationFrame(() => { mentionScanFrame = 0; scanMentions(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { syncQuickLinks(); syncLiveButton(); }, 1200);
  addEventListener('pagehide', () => {
    observer.disconnect(); cancelAnimationFrame(mentionScanFrame); clearTimeout(previewTimer); audioContext?.close();
    if (catchupVideo?.playbackRate === 1.05) catchupVideo.playbackRate = 1;
  }, { once: true });
})();
