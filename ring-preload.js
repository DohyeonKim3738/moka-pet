'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ring', {
  onState: (fn) => ipcRenderer.on('ring-state', (_e, d) => fn(d)),
  act: (what) => ipcRenderer.send('care-act', what),
  hover: (over) => ipcRenderer.send('ring-hover', !!over),
  info: () => ipcRenderer.send('care-open')
});
