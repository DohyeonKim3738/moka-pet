'use strict';

/* 곁에 선 아이의 창.
 *
 * 펫 창(preload.js)과 같은 화면(renderer/index.html)을 쓰지만 채널이 다르다.
 * 채널을 나누지 않으면 곁의 아이를 쓰다듬어도 '지금 돌보는 아이'가
 * 쓰다듬어진다 — main 쪽 핸들러들이 보낸 창을 구분하지 않기 때문이다.
 * 이름을 나누는 편이 sender 를 따지는 것보다 읽기 쉽고 틀리기 어렵다. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  onGaze:   (fn) => ipcRenderer.on('gaze',   (_e, d) => fn(d)),
  onState:  (fn) => ipcRenderer.on('state',  (_e, d, kind) => fn(d, kind)),
  onConfig: (fn) => ipcRenderer.on('config', (_e, d) => fn(d)),
  onCare:   (fn) => ipcRenderer.on('care',   (_e, d) => fn(d)),
  dragStart: () => ipcRenderer.send('buddy-drag-start'),
  dragEnd:   () => ipcRenderer.send('buddy-drag-end'),
  hit:    (over) => ipcRenderer.send('buddy-hit', !!over),
  menu:      () => ipcRenderer.send('buddy-menu'),
  clean:     ()  => {},          // 곁의 아이는 치울 것이 없다
  patted:    ()  => ipcRenderer.send('buddy-patted')
});
