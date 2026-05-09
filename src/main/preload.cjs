const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onAgentData: (callback) => ipcRenderer.on('agent-data', (_event, data) => callback(data)),
  moveWindow: (dx, dy) => ipcRenderer.send('move-window', { dx, dy }),
});
