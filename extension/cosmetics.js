/* 7TV cosmetics for Twitch chat. Only public, selected user cosmetics are used. */
(function (root) {
  'use strict';
  const cache = new Map();
  const pending = new Set();
  const queue = [];
  let active = 0;
  const LIMIT = 120;
  const TTL = 15 * 60 * 1000;

  function validLogin(value) { return /^[a-z0-9_]{1,25}$/.test(value); }
  function color(value) {
    if (!Number.isInteger(value)) return '';
    const number = value >>> 0;
    return `rgba(${(number >>> 24) & 255}, ${(number >>> 16) & 255}, ${(number >>> 8) & 255}, ${((number & 255) / 255).toFixed(3)})`;
  }
  function cdnUrl(value) {
    try {
      const url = new URL(value?.startsWith('//') ? `https:${value}` : value);
      return url.protocol === 'https:' && url.hostname === 'cdn.7tv.app' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }
  function badgeUrl(badge) {
    const base = cdnUrl(badge?.host?.url);
    const files = badge?.host?.files || [];
    const file = ['2x.webp', '1x.webp', '3x.webp'].find(name => files.some(item => item?.name === name));
    return base && file ? `${base.replace(/\/$/, '')}/${file}` : '';
  }
  function paintStyle(paint) {
    if (!paint) return null;
    const layers = Array.isArray(paint.gradients) && paint.gradients.length ? paint.gradients : [paint];
    const backgroundImage = layers.slice(0, 4).map(layer => {
      if (layer.function === 'URL') {
        const url = cdnUrl(layer.image_url);
        return url ? `url("${url}")` : '';
      }
      if (!['LINEAR_GRADIENT', 'RADIAL_GRADIENT'].includes(layer.function)) return '';
      const stops = (layer.stops || []).slice(0, 16).map(stop => {
        const cssColor = color(stop.color);
        return cssColor && Number.isFinite(stop.at) ? `${cssColor} ${Math.max(0, Math.min(100, stop.at * 100))}%` : '';
      }).filter(Boolean);
      if (stops.length < 2) return '';
      return layer.function === 'LINEAR_GRADIENT'
        ? `${layer.repeat ? 'repeating-' : ''}linear-gradient(${Math.max(-360, Math.min(360, Number(layer.angle) || 0))}deg, ${stops.join(', ')})`
        : `${layer.repeat ? 'repeating-' : ''}radial-gradient(circle, ${stops.join(', ')})`;
    }).filter(Boolean).join(', ');
    const shadow = (paint.shadows || []).slice(0, 2).map(item => {
      const cssColor = color(item.color);
      if (!cssColor) return '';
      const x = Math.max(-10, Math.min(10, Number(item.x_offset) || 0));
      const y = Math.max(-10, Math.min(10, Number(item.y_offset) || 0));
      const radius = Math.max(0, Math.min(10, Number(item.radius) || 0));
      return `${x}px ${y}px ${radius}px ${cssColor}`;
    }).filter(Boolean).join(', ');
    const stroke = paint.text?.stroke;
    return { backgroundImage, color: color(paint.color), textShadow: shadow, name: paint.name || '7TV Paint',
      fontWeight: Number.isFinite(paint.text?.weight) ? String(Math.max(100, Math.min(900, paint.text.weight * 100))) : '',
      textTransform: ['uppercase', 'lowercase'].includes(paint.text?.transform) ? paint.text.transform : '',
      stroke: stroke && color(stroke.color) && Number.isFinite(stroke.width)
        ? `${Math.max(0, Math.min(2, stroke.width))}px ${color(stroke.color)}` : '' };
  }
  function normalizeUser(result, login) {
    const user = result?.users?.find(item => item.connections?.some(connection =>
      connection.platform === 'TWITCH' && connection.username?.toLowerCase() === login));
    if (!user) return null;
    return { badge: user.style?.badge || null, paint: user.style?.paint || null };
  }
  function create(request, onUpdate) {
    function pump() {
      while (active < 2 && queue.length) {
        const login = queue.shift();
        active++;
        Promise.resolve().then(() => request(login)).then(result => {
          const data = normalizeUser(result, login);
          cache.set(login, { data, at: Date.now() });
          if (cache.size > LIMIT) cache.delete(cache.keys().next().value);
          onUpdate(login, data);
        }).catch(() => {
          cache.set(login, { data: null, at: Date.now() - TTL + 60000 });
        }).finally(() => { active--; pending.delete(login); pump(); });
      }
    }
    return {
      get(rawLogin) {
        const login = String(rawLogin || '').toLowerCase();
        if (!validLogin(login)) return null;
        const hit = cache.get(login);
        if (hit && Date.now() - hit.at < TTL) return hit.data;
        if (!pending.has(login) && pending.size < LIMIT) { pending.add(login); queue.push(login); pump(); }
        return null;
      }
    };
  }
  const api = { create, color, cdnUrl, badgeUrl, paintStyle, normalizeUser };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VortexCosmetics = api;
})(globalThis);
