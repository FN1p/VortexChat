/* Twitch media enhancements. Uses only the public clip embed and local video pixels. */
(() => {
  'use strict';
  let settings = VortexCore.normalizeSettings();
  let video = null;
  let light = null;
  let button = null;
  let bars = [];
  let sampleTimer = 0;
  let positionTimer = 0;
  let clipDialog = null;
  let mutedMedia = [];
  let clipMuteTimer = 0;
  let sample;
  let ctx;
  function resetSample() {
    sample = document.createElement('canvas');
    sample.width = 8;
    sample.height = 5;
    ctx = sample.getContext('2d', { willReadFrequently: true });
  }
  resetSample();

  function save(patch) {
    settings = VortexCore.normalizeSettings({ ...settings, ...patch });
    chrome.storage.local.get('vortexSettings').then(saved =>
      chrome.storage.local.set({ vortexSettings: VortexCore.normalizeSettings({ ...saved.vortexSettings, ...patch }) }));
    sync();
  }

  function findPlayer() {
    return [...document.querySelectorAll('video')]
      .filter(item => !item.closest('#vortex-clip-dialog'))
      .map(item => ({ item, rect: item.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 300 && rect.height >= 150)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0]?.item || null;
  }

  function removeLight() {
    clearInterval(sampleTimer);
    clearInterval(positionTimer);
    sampleTimer = 0;
    positionTimer = 0;
    light?.remove();
    button?.remove();
    bars.forEach(bar => bar.remove());
    bars = [];
    video?.removeEventListener('loadeddata', onVideoLoad);
    video = light = button = null;
    document.documentElement.style.removeProperty('--vortex-ambilight-dim');
    document.documentElement.removeAttribute('data-vortex-ambilight');
  }

  function positionOverlays() {
    if (!video?.isConnected || !light || !button) return;
    const rect = video.getBoundingClientRect();
    const onScreen = rect.width >= 300 && rect.height >= 150 &&
      rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    const visible = settings.ambilightEnabled && !clipDialog && onScreen;
    light.hidden = !visible;
    const twitchControls = video?.closest('[data-a-target="video-player"], .video-player, .video-player__container, [data-test-selector="video-player__container"]');
    const controlsHidden = twitchControls?.classList.contains('video-player--inactive') ||
      twitchControls?.querySelector('[data-a-target="player-controls"][style*="opacity: 0"]');
    button.hidden = !onScreen || Boolean(clipDialog) || Boolean(controlsHidden);
    if (!button.hidden && twitchControls) {
      const hovering = twitchControls.matches(':hover') || button.matches(':hover') || button.matches(':focus');
      button.style.opacity = hovering ? '1' : '0';
      button.style.pointerEvents = hovering ? 'auto' : 'none';
      button.style.transition = 'opacity 180ms ease';
    } else if (!button.hidden) { button.style.opacity = '1'; button.style.pointerEvents = 'auto'; }
    light.style.left = `${rect.left}px`;
    light.style.top = `${rect.top}px`;
    light.style.width = `${rect.width}px`;
    light.style.height = `${rect.height}px`;
    button.style.left = `${Math.max(0, rect.right - 46)}px`;
    button.style.top = `${Math.max(0, rect.top + 14)}px`;
    const fit = getComputedStyle(video).objectFit;
    const gap = fit === 'contain' || fit === 'scale-down'
      ? VortexCore.videoLetterbox(rect.width, rect.height, video.videoWidth, video.videoHeight)
      : { left: 0, right: 0, top: 0, bottom: 0 };
    const positions = [
      { left: rect.left, top: rect.top, width: gap.left, height: rect.height },
      { left: rect.right - gap.right, top: rect.top, width: gap.right, height: rect.height },
      { left: rect.left, top: rect.top, width: rect.width, height: gap.top },
      { left: rect.left, top: rect.bottom - gap.bottom, width: rect.width, height: gap.bottom }
    ];
    bars.forEach((bar, index) => {
      const area = positions[index];
      bar.hidden = !visible || (index < 2 ? area.width : area.height) < 2;
      Object.assign(bar.style, { left: `${area.left}px`, top: `${area.top}px`,
        width: `${area.width}px`, height: `${area.height}px` });
    });
  }

  function averageColor(data, xStart, xEnd, yStart, yEnd) {
    const totals = [0, 0, 0];
    let count = 0;
    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        const index = (y * sample.width + x) * 4;
        for (let channel = 0; channel < 3; channel++) totals[channel] += data[index + channel];
        count++;
      }
    }
    return totals.map(total => total / count);
  }

  function colorCss(parts) { return `rgb(${parts.map(value => Math.round(value)).join(' ')})`; }

  function sampleFrame() {
    if (!video || !light || video.readyState < 2 || video.paused || document.hidden) return;
    try {
      ctx.drawImage(video, 0, 0, sample.width, sample.height);
      const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
      const left = averageColor(pixels, 0, 1, 1, 3);
      const right = averageColor(pixels, 6, 7, 1, 3);
      const top = averageColor(pixels, 2, 5, 0, 0);
      const strength = settings.ambilightBrightness / 100;
      const spread = settings.ambilightSpread / 100;
      const reach = Math.round(35 + spread * 125);
      const blur = Math.round(35 + spread * 85);
      light.style.opacity = String(strength);
      light.style.boxShadow = `-${Math.round(reach * 0.42)}px 0 ${blur}px ${Math.round(reach * 0.14)}px ${colorCss(left)}, ${Math.round(reach * 0.42)}px 0 ${blur}px ${Math.round(reach * 0.14)}px ${colorCss(right)}, 0 -${Math.round(reach * 0.3)}px ${blur}px ${Math.round(reach * 0.12)}px ${colorCss(top)}`;
      bars[0].style.background = colorCss(left);
      bars[1].style.background = colorCss(right);
      bars[2].style.background = colorCss(top);
      bars[3].style.background = `linear-gradient(90deg, ${colorCss(left)}, ${colorCss(right)})`;
      bars.forEach(bar => { bar.style.opacity = String(Math.min(0.65, strength * 0.7)); });
      button.title = 'Ambilight включён';
    } catch {
      // DRM or cross-origin video may prevent pixel sampling. Keep controls usable.
      light.style.opacity = '0';
      light.style.boxShadow = 'none';
      bars.forEach(bar => { bar.style.opacity = '0'; });
      button.title = 'Ambilight: браузер не разрешает читать кадры этого видео';
      clearInterval(sampleTimer);
      sampleTimer = 0;
    }
  }

  function onVideoLoad() {
    resetSample();
    if (settings.ambilightEnabled) sync();
  }

  function attachLight() {
    const found = findPlayer();
    if (!found) { if (video) removeLight(); return; }
    if (video === found) return;
    removeLight();
    video = found;
    video.addEventListener('loadeddata', onVideoLoad);
    light = document.createElement('div');
    light.className = 'vortex-ambilight-light';
    light.setAttribute('aria-hidden', 'true');
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'vortex-ambilight-button';
    button.textContent = '✦';
    button.setAttribute('aria-label', 'Включить или выключить Ambilight');
    button.addEventListener('click', () => save({ ambilightEnabled: !settings.ambilightEnabled }));
    bars = Array.from({ length: 4 }, () => {
      const bar = document.createElement('div');
      bar.className = 'vortex-ambilight-bar';
      bar.setAttribute('aria-hidden', 'true');
      return bar;
    });
    document.body.append(light, ...bars, button);
    positionTimer = setInterval(positionOverlays, 200);
    sync();
  }

  function sync() {
    if (!video) return;
    button.setAttribute('aria-pressed', String(settings.ambilightEnabled));
    button.title = settings.ambilightEnabled ? 'Выключить Ambilight' : 'Включить Ambilight';
    document.documentElement.toggleAttribute('data-vortex-ambilight', settings.ambilightEnabled);
    document.documentElement.style.setProperty('--vortex-ambilight-dim', String(settings.ambilightEnabled ? settings.ambilightDimUI / 200 : 0));
    light.style.transitionDuration = `${Math.round(1000 - settings.ambilightResponse * 9)}ms`;
    clearInterval(sampleTimer);
    sampleTimer = settings.ambilightEnabled ? setInterval(sampleFrame, Math.round(650 - settings.ambilightResponse * 5)) : 0;
    if (!settings.ambilightEnabled) {
      light.style.opacity = '0';
      light.style.boxShadow = 'none';
    }
    positionOverlays();
    if (settings.ambilightEnabled) sampleFrame();
  }

  function closeClip() {
    if (!clipDialog) return;
    clearInterval(clipMuteTimer);
    clipMuteTimer = 0;
    clipDialog.remove();
    clipDialog = null;
    for (const item of mutedMedia) {
      if (item.element.isConnected) item.element.muted = item.wasMuted;
    }
    mutedMedia = [];
    document.removeEventListener('keydown', onClipKey);
  }

  function onClipKey(event) { if (event.key === 'Escape') closeClip(); }

  function openClip(slug, sourceUrl) {
    closeClip();
    const mutePage = () => {
      for (const element of document.querySelectorAll('video, audio')) {
        if (element.closest('#vortex-clip-dialog')) continue;
        if (!mutedMedia.some(item => item.element === element)) mutedMedia.push({ element, wasMuted: element.muted });
        element.muted = true;
      }
    };
    mutePage();
    clipMuteTimer = setInterval(mutePage, 500);
    const dialog = document.createElement('div');
    dialog.id = 'vortex-clip-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Клип Twitch');
    const embed = new URL('https://clips.twitch.tv/embed');
    embed.searchParams.set('clip', slug);
    embed.searchParams.set('parent', location.hostname);
    embed.searchParams.set('autoplay', 'true');
    dialog.innerHTML = '<div class="vortex-clip-window"><div class="vortex-clip-header"><strong>Клип Twitch</strong><button type="button" class="vortex-clip-close" aria-label="Закрыть клип">✕</button></div><div class="vortex-clip-layout"><div class="vortex-clip-player"></div><aside class="vortex-clip-info"><div class="vortex-clip-title"></div><a target="_blank" rel="noopener noreferrer" class="vortex-clip-source">Открыть клип на Twitch ↗</a></aside></div></div>';
    const frame = document.createElement('iframe');
    frame.src = embed.href;
    frame.title = `Клип ${slug}`;
    frame.allow = 'autoplay; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
    dialog.querySelector('.vortex-clip-player').appendChild(frame);
    dialog.querySelector('.vortex-clip-title').textContent = slug;
    dialog.querySelector('.vortex-clip-source').href = sourceUrl;
    dialog.querySelector('.vortex-clip-close').addEventListener('click', closeClip);
    dialog.addEventListener('mousedown', event => { if (event.target === dialog) closeClip(); });
    document.body.appendChild(dialog);
    dialog.querySelector('.vortex-clip-close').focus();
    clipDialog = dialog;
    document.addEventListener('keydown', onClipKey);
  }

  document.addEventListener('click', event => {
    if (!settings.openClipsOverlay || event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey ||
        location.pathname.startsWith('/popout/')) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    const slug = VortexCore.clipSlug(anchor.href, location.href);
    if (!slug) return;
    event.preventDefault();
    event.stopPropagation();
    openClip(slug, anchor.href);
  }, true);

  chrome.storage.local.get('vortexSettings').then(saved => {
    settings = VortexCore.normalizeSettings(saved.vortexSettings);
    sync();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.vortexSettings?.newValue) {
      settings = VortexCore.normalizeSettings(changes.vortexSettings.newValue);
      sync();
    }
  });
  setInterval(attachLight, 1500);
  attachLight();
  window.addEventListener('pagehide', () => { closeClip(); removeLight(); });
})();
