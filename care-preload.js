'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('care', {
  onState: (fn) => ipcRenderer.on('care-state', (_e, d) => fn(d)),
  act: (what, kind) => ipcRenderer.send('care-act', what, kind),
  ready: () => ipcRenderer.send('care-ready'),
  setChat: (on) => ipcRenderer.send('chat-set', !!on),
  restart: () => ipcRenderer.send('care-restart'),
  setNight: (on) => ipcRenderer.send('night-set', !!on),
  pick: (key) => ipcRenderer.send('care-pick', key),
  mate: (id) => ipcRenderer.send('care-mate', id),
  game: (won) => ipcRenderer.send('care-game', !!won),
  rename: (name) => ipcRenderer.send('care-rename', name),
  setAway: (on) => ipcRenderer.send('away-set', !!on),
  setStretch: (on) => ipcRenderer.send('stretch-set', !!on),
  trick: (name) => ipcRenderer.send('care-trick', name),
  setZoom: (on) => ipcRenderer.send('zoom-set', !!on),
  setBadge: (id) => ipcRenderer.send('badge-set', id),
  setHome: (on) => ipcRenderer.send('care-home', !!on),
  setRoom: (slot, value) => ipcRenderer.send('care-room', slot, value),
  setProp: (slot, value) => ipcRenderer.send('care-prop', slot, value),
  clearProps: () => ipcRenderer.send('care-props-clear'),
  setFur: (hex) => ipcRenderer.send('care-fur', hex),
  setEyes: (v) => ipcRenderer.send('care-eyes', v),

  /* 모카펫 설정 창을 없애고 이리로 합쳤다 — 이름이 같은 「설정」이 두 군데
     있는데 나뉜 기준이 없었다(둘 다 앱 전체 설정이다). */
  onTab: (fn) => ipcRenderer.on('care-tab', (_e, t) => fn(t)),
  setPct: (pct) => ipcRenderer.send('set-pct', pct),
  googleStatus:    ()           => ipcRenderer.invoke('google:status'),
  googleSetClient: (id, secret) => ipcRenderer.invoke('google:set-client', id, secret),
  googleSignIn:    ()           => ipcRenderer.invoke('google:signin'),
  googleSignOut:   ()           => ipcRenderer.invoke('google:signout'),
  calSet:          (patch)      => ipcRenderer.invoke('cal:set', patch)
});
