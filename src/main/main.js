const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const windows = new Map();
const pendingMessages = new Map();
const projectPaths = new Map();
const MAX_WINDOWS = 8;
let wss;
let tray = null;

function readProjectState(projectPath) {
  try {
    const file = path.join(projectPath, '.paw-plan', 'state.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return null;
}

function createProjectWindow(projectId, projectName, projectPath) {
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
    icon: path.join(__dirname, '../assets/gato_solo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  pendingMessages.set(projectId, []);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  windows.set(projectId, win);
  if (projectPath) projectPaths.set(projectId, projectPath);

  win.on('closed', () => {
    windows.delete(projectId);
    pendingMessages.delete(projectId);
  });

  win.webContents.on('did-finish-load', () => {
    if (projectName) {
      win.webContents.send('agent-data', { type: 'INIT_PROJECT', projectId, projectName });
    }
    const savedState = projectPath ? readProjectState(projectPath) : null;
    if (savedState) {
      win.webContents.send('agent-data', { type: 'RESTORE_STATE', state: savedState });
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

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/gato_solo.png'));
  tray = new Tray(icon);
  tray.setToolTip('Paw Plan Widget — esperando agentes...');

  const buildMenu = () => {
    const autostart = app.getLoginItemSettings().openAtLogin;
    return Menu.buildFromTemplate([
      { label: 'Paw Plan Widget', enabled: false },
      { label: 'Esperando conexión de agente...', enabled: false },
      { type: 'separator' },
      {
        label: 'Iniciar con Windows',
        type: 'checkbox',
        checked: autostart,
        click: () => {
          app.setLoginItemSettings({ openAtLogin: !autostart });
          tray.setContextMenu(buildMenu());
        },
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => app.quit(),
      },
    ]);
  };

  tray.setContextMenu(buildMenu());
}

function startWebSocketServer() {
  wss = new WebSocketServer({ port: 9123, host: '127.0.0.1' });

  wss.on('error', (error) => {
    console.error('WebSocket Server Error:', error);
  });

  wss.on('connection', (ws) => {
    console.log('Agente conectado al widget');

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        const projectId = data.projectId || 'default';

        if (data.type === 'GET_STATE') {
          const win = windows.get(projectId);
          if (!win) { ws.send(JSON.stringify({ type: 'STATE', error: 'no window for project' })); return; }
          const requestId = `${Date.now()}-${Math.random()}`;
          const stateData = await new Promise((resolve) => {
            pendingStateRequests.set(requestId, resolve);
            win.webContents.send('get-state', requestId);
            setTimeout(() => { pendingStateRequests.delete(requestId); resolve(null); }, 3000);
          });
          ws.send(JSON.stringify({ type: 'STATE', ...stateData }));
          return;
        }

        if (!windows.has(projectId)) {
          if (windows.size >= MAX_WINDOWS) {
            console.warn(`[Security Alert] Max windows limit reached (${MAX_WINDOWS}). Connection rejected for projectId: ${projectId}`);
            return;
          }
          createProjectWindow(projectId, data.projectName || projectId, data.projectPath || null);
        }

        sendToWindow(projectId, data);
      } catch (e) {
        console.error('Error parseando mensaje del agente:', e);
      }
    });
  });

  console.log('Servidor WebSocket escuchando en el puerto 9123 en localhost');
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.pawplan.widget');
  createTray();
  startWebSocketServer();

  app.on('activate', () => {
    if (windows.size === 0) {
      createProjectWindow('default', 'General');
    }
  });
});

// Con tray activo, no cerramos la app cuando se cierran todas las ventanas
app.on('window-all-closed', () => {
  // intencional: la app sigue viva en el system tray
});

const pendingStateRequests = new Map();

ipcMain.on('state-response', (_event, { requestId, stateData }) => {
  const resolve = pendingStateRequests.get(requestId);
  if (resolve) { resolve(stateData); pendingStateRequests.delete(requestId); }
});

const dragOrigin = new WeakMap();

ipcMain.on('drag-start', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) dragOrigin.set(win, win.getPosition());
});

ipcMain.on('move-window', (event, { dx, dy }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const origin = dragOrigin.get(win);
  if (!origin) return;
  win.setPosition(Math.round(origin[0] + dx), Math.round(origin[1] + dy));
});
