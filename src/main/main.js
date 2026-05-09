const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { WebSocketServer } = require('ws');

const windows = new Map();
const pendingMessages = new Map();
let wss;

function createProjectWindow(projectId, projectName) {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  const offset = windows.size * 30;
  const initialX = screenWidth - 340 - offset;
  const initialY = 100 + offset;

  const win = new BrowserWindow({
    width: 320,
    height: 240,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  pendingMessages.set(projectId, []);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  windows.set(projectId, win);

  win.on('closed', () => {
    windows.delete(projectId);
    pendingMessages.delete(projectId);
  });

  win.webContents.on('did-finish-load', () => {
    if (projectName) {
      win.webContents.send('agent-data', { type: 'INIT_PROJECT', projectId, projectName });
    }
    const queued = pendingMessages.get(projectId) || [];
    for (const msg of queued) {
      win.webContents.send('agent-data', msg);
    }
    pendingMessages.set(projectId, null);
  });

  return win;
}

function sendToWindow(projectId, data) {
  const win = windows.get(projectId);
  if (!win) return;

  const queue = pendingMessages.get(projectId);
  if (queue !== null && queue !== undefined) {
    queue.push(data);
  } else {
    win.webContents.send('agent-data', data);
  }
}

function startWebSocketServer() {
  wss = new WebSocketServer({ port: 9123 });

  wss.on('error', (error) => {
    console.error('WebSocket Server Error:', error);
  });

  wss.on('connection', (ws) => {
    console.log('Agente conectado al widget');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        const projectId = data.projectId || 'default';

        if (!windows.has(projectId)) {
          createProjectWindow(projectId, data.projectName || projectId);
        }

        sendToWindow(projectId, data);
      } catch (e) {
        console.error('Error parseando mensaje del agente:', e);
      }
    });
  });

  console.log('Servidor WebSocket escuchando en el puerto 9123');
}

app.whenReady().then(() => {
  startWebSocketServer();

  app.on('activate', () => {
    if (windows.size === 0) {
      createProjectWindow('default', 'General');
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('move-window', (event, { dx, dy }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  }
});
