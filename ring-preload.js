'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ring', {
  onState: (fn) => ipcRenderer.on('ring-state', (_e, d) => fn(d)),
  act: (what, kind) => ipcRenderer.send('care-act', what, kind),
  size: (w, h) => ipcRenderer.send('ring-size', Math.round(w), Math.round(h)),
  hover: (over) => ipcRenderer.send('ring-hover', !!over),
  info: () => ipcRenderer.send('care-open')
});
