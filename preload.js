'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  onGaze:   (fn) => ipcRenderer.on('gaze',   (_e, d) => fn(d)),
  onState:  (fn) => ipcRenderer.on('state',  (_e, d) => fn(d)),
  onConfig: (fn) => ipcRenderer.on('config', (_e, d) => fn(d)),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd:   () => ipcRenderer.send('drag-end'),
  hit:    (over) => ipcRenderer.send('hit', !!over),
  menu:      () => ipcRenderer.send('menu'),
  onCare:  (fn) => ipcRenderer.on('care', (_e, d) => fn(d)),
  clean:   (id) => ipcRenderer.send('care-clean', id),
  patted:  ()   => ipcRenderer.send('patted')
});
