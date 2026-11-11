/* Shared desktop reconnect timing. Pure functions for predictable tests. */
(function (root) {
  'use strict';
  const MAX_BACKOFF_MS = 30000;
  const CONNECT_TIMEOUT_MS = 15000;
  const IDLE_TIMEOUT_MS = 120000;

  function reconnectDelay(attempt, random = Math.random) {
    const count = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
    const base = Math.min(MAX_BACKOFF_MS, 1000 * (2 ** Math.min(count, 6)));
    const sample = Math.max(0, Math.min(1, Number(random()) || 0));
    return Math.round(base * (0.8 + sample * 0.4));
  }
  const api = { reconnectDelay, CONNECT_TIMEOUT_MS, IDLE_TIMEOUT_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VortexIRC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
