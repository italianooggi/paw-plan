const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onAgentData: (callback) => ipcRenderer.on('agent-data', (_event, data) => callback(data)),
  onGetState: (callback) => ipcRenderer.on('get-state', (_event, requestId) => callback(requestId)),
  sendStateResponse: (requestId, stateData) => ipcRenderer.send('state-response', { requestId, stateData }),
  dragStart: () => ipcRenderer.send('drag-start'),
  moveWindow: (dx, dy) => ipcRenderer.send('move-window', { dx, dy }),
});
