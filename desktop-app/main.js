const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');

let mainWindow = null;
let tray = null;
let isAlwaysOnTop = false;

// ===================================================================
// 1. Встроенный сервер для OBS Studio (localhost:5222)
// ===================================================================
const serverApp = express();
serverApp.use(cors());
serverApp.use(express.json());

const server = http.createServer(serverApp);
const wss = new WebSocketServer({ server });

// Раздача страницы оверлея для OBS Browser Source
serverApp.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'overlay.html'));
});

// Проверка статуса сервера
serverApp.get('/health', (req, res) => {
  res.json({ status: 'online', service: 'VortexChat OBS Overlay Bridge by PFT Studio', port: 5222 });
});

// WebSocket подключение браузерного источника OBS
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    // Ретрансляция всем активным клиентам OBS
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data.toString());
      }
    });
  });
});

server.listen(5222, '127.0.0.1', () => {
  console.log('[OBS Server] Локальный сервер запущен: http://127.0.0.1:5222/overlay');
});

// ===================================================================
// 2. Создание главного окна приложения
// ===================================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 340,
    minHeight: 440,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      // Сворачивать в системный трей Windows при закрытии окна VortexChat
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

// ===================================================================
// 3. Системный трей Windows (System Tray)
// ===================================================================
function createTray() {
  // Для трея используем прозрачную заглушку или icon.ico при наличии
  tray = new Tray(path.join(__dirname, 'assets', 'icon.ico'));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показать VortexChat',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Поверх всех окон',
      type: 'checkbox',
      checked: isAlwaysOnTop,
      click: (item) => {
        isAlwaysOnTop = item.checked;
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(isAlwaysOnTop);
          mainWindow.webContents.send('always-on-top-changed', isAlwaysOnTop);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('VortexChat by PFT Studio - Twitch Desktop Client');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// ===================================================================
// 4. IPC Обработчики команд из UI
// ===================================================================
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('toggle-always-on-top', (event, state) => {
  isAlwaysOnTop = typeof state === 'boolean' ? state : !isAlwaysOnTop;
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(isAlwaysOnTop);
  }
  event.reply('always-on-top-changed', isAlwaysOnTop);
});

ipcMain.on('set-window-opacity', (event, opacity) => {
  if (mainWindow) {
    mainWindow.setOpacity(Math.max(0.3, Math.min(1.0, opacity)));
  }
});

ipcMain.on('broadcast-chat-message', (event, messageData) => {
  const payload = typeof messageData === 'string' ? messageData : JSON.stringify(messageData);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
});

app.whenReady().then(() => {
  createWindow();
  try {
    createTray();
  } catch (e) {
    console.warn('Трей не инициализирован (файл иконки отсутствует в assets).');
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
