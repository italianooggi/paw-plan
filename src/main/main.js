import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapa de ventanas por projectId
const windows = new Map();
// Buffer de mensajes pendientes hasta que la ventana termine de cargar
const pendingMessages = new Map();
let wss;

function createProjectWindow(projectId, projectName) {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  
  // Posicionamiento en cascada para que no se tapen
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Inicializar buffer de mensajes pendientes
  pendingMessages.set(projectId, []);

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // Guardar en el mapa
  windows.set(projectId, win);

  win.on('closed', () => {
    windows.delete(projectId);
    pendingMessages.delete(projectId);
  });

  // Una vez cargado, flush de INIT + mensajes pendientes
  win.webContents.on('did-finish-load', () => {
    if (projectName) {
      win.webContents.send('agent-data', { type: 'INIT_PROJECT', projectId, projectName });
    }
    // Flush mensajes que llegaron antes de que la página cargara
    const queued = pendingMessages.get(projectId) || [];
    for (const msg of queued) {
      win.webContents.send('agent-data', msg);
    }
    pendingMessages.set(projectId, null); // null = ready, no more buffering
  });

  return win;
}

function sendToWindow(projectId, data) {
  const win = windows.get(projectId);
  if (!win) return;

  const queue = pendingMessages.get(projectId);
  if (queue !== null && queue !== undefined) {
    // Ventana existe pero no terminó de cargar, encolar
    queue.push(data);
  } else {
    // Ventana lista, enviar directo
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
        
        // Si no existe la ventana para este proyecto, la creamos
        if (!windows.has(projectId)) {
          createProjectWindow(projectId, data.projectName || projectId);
        }

        // Enviar (o encolar si la ventana no cargó todavía)
        sendToWindow(projectId, data);
        
      } catch (e) {
        console.error('Error parseando mensaje del agente:', e);
      }
    });
  });

  console.log('Servidor WebSocket escuchando en el puerto 9123');
}

app.whenReady().then(() => {
  // Ya no creamos la ventana por defecto aquí, se creará al recibir el primer mensaje
  startWebSocketServer();

  app.on('activate', () => {
    if (windows.size === 0) {
      // Si el usuario activa el app manualmente, podemos crear una por defecto
      createProjectWindow('default', 'General');
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Manejo de movimiento para múltiples ventanas
ipcMain.on('move-window', (event, { dx, dy }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  }
});
