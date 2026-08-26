'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('care', {
  onState: (fn) => ipcRenderer.on('care-state', (_e, d) => fn(d)),
  act: (what) => ipcRenderer.send('care-act', what),
  ready: () => ipcRenderer.send('care-ready'),
  setChat: (on) => ipcRenderer.send('chat-set', !!on),
  restart: () => ipcRenderer.send('care-restart'),
  setNight: (on) => ipcRenderer.send('night-set', !!on),
  pick: (key) => ipcRenderer.send('care-pick', key),
  mate: (id) => ipcRenderer.send('care-mate', id),
  game: (won) => ipcRenderer.send('care-game', !!won),
  rename: (name) => ipcRenderer.send('care-rename', name),
  setAway: (on) => ipcRenderer.send('away-set', !!on),
  trick: (name) => ipcRenderer.send('care-trick', name),
  setZoom: (on) => ipcRenderer.send('zoom-set', !!on)
});
