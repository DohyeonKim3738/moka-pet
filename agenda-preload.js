'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agenda', {
  onItems: (fn) => ipcRenderer.on('agenda-items', (_e, d) => fn(d)),
  dismiss: (id) => ipcRenderer.send('agenda-dismiss', id),
  measured: (h) => ipcRenderer.send('agenda-measured', h)
});
