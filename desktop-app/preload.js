const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
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
  }
});
