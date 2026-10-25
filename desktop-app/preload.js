const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openUpdateReleases: () => ipcRenderer.invoke('open-update-releases'),
  onUpdateCheckResult: (callback) => ipcRenderer.on('update-check-result', (_event, result) => callback(result)),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  toggleAlwaysOnTop: (state) => ipcRenderer.send('toggle-always-on-top', state),
  setOpacity: (opacity) => ipcRenderer.send('set-window-opacity', opacity),
  broadcastChatMessage: (msg) => ipcRenderer.send('broadcast-chat-message', msg),
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on('always-on-top-changed', (event, val) => callback(val));
  },
  onObsServerError: (callback) => {
    ipcRenderer.on('obs-server-error', (event, code) => callback(code));
  },
  getTwitchAuth: () => ipcRenderer.invoke('get-twitch-auth'),
  startTwitchLogin: (clientId) => ipcRenderer.invoke('start-twitch-login', clientId),
  logoutTwitch: () => ipcRenderer.invoke('logout-twitch'),
  sendTwitchMessage: (channel, message) => ipcRenderer.invoke('send-twitch-message', channel, message),
  fetchEmoteProvider: (url) => ipcRenderer.invoke('fetch-emote-provider', url),
  copyText: (value) => ipcRenderer.invoke('copy-text', value),
  onTwitchAuthChanged: (callback) => ipcRenderer.on('auth-changed', (_event, status) => callback(status)),
  onTwitchAuthError: (callback) => ipcRenderer.on('auth-error', (_event, message) => callback(message))
});
