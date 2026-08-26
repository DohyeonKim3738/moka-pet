'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  onConfig: (fn) => ipcRenderer.on('settings-config', (_e, d) => fn(d)),
  setPct: (pct) => ipcRenderer.send('set-pct', pct),
  ready: () => ipcRenderer.send('settings-ready'),

  googleStatus:    ()             => ipcRenderer.invoke('google:status'),
  googleSetClient: (id, secret)   => ipcRenderer.invoke('google:set-client', id, secret),
  googleSignIn:    ()             => ipcRenderer.invoke('google:signin'),
  googleSignOut:   ()             => ipcRenderer.invoke('google:signout'),
  calSet:          (patch)        => ipcRenderer.invoke('cal:set', patch)
});
