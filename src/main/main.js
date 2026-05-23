const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const windows = new Map();
const pendingMessages = new Map();
const projectPaths = new Map();
const MAX_WINDOWS = 8;
let wsClient = null;
let daemonProcess = null;
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

function startGoDaemon() {
  const devPath = path.join(__dirname, '../../cmd/paw-plan-server/paw-plan-server.exe');
  const prodPath = path.join(process.resourcesPath, 'paw-plan-server.exe');

  let binaryPath = devPath;
  if (app.isPackaged) {
    binaryPath = prodPath;
  }

  if (fs.existsSync(binaryPath)) {
    console.log('Spawning Go Daemon from:', binaryPath);
    daemonProcess = spawn(binaryPath, [], {
      detached: false,
      stdio: 'ignore'
    });
  } else {
    console.error('Go Daemon binary not found at:', binaryPath);
  }
}

function ensureProjectWindow(projectId, projectName, projectPath) {
  if (!windows.has(projectId)) {
    if (windows.size >= MAX_WINDOWS) {
      console.warn(`[Security Alert] Max windows limit reached (${MAX_WINDOWS}). Cannot create window for: ${projectId}`);
      return null;
    }
    createProjectWindow(projectId, projectName, projectPath);
  }
  return windows.get(projectId);
}

function connectToGoDaemon() {
  console.log('Connecting to Go Daemon WS...');
  wsClient = new WebSocket('ws://127.0.0.1:9123?client=gui');

  wsClient.on('open', () => {
    console.log('Successfully connected to Go Daemon');
  });

  wsClient.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'GUI_SYNC') {
        if (data.states) {
          for (const p of data.states) {
            ensureProjectWindow(p.projectId, p.projectName, p.projectPath);
            setTimeout(() => {
              sendToWindow(p.projectId, {
                type: 'RESTORE_STATE',
                state: {
                  current: {
                    vision: p.vision,
                    tasks: p.plan
                  }
                }
              });
            }, 500);
          }
        }
      } else {
        const projectId = data.projectId || 'default';
        ensureProjectWindow(projectId, data.projectName || projectId, data.projectPath || null);
        sendToWindow(projectId, data);
      }
    } catch (e) {
      console.error('Error parsing daemon message:', e);
    }
  });

  wsClient.on('close', () => {
    console.log('Go Daemon connection closed, retrying in 2 seconds...');
    setTimeout(connectToGoDaemon, 2000);
  });

  wsClient.on('error', (err) => {
    console.error('Go Daemon WS error:', err.message);
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.pawplan.widget');
  createTray();
  startGoDaemon();
  // Give Go Daemon 500ms to boot up before connecting
  setTimeout(connectToGoDaemon, 500);

  app.on('activate', () => {
    if (windows.size === 0) {
      createProjectWindow('default', 'General');
    }
  });
});

app.on('window-all-closed', () => {
  // intencional: la app sigue viva en el system tray
});

app.on('will-quit', () => {
  if (daemonProcess) {
    console.log('Killing Go Daemon...');
    daemonProcess.kill();
  }
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
