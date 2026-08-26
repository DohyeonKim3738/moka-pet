'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bubble', {
  onShow: (fn) => ipcRenderer.on('bubble-show', (_e, d) => fn(d)),
  measured: (h) => ipcRenderer.send('bubble-measured', h)
});
