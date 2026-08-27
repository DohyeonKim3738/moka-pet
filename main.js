'use strict';

const { app, BrowserWindow, screen, Tray, Menu, ipcMain, nativeImage, shell,
        Notification, dialog, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const googleAuth = require('./google-auth');
const calendar = require('./calendar');
const updater = require('./updater');
const care = require('./care');
const chatter = require('./chatter');
const missions = require('./missions');
const family = require('./family');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

/* The stage is a 56 x 60 dot grid (renderer/index.html). Sizing the
   window to a whole number of dots keeps every sprite edge on a whole
   pixel — a fractional dot size is what makes pixel art look blurred,
   so the size control steps through dot sizes rather than percentages. */
const STAGE_W = 56;
const STAGE_H = 60;
/* A room needs somewhere to put the things beside the pet, so turning it
   on widens the stage to 96 dots — the pet keeps the middle 48 and gets
   24 spare on each side. renderer/room.js draws in that wider space. */
const STAGE_W_HOME = 96;
function stageW() { return cfg && cfg.home && cfg.home.enabled ? STAGE_W_HOME : STAGE_W; }
const DOT_BASE = 6;      // dot size at 100% -> 336 x 360
const PCT_MIN = 10;
const PCT_MAX = 200;
const PCT_BASE = 100;

function clampPct(p) {
  if (!Number.isFinite(p)) return PCT_BASE;
  return Math.max(PCT_MIN, Math.min(PCT_MAX, Math.round(p)));
}

/* ------------------------------------------------------------------ *
 * species metadata — kept in sync with renderer/species.js
 * ------------------------------------------------------------------ */
const SPECIES = [
  {
    key: 'capybara', label: '카피바라', name: '모카', prop: 'yuzu', fur: '#B98052', belly: '#EBD3A9',
    furs: [['모카 브라운', '#B98052'], ['다크 초코', '#8E6237'], ['모래', '#CFA97D'], ['잿빛', '#8B867A'], ['이끼', '#77937F'], ['먹', '#4A463F']]
  },
  {
    key: 'cat', label: '고양이', name: '나비', prop: 'leaf', fur: '#8E8A85', belly: '#F3EBE0',
    furs: [['잿빛', '#8E8A85'], ['치즈', '#D79A50'], ['까망', '#4A4642'], ['하양', '#D9D3C9'], ['갈색 태비', '#9B7350'], ['블루', '#7E8C97']]
  },
  {
    key: 'otter', label: '수달', name: '수리', prop: 'leaf', fur: '#7E5C42', belly: '#E3CCA6',
    furs: [['강물 갈색', '#7E5C42'], ['모래', '#A98460'], ['짙은 밤', '#5C4130'], ['잿빛', '#7C7A72'], ['적갈', '#96543C'], ['크림', '#C3A582']]
  },
  {
    key: 'crab', label: '게', name: '집게', prop: 'star', fur: '#C9492F', belly: '#F3CBAE',
    furs: [['선홍', '#C9492F'], ['주황', '#E07A34'], ['진홍', '#9E2F22'], ['자주', '#8E4468'], ['청록', '#2F7F86'], ['먹장', '#4B403C']]
  },
  {
    key: 'shiba', label: '시바견', name: '하루', prop: 'none', fur: '#DB9A4E', belly: '#F8EFE1',
    furs: [['적시바', '#DB9A4E'], ['참깨', '#A8845E'], ['크림', '#E7CFA6'], ['흑시바', '#4E453D'], ['여우', '#C8712F'], ['백시바', '#DED5C6']]
  },
  {
    key: 'dodam', label: '말티푸', name: '도담이', prop: 'none', fur: '#F7F4ED', belly: '#FFFFFF',
    furs: [['순백', '#F7F4ED'], ['아이보리', '#E3D6C2'], ['살구', '#F0D9C4'], ['연회색', '#D8D3CC'], ['샴페인', '#E8D6B8'], ['먹', '#4A463F']]
  },
  {
    key: 'cream', label: '푸들', name: '크림이', prop: 'none', fur: '#E5CDA0', belly: '#F8EFE0',
    furs: [['크림', '#E5CDA0'], ['살구', '#E7C39A'], ['베이지', '#D8BE95'], ['카페라떼', '#C0A177'], ['순백', '#F7F4ED'], ['먹', '#4A463F']]
  },
  {
    key: 'kong', label: '흑푸들', name: '콩이', prop: 'none', fur: '#443E3B', belly: '#8A7F78',
    furs: [['먹빛', '#443E3B'], ['차콜', '#5A524E'], ['잿빛', '#7C7A72'], ['초코', '#5C4130'], ['은빛', '#9A968E'], ['순백', '#F7F4ED']]
  },
  {
    key: 'danchu', label: '진도믹스', name: '단추', prop: 'none', fur: '#A85A2A', belly: '#D9A277',
    furs: [['적갈', '#A85A2A'], ['황토', '#C1793C'], ['밤색', '#8A4820'], ['모래', '#CFA97D'], ['먹', '#4A463F'], ['잿빛', '#8B867A']]
  }
];
const SP = {};
SPECIES.forEach(s => { SP[s.key] = s; });

/* Pets are keyed by id, not by species. For the nine originals the id is
   the species key; a pet born from two others gets its own id and carries
   the species it takes after. That is what lets the family grow past the
   nine drawings we have. */
function blankPet(key) {
  const s = SP[key];
  return {
    name: s.name, species: key, fur: s.fur, belly: s.belly, eyes: 'basic',
    props: { head: s.prop || 'none', eyes: 'none', hand: 'none', body: 'none' },
    room: { back: 'none', floor: 'none', left: 'none', right: 'none' },
    mate: null,
    care: care.blank()
  };
}

function petIds() { return Object.keys(cfg.pets); }
function speciesOf(id) {
  const p = cfg.pets[id];
  return SP[(p && p.species) || id] || SPECIES[0];
}

/* ------------------------------------------------------------------ *
 * config
 * ------------------------------------------------------------------ */
/* 오래 앉아 있으면 한 번 부른다. 기본은 꺼 둔다 — 잘못 만들면 가장
   성가신 기능이라, 켜는 사람만 켜게 한다. */
const STRETCH_DEFAULT = { enabled: false, minutes: 50 };

function defaults() {
  const pets = {};
  SPECIES.forEach(s => { pets[s.key] = blankPet(s.key); });
  return {
    version: 9,
    eggKey: null,
    nextKid: 1,
    night: { enabled: true, from: 23, to: 7 },
    away: { enabled: true, minutes: 20 },
    stretch: Object.assign({}, STRETCH_DEFAULT),
    taught: {},
    zoom: { enabled: true },
    update: { enabled: true, repo: 'DohyeonKim3738/moka-pet', skip: '' },
    missions: { done: [], badge: '' },
    home: { enabled: false },
    species: 'capybara',
    pets,
    pct: PCT_BASE,
    alwaysOnTop: true,
    autoBehave: true,
    cal: { enabled: true, leadMinutes: 10, briefEnabled: true, briefAt: '09:00' },
    chat: { enabled: true, greetedOn: '' },
    seen: {},
    launchAtLogin: false,
    x: null,
    y: null
  };
}

let cfg = defaults();

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

/* Which egg you are handed, when nobody has been handed one yet. A
   first run must draw at random too — defaults alone always produced the
   capybara. */
function seedFirstEgg() {
  const keys = SPECIES.map((s) => s.key);
  cfg.eggKey = keys[Math.floor(Math.random() * keys.length)];
  cfg.species = cfg.eggKey;
}

/* Something the user has to be told about at startup, once the windows
   exist. Losing a pet quietly is worse than losing it loudly. */
let startupNotice = null;

function readConfigFile() {
  const target = configPath();
  const tried = [];
  for (const f of [target, target + '.bak']) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); }
    catch (e) { continue; }              // not there at all — that is fine
    try {
      const raw = JSON.parse(text);
      if (raw && typeof raw === 'object') return { raw, restored: f !== target };
    } catch (e) { /* fall through to the backup */ }
    tried.push(f);
  }
  return { raw: null, damaged: tried.length > 0 };
}

function loadConfig() {
  const read = readConfigFile();
  const raw = read.raw;
  if (read.restored) {
    startupNotice = { head: '설정을 되살렸어요',
                      lines: ['저장 파일이 손상돼 백업에서 복구했습니다'] };
  } else if (read.damaged) {
    startupNotice = { head: '진행을 읽지 못했어요',
                      lines: ['저장 파일이 손상돼 새로 시작합니다'] };
  }
  if (!raw) { seedFirstEgg(); return; }

  // v1 configs were a single flat capybara — carry it over
  if (!raw.version && raw.fur) {
    cfg.pets.capybara = {
      name: raw.name || SP.capybara.name,
      fur: raw.fur, belly: raw.belly,
      prop: raw.prop || 'yuzu', eyes: raw.eyes || 'basic'
    };
  } else if (raw.pets && typeof raw.pets === 'object') {
    SPECIES.forEach(s => {
      const p = raw.pets[s.key];
      if (p && typeof p === 'object') Object.assign(cfg.pets[s.key], p);
    });
  }
  // v6 and earlier stored a single `prop`; it becomes the head slot
  SPECIES.forEach(s => {
    const pet = cfg.pets[s.key];
    if (!pet.props || typeof pet.props !== 'object') pet.props = {};
    const saved = raw.pets && raw.pets[s.key];
    if (saved && typeof saved.prop === 'string' && !saved.props) pet.props.head = saved.prop;
    ['head', 'eyes', 'hand', 'body'].forEach(k => {
      if (typeof pet.props[k] !== 'string') pet.props[k] = 'none';
    });
    // the hand-held 가족 액자 became a room item; a save still wearing it
    // would point at an accessory that no longer exists
    if (pet.props.hand === 'photo') pet.props.hand = 'none';
    delete pet.prop;
    pet.care = care.normalize(pet.care);
  });

  // pets saved before ids existed are keyed by species; anything else in
  // the file is a child, and comes across as it is
  if (raw.pets && typeof raw.pets === 'object') {
    Object.keys(raw.pets).forEach((id) => {
      if (cfg.pets[id]) return;
      const p = raw.pets[id];
      if (!p || typeof p !== 'object' || !SP[p.species]) return;
      cfg.pets[id] = Object.assign(blankPet(p.species), p);
      cfg.pets[id].care = care.normalize(cfg.pets[id].care);
    });
  }
  petIds().forEach((id) => {
    if (!SP[cfg.pets[id].species]) cfg.pets[id].species = SP[id] ? id : SPECIES[0].key;
    const pet = cfg.pets[id];
    if (!pet.room || typeof pet.room !== 'object') pet.room = {};
    // Saves made before pairs were kept: read the partner back off the
    // children. Has to run here, after every pet — including the children
    // — is loaded, or there is nothing to read it from.
    if (typeof pet.mate !== 'string' || !cfg.pets[pet.mate]) {
      pet.mate = null;
      petIds().some((kid) => {
        const par = cfg.pets[kid].parents;
        if (!Array.isArray(par) || par.indexOf(id) < 0) return false;
        pet.mate = par.find((k) => k !== id && cfg.pets[k]) || null;
        return !!pet.mate;
      });
    }
    ['back', 'floor', 'left', 'right'].forEach(k => {
      if (typeof pet.room[k] !== 'string') pet.room[k] = 'none';
    });
  });
  if (cfg.pets[raw.species]) cfg.species = raw.species;
  if (raw.eggKey && cfg.pets[raw.eggKey]) cfg.eggKey = raw.eggKey;
  if (Number.isFinite(raw.nextKid)) cfg.nextKid = raw.nextKid;

  // v9 introduced eggs and a much slower growth curve. An age earned
  // under the old curve means something different now — a pet was three
  // days old and already past being a baby — so everyone goes back in
  // the shell, once, and which egg you are handed is a fresh draw.
  if ((raw.version || 0) < 9) {
    petIds().forEach((id) => { cfg.pets[id].care = care.blank(); });
    seedFirstEgg();
  }
  // an egg that is no longer an egg is not the egg you are holding
  if (cfg.eggKey && !cfg.pets[cfg.eggKey].care.egg) cfg.eggKey = null;
  ['alwaysOnTop', 'autoBehave', 'launchAtLogin', 'x', 'y'].forEach(k => {
    if (raw[k] !== undefined) cfg[k] = raw[k];
  });
  // v2 stored a free multiplier; v3+ stores the dot size it implied, so
  // old configs carry over instead of resetting to default
  // the shiba was called 콩이 until a real 콩이 joined the roster; a saved
  // v1/v2 config still carries the old name, so retire it on the way in
  if ((raw.version || 0) < 4 && cfg.pets.shiba && cfg.pets.shiba.name === '콩이') {
    cfg.pets.shiba.name = SP.shiba.name;
  }
  if (raw.cal && typeof raw.cal === 'object') Object.assign(cfg.cal, raw.cal);
  if (raw.chat && typeof raw.chat === 'object') Object.assign(cfg.chat, raw.chat);
  if (raw.night && typeof raw.night === 'object') Object.assign(cfg.night, raw.night);
  if (raw.away && typeof raw.away === 'object') Object.assign(cfg.away, raw.away);
  // ★새 저장본 키를 복원부에 넣는 걸 빠뜨리면 켤 때마다 초기화된다
  if (raw.stretch && typeof raw.stretch === 'object') Object.assign(cfg.stretch, raw.stretch);
  if (raw.taught && typeof raw.taught === 'object') cfg.taught = Object.assign({}, raw.taught);
  if (raw.zoom && typeof raw.zoom === 'object') Object.assign(cfg.zoom, raw.zoom);
  if (raw.home && typeof raw.home === 'object') Object.assign(cfg.home, raw.home);
  if (raw.update && typeof raw.update === 'object') Object.assign(cfg.update, raw.update);
  if (raw.missions && Array.isArray(raw.missions.done)) cfg.missions.done = raw.missions.done.slice();
  if (raw.missions && typeof raw.missions.badge === 'string'
      && cfg.missions.done.indexOf(raw.missions.badge) >= 0) {
    cfg.missions.badge = raw.missions.badge;
  }
  if (raw.seen && typeof raw.seen === 'object') cfg.seen = calendar.prune(raw.seen);
  if (Number.isFinite(raw.pct)) cfg.pct = clampPct(raw.pct);
  else if (Number.isFinite(raw.dot)) cfg.pct = clampPct(raw.dot / DOT_BASE * 100);
  else if (Number.isFinite(raw.scale)) cfg.pct = clampPct(raw.scale * 100);
}

/* Write to a temporary file and rename it into place. A rename is
   atomic: the config is either the old one or the new one, never half of
   each. Writing straight to the file meant a crash mid-write left it
   truncated, and a truncated config reads as "no config at all" — which
   silently threw away months of raising. */
let skipSaveOnQuit = false;

function saveConfig() {
  if (skipSaveOnQuit) return;      // an import is replacing the file; do not fight it
  const target = configPath();
  const tmp = target + '.tmp';
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* nothing to clean up */ }
  }
}

/* The last config that was known to parse, kept from startup. The atomic
   write above makes a torn file impossible, so this is the belt to that
   pair of braces: a disk that went bad, or a file someone edited by
   hand. */
function keepBackup() {
  try { fs.copyFileSync(configPath(), configPath() + '.bak'); }
  catch (e) { /* first run, or an unwritable folder */ }
}

function currentPet() { return cfg.pets[cfg.species]; }
function currentSpecies() { return speciesOf(cfg.species); }

function payload() {
  return {
    species: currentPet().species || cfg.species,
    pet: currentPet(),
    label: currentSpecies().label,
    home: !!(cfg.home && cfg.home.enabled)
  };
}

/* ------------------------------------------------------------------ *
 * window
 * ------------------------------------------------------------------ */

let win = null;
let settingsWin = null;
let bubbleWin = null;
let tray = null;
let gazeTimer = null;
let dragTimer = null;
let autoTimer = null;
let dragOrigin = null;
let ignoring = true;

/* Size is a plain percentage so it can be nudged a point at a time.
   The sprite stays hard-edged at fractional scales because every rect
   is drawn with shape-rendering="crispEdges", which turns antialiasing
   off — dot widths vary by a pixel, but nothing blurs. */
/* ---------- coming closer ----------
   At a small pet size the detail in eating and playing is a couple of
   pixels of movement — real, and invisible. Rather than force a big pet
   on the desk all day, the window grows for the length of an action and
   settles back, like the pet stepping forward. */
let zoom = 1;
let zoomTimer = null;
/* Where the pet stood before it stepped forward. Recomputing the centre
   from the current bounds on every step rounds a pixel off each time and
   walks the pet sideways over a day of feeding. */
let zoomAnchor = null;

const ZOOM_READS_AT = 0.62;   // the effective size at which detail reads
const ZOOM_MAX = 2.6;

function effectiveScale() {
  return clampPct(cfg.pct) / 100 * care.stageScale(curStage());
}

function targetZoom() {
  if (!cfg.zoom.enabled) return 1;
  const eff = effectiveScale();
  if (eff >= ZOOM_READS_AT) return 1;          // already big enough
  return Math.min(ZOOM_MAX, ZOOM_READS_AT / eff);
}

/* Stepped rather than jumped: a single setBounds pops, seven over a fifth
   of a second reads as movement. */
function animateZoom(to) {
  if (zoomTimer) { clearInterval(zoomTimer); zoomTimer = null; }
  const from = zoom;
  if (Math.abs(to - from) < 0.01) { zoom = to; return; }
  if (!zoomAnchor && win && !win.isDestroyed()) {
    const b = win.getBounds();
    zoomAnchor = { cx: b.x + b.width / 2, bottom: b.y + b.height };
  }
  const steps = 7;
  let i = 0;
  zoomTimer = setInterval(() => {
    i += 1;
    zoom = from + (to - from) * (i / steps);
    applySize();
    if (i >= steps) {
      clearInterval(zoomTimer); zoomTimer = null;
      zoom = to;
      applySize();
      if (to <= 1.001) zoomAnchor = null;      // back where it started
    }
  }, 26);
}

function zoomForAction(ms) {
  const to = targetZoom();
  if (to <= 1.01) return;
  stopWander();                 // it should not walk off mid-close-up
  animateZoom(to);
  setTimeout(() => animateZoom(1), Math.max(400, ms));
}

function sizeFor(pct, stage) {
  // Growth is shown by resizing the window, which is exactly what the
  // size slider already does — so a baby is small without anything in
  // the artwork being scaled and blurred.
  const k = clampPct(pct) / 100 * care.stageScale(stage || 'adult') * zoom;
  return {
    width: Math.round(stageW() * DOT_BASE * k),
    height: Math.round(STAGE_H * DOT_BASE * k)
  };
}

/* the stage of the pet currently on screen */
function curStage() { return care.stageFor(careState()); }

function createWindow() {
  const { width, height } = sizeFor(cfg.pct, curStage());
  const area = screen.getPrimaryDisplay().workArea;

  let x = Number.isFinite(cfg.x) ? cfg.x : area.x + area.width - width - 48;
  let y = Number.isFinite(cfg.y) ? cfg.y : area.y + area.height - height - 48;
  ({ x, y } = clampToDisplays(x, y, width, height));

  win = new BrowserWindow({
    width, height, x, y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    acceptFirstMouse: true,
    // Windows draws a thin frame on transparent windows unless this is off
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  applyAlwaysOnTop();
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // everything is transparent — clicks pass through except on the pet itself.
  // `forward: true` keeps mousemove flowing so the renderer can tell us when
  // the pointer is actually over the drawing.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.once('ready-to-show', () => {
    win.showInactive();
    win.webContents.send('config', payload());
    // startCare() fires its first push before this window has loaded, so
    // that one is dropped; without this the pet would not learn it is
    // asleep until the next minute tick
    pushCare();
    startGazeLoop();
    scheduleAutoBehaviour();
  });

  win.on('moved', () => {
    // the bar belongs to the pet: keep it overhead wherever the pet goes,
    // whether that's a drag or a wander
    if (ringWin && !ringWin.isDestroyed() && ringWin.isVisible()) placeRing();
    reflowAgenda();
    if (dragOrigin || wanderTimer || zoomTimer) return; // those save once, at the end
    const [nx, ny] = win.getPosition();
    cfg.x = nx; cfg.y = ny;
    saveConfig();
  });

  win.on('closed', () => {
    win = null;
    stopGazeLoop();
    stopWander();
    if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.destroy();
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  });
}

// keep the pet from being stranded off-screen when monitors change
function clampToDisplays(x, y, w, h) {
  const displays = screen.getAllDisplays();
  const visible = displays.some(d => {
    const a = d.workArea;
    return x + w > a.x + 40 && x < a.x + a.width - 40 &&
           y + h > a.y + 40 && y < a.y + a.height - 40;
  });
  if (visible) return { x, y };
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - w - 48, y: a.y + a.height - h - 48 };
}

function applyAlwaysOnTop() {
  if (!win) return;
  if (cfg.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver');
  else win.setAlwaysOnTop(false);
}

/* Windows re-rounds a window's physical size on every SetWindowPos when
   the display is scaled (125%, 150%), so a position-only move repeated in
   a 16ms loop grows the pet a pixel at a time — it was visible while
   dragging and while wandering, and nowhere else. Restating the intended
   size on every move pins it. macOS does not need this but is unharmed. */
function moveTo(x, y) {
  if (!win || win.isDestroyed()) return;
  const { width, height } = sizeFor(cfg.pct, curStage());
  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
}

function applySize() {
  if (!win || win.isDestroyed()) return;
  const { width, height } = sizeFor(cfg.pct, curStage());
  const b = win.getBounds();
  // grow from the pet's feet so it does not walk across the desk while
  // the slider moves
  const x = zoomAnchor ? Math.round(zoomAnchor.cx - width / 2)
                       : Math.round(b.x + (b.width - width) / 2);
  const y = zoomAnchor ? zoomAnchor.bottom - height
                       : b.y + (b.height - height);
  win.setBounds({ x, y, width, height });
  // everything that hangs off the pet has to move with it. The bubble sits
  // above the head, so when the pet grows for an action the head rises
  // into it and the speech covers the very thing it grew to show.
  if (ringWin && !ringWin.isDestroyed() && ringWin.isVisible()) placeRing();
  reflowBubble();
  reflowAgenda();
}

/* keep the bubble above the head at whatever size the pet is now */
function reflowBubble() {
  if (bubbleWin && !bubbleWin.isDestroyed() && bubbleWin.isVisible()) {
    placeBubble(lastBubbleH);
  }
}

function pushConfig() {
  saveConfig();
  if (win && !win.isDestroyed()) win.webContents.send('config', payload());
  if (tray) tray.setToolTip(careState().egg ? '알' : `${currentPet().name} · ${currentSpecies().label}`);
}

/* ------------------------------------------------------------------ *
 * gaze — the pet watches the real cursor, anywhere on screen
 * ------------------------------------------------------------------ */
const GAZE_RADIUS = 420;
const DEADZONE = 26;

function startGazeLoop() {
  stopGazeLoop();
  gazeTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    if (dragOrigin) return; // being carried — don't whip the head around
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();

    const hx = b.x + b.width / 2;
    const hy = b.y + b.height * 0.36;   // the head sits about here

    const dx = p.x - hx;
    const dy = p.y - hy;
    const dist = Math.hypot(dx, dy);

    if (dist < DEADZONE) {
      win.webContents.send('gaze', { gx: 0, gy: 0 });
      return;
    }
    const k = Math.min(1, dist / GAZE_RADIUS);
    win.webContents.send('gaze', { gx: (dx / dist) * k, gy: (dy / dist) * k });
  }, 33);
}
function stopGazeLoop() {
  if (gazeTimer) { clearInterval(gazeTimer); gazeTimer = null; }
}

/* ------------------------------------------------------------------ *
 * idle behaviour
 * ------------------------------------------------------------------ */
const IDLE_POSES = ['waving', 'jumping', 'waiting', 'review', 'running'];

let wanderTimer = null;
let wanderPause = null;

function stopWander() {
  if (wanderTimer) { clearInterval(wanderTimer); wanderTimer = null; }
  if (wanderPause) { clearTimeout(wanderPause); wanderPause = null; }
}

/* One leg of a walk: pick a spot, amble to it.
   A straight constant-speed line across the screen read as a slider, not
   an animal, so each leg gets its own heading, its own pace, and a
   perpendicular wobble that fades out as it arrives. */
function wanderLeg(done) {
  if (!win || win.isDestroyed()) return done();

  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const minX = Math.round(area.x + 8);
  const maxX = Math.round(area.x + area.width - b.width - 8);
  const minY = Math.round(area.y + 8);
  const maxY = Math.round(area.y + area.height - b.height - 8);

  const x0 = b.x, y0 = b.y;
  let tx = x0, ty = y0, dx = 0, dy = 0, len = 0;

  // a few tries, because a heading into a nearby edge clamps to nothing
  for (let attempt = 0; attempt < 6; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const reach = 70 + Math.random() * 300;
    // desks are wider than they are tall, so vertical strides are shorter
    tx = Math.round(Math.max(minX, Math.min(maxX, x0 + Math.cos(angle) * reach)));
    ty = Math.round(Math.max(minY, Math.min(maxY, y0 + Math.sin(angle) * reach * 0.55)));
    dx = tx - x0; dy = ty - y0;
    len = Math.hypot(dx, dy);
    if (len >= 30) break;
  }
  if (len < 30) return done();

  const speed = 70 + Math.random() * 90;              // px per second
  const ticks = Math.max(2, Math.round(len / (speed / 60)));
  const px = -dy / len, py = dx / len;                // unit perpendicular
  const amp = 3 + Math.random() * 9;
  const waves = 1 + Math.random() * 2;

  setPose(dx >= 0 ? 'running-right' : 'running-left');

  let i = 0;
  stopWander();
  wanderTimer = setInterval(() => {
    if (!win || win.isDestroyed() || dragOrigin) { stopWander(); return done(); }
    i++;
    const t = Math.min(1, i / ticks);
    const wobble = Math.sin(t * Math.PI * waves) * amp * (1 - t);
    const nx = Math.round(x0 + dx * t + px * wobble);
    const ny = Math.round(y0 + dy * t + py * wobble);
    // if the move is ever refused, end the walk cleanly rather than
    // stranding the pet mid-stride
    try { moveTo(nx, ny); }
    catch (err) { stopWander(); return done(); }
    if (t >= 1) { stopWander(); return done(); }
  }, 16);
}

/* An outing is a few legs with a beat of standing still between them. */
function wander(done) {
  let legs = 1 + Math.floor(Math.random() * 3);
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    done();
  }

  function next() {
    if (legs-- <= 0 || !win || win.isDestroyed() || dragOrigin) return finish();
    wanderLeg(() => {
      if (!win || win.isDestroyed() || dragOrigin) return finish();
      setPose('idle');
      wanderPause = setTimeout(() => { wanderPause = null; next(); }, 250 + Math.random() * 1100);
    });
  }

  next();
}

function scheduleAutoBehaviour() {
  if (autoTimer) clearTimeout(autoTimer);
  if (!cfg.autoBehave || (cfg.home && cfg.home.enabled)) { stopWander(); return; }

  autoTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || !cfg.autoBehave || dragOrigin || bubbleActive() ||
        careState().sleeping || careState().egg) {   // an egg stays put
      return scheduleAutoBehaviour();
    }

    // now and then it shows off something it knows, unprompted
    const known = careState().tricks || [];
    if (known.length && Math.random() < 0.22) {
      doTrick(known[Math.floor(Math.random() * known.length)]);
      return scheduleAutoBehaviour();
    }

    // half the time it goes for a walk, half the time it just does something
    if (Math.random() < 0.5) {
      return wander(() => {
        if (win && !win.isDestroyed()) {
          setPose('idle');
          const [x, y] = win.getPosition();
          cfg.x = x; cfg.y = y;
          saveConfig();
        }
        scheduleAutoBehaviour();
      });
    }

    const act = IDLE_POSES[Math.floor(Math.random() * IDLE_POSES.length)];
    setPose(act);
    setTimeout(() => setPose('idle'), 3200 + Math.random() * 2600);

    scheduleAutoBehaviour();
    // A lively pet fidgets more often; a placid one is content to sit.
  }, (5000 + Math.random() * 10000) / (care.mods(careState()).wander || 1));
}

/* ------------------------------------------------------------------ *
 * dragging — custom, so ordinary clicks still reach the pet
 * ------------------------------------------------------------------ */
ipcMain.on('drag-start', () => {
  if (!win) return;
  stopWander();
  hideBubble();
  const cur = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  dragOrigin = { cx: cur.x, cy: cur.y, wx, wy };
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !dragOrigin) return;
    const p = screen.getCursorScreenPoint();
    moveTo(
      dragOrigin.wx + (p.x - dragOrigin.cx),
      dragOrigin.wy + (p.y - dragOrigin.cy)
    );
  }, 16);
});

ipcMain.on('drag-end', () => {
  if (dragTimer) { clearInterval(dragTimer); dragTimer = null; }
  dragOrigin = null;
  updateRing();
  if (win && !win.isDestroyed()) {
    const [x, y] = win.getPosition();
    cfg.x = x; cfg.y = y;
    saveConfig();
  }
});

ipcMain.on('hit', (_e, over) => {
  overPet = !!over;
  updateRing();
  if (!win || win.isDestroyed()) return;
  const shouldIgnore = !over;
  if (shouldIgnore === ignoring) return;
  ignoring = shouldIgnore;
  win.setIgnoreMouseEvents(shouldIgnore, { forward: true });
});

ipcMain.on('menu', () => showContextMenu());

/* ------------------------------------------------------------------ *
 * menus
 * ------------------------------------------------------------------ */
/* Accessory slots — must stay in step with renderer/gear.js */
const GEAR_SLOTS = [
  ['head', '머리', [['유자', 'yuzu'], ['나뭇잎', 'leaf'], ['별', 'star']]],
  ['eyes', '눈',   [['뿔테 안경', 'horn'], ['무테 안경', 'rimless'], ['반무테 안경', 'half'], ['선글라스', 'sun']]],
  ['hand', '손',   [['커피잔', 'coffee'], ['풍선', 'balloon'], ['꽃다발', 'flowers'], ['노트북', 'notebook']]],
  ['body', '옷',   [['목도리', 'scarf'], ['후드티', 'hoodie'], ['나비넥타이', 'bowtie'], ['멜빵반바지', 'overalls']]]
];
/* The menu offers what this save has actually unlocked. Locked prizes are
   not listed at all — a greyed-out row you cannot explain is worse than
   an absence. */
/* What the tray menu offers besides the milestone prizes. These sat
   between the lock tables and setPetSlot, and went out with them when the
   tables moved to missions.js — the menu then threw on every right-click.
   Nothing loads main.js in a test, so nothing caught it. */
const EYES = [['기본', 'basic'], ['졸림', 'sleepy'], ['반짝', 'sparkle']];
const STATES = [
  ['가만히', 'idle'], ['손 흔들기', 'waving'], ['점프', 'jumping'],
  ['오른쪽 달리기', 'running-right'], ['왼쪽 달리기', 'running-left'],
  ['작업 중', 'running'], ['기다리는 중', 'waiting'],
  ['검토 중', 'review'], ['실패', 'failed']
];

function setPetField(key, value) {
  currentPet()[key] = value;
  pushConfig();
}

/* The prize tables live in missions.js, next to the milestones that hold
   them back: an item losing its lock is silent — it just turns up in the
   menu for free — so the two have to be read side by side. */
function gearSlots() { return missions.gearSlots(GEAR_SLOTS, missionDone); }
function gearPickable(slot, key) { return missions.pickable(gearSlots(), slot, key); }
function roomSlots() { return missions.roomSlots(missionDone); }

function setRoomSlot(slot, value) {
  // Only something this save has actually unlocked. A value that is not on
  // the list would be stored and then silently vanish on the next redraw,
  // because nothing can render it.
  const row = roomSlots().find(([s]) => s === slot);
  if (!row) return;
  if (value !== 'none' && !row[2].some(([, key, locked]) => key === value && !locked)) {
    pushCare();       // refused: snap the window back to what is actually set
    return;
  }
  const pet = currentPet();
  if (!pet.room) pet.room = {};
  pet.room[slot] = value;
  pushConfig();
  pushCare();          // the care window draws the same choice
}

function setPetSlot(slot, value) {
  if (!gearPickable(slot, value)) { pushConfig(); return; }   // a prize not yet earned
  const pet = currentPet();
  if (!pet.props) pet.props = {};
  pet.props[slot] = value;
  pushConfig();
}


/* The half of the menu that means the same thing whether there is a pet
   or only an egg. */
function tailMenu(name) {
  return [
    {
      label: '항상 위에 두기', type: 'checkbox', checked: cfg.alwaysOnTop,
      click: () => { cfg.alwaysOnTop = !cfg.alwaysOnTop; saveConfig(); applyAlwaysOnTop(); }
    },
    {
      label: '혼자 움직이게 두기', type: 'checkbox', checked: cfg.autoBehave,
      click: () => { cfg.autoBehave = !cfg.autoBehave; saveConfig(); scheduleAutoBehaviour(); }
    },
    {
      label: '로그인할 때 자동 실행', type: 'checkbox', checked: cfg.launchAtLogin,
      click: () => {
        cfg.launchAtLogin = !cfg.launchAtLogin;
        saveConfig();
        applyLaunchAtLogin();
      }
    },
    { type: 'separator' },
    {
      label: '처음 자리로 되돌리기',
      click: () => {
        if (!win) return;
        const a = screen.getPrimaryDisplay().workArea;
        const { width, height } = sizeFor(cfg.pct, curStage());
        moveTo(a.x + a.width - width - 48, a.y + a.height - height - 48);
      }
    },
    {
      label: '설정 파일 열기',
      click: () => shell.showItemInFolder(configPath())
    },
    {
      label: '업데이트 확인…',
      click: () => runUpdateCheck(true)
    },
    {
      label: '저장 내보내기…',
      click: () => exportSave()
    },
    {
      label: '저장 가져오기…',
      click: () => importSave()
    },
    { label: `${name} 재우기 (종료)`, click: () => app.quit() }
  ];
}

/* Switching between pets you have actually met. An egg is not on this
   list — you cannot pick who is inside it. */
function showPet(key) {
  if (!cfg.pets[key] || key === cfg.species || cfg.pets[key].care.egg) return;
  cfg.species = key;
  cfg.pets[key].care = care.normalize(cfg.pets[key].care);
  cfg.pets[key].care.lastTick = Date.now();   // it was not on duty until now
  saveConfig();
  pushConfig();
  pushCare();
  if (win && !win.isDestroyed()) {
    setTimeout(() => setPose('waving'), 220);
    setTimeout(() => setPose('idle'), 2600);
  }
}

/* the shared menu items for meeting and swapping pets */
function rosterMenu() {
  const met = hatchedKeys();
  const out = [];
  if (met.length) {
    out.push({
      label: '펫 바꾸기',
      submenu: met.map((k) => ({
        label: `${speciesOf(k).label}  ${cfg.pets[k].name}`,
        type: 'radio',
        checked: cfg.species === k,
        click: () => showPet(k)
      })).concat(cfg.eggKey ? [
        { type: 'separator' },
        { label: '알', type: 'radio', checked: cfg.species === cfg.eggKey,
          click: () => { cfg.species = cfg.eggKey; saveConfig(); pushConfig(); pushCare(); } }
      ] : [])
    });
  }
  const left = wildUnhatched().filter((k) => k !== cfg.eggKey).length;
  out.push({
    label: left ? `새 알 받기 (${left}마리 남음)` : '모두 만났어요',
    enabled: !!left,
    click: () => askNewEgg(win)
  });
  out.push({ type: 'separator' });
  return out;
}

function buildMenu() {
  const sp = currentSpecies();
  const pet = currentPet();

  const c = careState();
  // An egg has no name, no coat and no poses. Offering them would give
  // away what is inside — and there is nothing to dress up yet.
  const eggOnly = c.egg ? [
    { label: `알 · 부화까지 ${Math.round(care.hatchProgress(c) * 100)}%`, enabled: false },
    { type: 'separator' }
  ].concat(rosterMenu(), [
    { label: '돌보기…', accelerator: 'CommandOrControl+K', click: () => openCare() },
    { label: '설정…', accelerator: 'CommandOrControl+,', click: () => openSettings() }
  ]) : null;
  if (eggOnly) return Menu.buildFromTemplate(eggOnly.concat(tailMenu('알')));

  return Menu.buildFromTemplate([
    { label: `${pet.name} · ${sp.label}`, enabled: false },
    { type: 'separator' }
  ].concat(rosterMenu(), [
    {
      label: '재주 시키기',
      enabled: (c.tricks || []).length > 0,
      submenu: (c.tricks || []).length
        ? c.tricks.map((t) => ({ label: t, click: () => doTrick(t) }))
        : [{ label: '아직 배운 재주가 없어요', enabled: false }]
    },
    {
      label: '지금 하는 일',
      submenu: STATES.map(([label, id]) => ({
        label,
        click: () => setPose(id, true)   // an explicit pick overrides sleep
      }))
    },
    { type: 'separator' },
    /* 털 색 · 눈 · 소품 · 집 · 대표 칭호는 돌보기 창의 「꾸미기」 탭으로
       옮겼다. 같은 것을 두 군데서 고르게 두면 한쪽만 고쳐 놓고 지나가게
       되고, 이정표가 "집 꾸미기 · 좌우 소품에 있어요" 라고 알려 준 자리와
       실제로 고르는 자리가 서로 다른 창이었다.
       ★잘라낸 자리에 정의가 섞여 있었는지는 npm run smoke 가 본다 —
       메뉴를 실제로 만들어 보고 첫 예외에서 멈춘다(1.24.0 사고 이후). */
    { type: 'separator' },
    { label: '돌보기…', accelerator: 'CommandOrControl+K', click: () => openCare() },
    { label: '설정…', accelerator: 'CommandOrControl+,', click: () => openSettings() },
  ], tailMenu(pet.name)));
}



/* ---------- moving house ----------
   Months of raising live in one file inside the app's own folder. A new
   laptop, or a reinstall, and they are gone — so it has to be possible to
   carry them out and back in. */
function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}

function exportSave() {
  saveConfig();
  dialog.showSaveDialog({
    title: '저장 내보내기',
    defaultPath: 'moka-pet-' + stamp() + '.json',
    filters: [{ name: '모카펫 저장', extensions: ['json'] }]
  }).then((r) => {
    if (r.canceled || !r.filePath) return;
    try {
      fs.copyFileSync(configPath(), r.filePath);
      showBubble({ kind: 'brief', head: '저장을 내보냈어요', lines: [path.basename(r.filePath)] });
    } catch (e) {
      dialog.showMessageBox({ type: 'error', message: '내보내지 못했어요', detail: String(e.message || e) });
    }
  });
}

function importSave() {
  dialog.showOpenDialog({
    title: '저장 가져오기',
    properties: ['openFile'],
    filters: [{ name: '모카펫 저장', extensions: ['json'] }]
  }).then((r) => {
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return;
    const from = r.filePaths[0];
    let raw;
    try { raw = JSON.parse(fs.readFileSync(from, 'utf8')); }
    catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object' || !raw.pets) {
      return dialog.showMessageBox({
        type: 'error', message: '모카펫 저장 파일이 아니에요',
        detail: '내보내기로 만든 .json 파일을 골라 주세요.'
      });
    }
    const count = Object.keys(raw.pets).length;
    dialog.showMessageBox({
      type: 'warning',
      buttons: ['취소', '가져오기'],
      defaultId: 0, cancelId: 0, noLink: true,
      message: '지금 키우던 아이들이 사라져요',
      detail: '가져올 파일에는 ' + count + '마리가 들어 있어요. 지금 저장은 덮어써지고 앱이 다시 시작합니다.'
    }).then((c) => {
      if (c.response !== 1) return;
      try {
        keepBackup();                       // the one being replaced, just in case
        fs.copyFileSync(from, configPath());
        skipSaveOnQuit = true;              // do not write the in-memory pets back over it
        app.relaunch();
        app.exit(0);
      } catch (e) {
        dialog.showMessageBox({ type: 'error', message: '가져오지 못했어요', detail: String(e.message || e) });
      }
    });
  });
}

function applyLaunchAtLogin() {
  try {
    app.setLoginItemSettings({
      openAtLogin: cfg.launchAtLogin,
      openAsHidden: IS_MAC,
      args: []
    });
  } catch (e) { /* unsupported platform */ }
}

function showContextMenu() {
  buildMenu().popup({ window: win || undefined });
}


/* ------------------------------------------------------------------ *
 * settings window
 *
 * A native menu cannot hold a slider, so pet size lives in a small
 * window of its own. Everything else stays on the context menu.
 * ------------------------------------------------------------------ */
function settingsPayload() {
  return {
    version: app.getVersion(),
    pct: cfg.pct, min: PCT_MIN, max: PCT_MAX, base: PCT_BASE,
    google: googleAuth.status(),
    cal: cfg.cal
  };
}

/* The dock icon is hidden, so macOS treats this as an accessory app and
   will not hand it keyboard focus on its own — without this the client
   ID field cannot be typed into. */
function focusSettings() {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  if (IS_MAC) app.focus({ steal: true });
  settingsWin.show();
  settingsWin.focus();
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    focusSettings();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 700,
    height: 500,
    resizable: true,
    minWidth: 520,
    minHeight: 380,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '모카펫 설정',
    frame: !IS_MAC,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    trafficLightPosition: IS_MAC ? { x: 14, y: 12 } : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.once('ready-to-show', () => focusSettings());
  settingsWin.on('closed', () => { settingsWin = null; });
}

ipcMain.on('settings-ready', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.webContents.send('settings-config', settingsPayload());
});

function setHome(on) {
  cfg.home = { enabled: !!on };
  saveConfig();
  applySize();
  pushConfig();
  pushCare();                // the care window draws the switch and the slots
  scheduleAutoBehaviour();   // at home it stays put
}

ipcMain.on('set-pct', (_e, pct) => {
  const p = clampPct(pct);
  if (p === cfg.pct) return;
  cfg.pct = p;
  applySize();
  saveConfig();
});


/* ------------------------------------------------------------------ *
 * milestones
 *
 * Not quests. Nothing here asks you to do anything you would not do
 * anyway, nothing counts down, and missing one costs nothing. They are
 * noticed on the way past, and each hands over an accessory that cannot
 * be got any other way — the fifteen ordinary ones stay free.
 * ------------------------------------------------------------------ */
/* The twelve live in missions.js. This is the world they count against. */
function missionWorld() {
  return {
    best: (pick) => hatchedKeys().reduce((n, k) => Math.max(n, pick(cfg.pets[k].care) || 0), 0),
    tally: (field) => petIds().reduce((n, k) => n + (cfg.pets[k].care[field] || 0), 0),
    hatched: hatchedKeys().length,
    species: SPECIES.filter((sp) => cfg.pets[sp.key] && !cfg.pets[sp.key].care.egg).length,
    trickTotal: care.TRICKS.length
  };
}
const MISSIONS = missions.LIST;
function missionNow(m) { return missions.now(m, missionWorld()); }
function missionMet(m) { return missions.met(m, missionWorld()); }

function missionDone(id) { return (cfg.missions.done || []).indexOf(id) >= 0; }

/* The title on show. Earned titles all stay earned; this is only which
   one is worn, and none is a perfectly good answer. */
function badgeLabel() {
  const m = MISSIONS.find((x) => x.id === cfg.missions.badge && missionDone(x.id));
  return m ? m.badge : '';
}

function setBadge(id) {
  cfg.missions.badge = (id && missionDone(id)) ? id : '';
  saveConfig();
  pushCare();
  pushConfig();
}

/* Awards every milestone that has been met, but announces only one — six
   at once must not stack six bubbles. Awarding only one used to leave the
   list showing "20 / 20" next to an empty circle until the next action,
   which reads as a bug. */
function checkMissions() {
  if (careState().egg) return;
  const won = MISSIONS.filter((m) => !missionDone(m.id) && missionMet(m));
  if (!won.length) return;

  won.forEach((m) => {
    cfg.missions.done.push(m.id);
    // 무엇을 받았는지만 알려 주면 어느 메뉴를 열어야 하는지 모른다
    const spots = missions.prizesFor(m.id)
      .map((p) => p.label + ' → ' + p.where).join(', ');
    care.note(careState(), 'mission',
      '「' + m.title + '」 달성 — ' + m.prize + care.eul(m.prize) + ' 받았어요' +
      (spots ? ' (' + spots + ')' : ''));
  });
  if (!badgeLabel()) cfg.missions.badge = won[0].id;   // the first one goes on by itself
  saveConfig();

  const m = won[0];
  const more = won.length > 1 ? ' 외 ' + (won.length - 1) + '개' : '';
  showBubble({
    kind: 'age',
    head: m.title + more,
    lines: [m.prize + care.eul(m.prize) + ' 받았어요 · 칭호 「' + m.badge + '」']
  });
  pushConfig();
  pushCare();
}

/* Which accessories are available: the free ones, plus whatever the
   milestones have handed over. */
function gearUnlocked(lock) { return !lock || missionDone(lock); }

/* ------------------------------------------------------------------ *
 * updates
 * ------------------------------------------------------------------ */
let updateTimer = null;

/* ---------- Windows: the real thing ----------
   An NSIS install can replace itself without a code signing certificate,
   so on Windows the update actually installs. macOS cannot: Squirrel.Mac
   refuses to swap an unsigned bundle, which is why that platform is told
   about the new version and sent to the page instead.

   If anything here fails — no network, a malformed feed, a locked file —
   it falls back to that same telling-you path. A silent auto-updater that
   quietly does nothing is worse than no auto-updater. */
let autoUpdater = null;

function startWinAutoUpdate() {
  if (!IS_WIN || !app.isPackaged) return false;
  let mod;
  try { mod = require('electron-updater'); }
  catch (e) { return false; }

  autoUpdater = mod.autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('update-downloaded', (info) => {
    const v = (info && info.version) || '';
    dialog.showMessageBox({
      type: 'info',
      buttons: ['다음에 켤 때', '지금 설치'],
      defaultId: 1, cancelId: 0, noLink: true,
      message: '새 버전 v' + v + ' 준비됐어요',
      detail: '설치하면 앱이 잠깐 닫혔다 다시 열립니다. 키우던 아이들은 그대로예요.'
    }).then((r) => {
      if (r.response === 1) setImmediate(() => autoUpdater.quitAndInstall(false, true));
    });
  });

  autoUpdater.on('error', () => {
    // fall back to the honest path rather than failing in silence
    autoUpdater = null;
    checkUpdate(false);
  });

  return true;
}

async function checkUpdate(byHand) {
  if (!byHand && !cfg.update.enabled) return;
  const found = await updater.check(cfg.update.repo, app.getVersion());
  if (!found) {
    if (byHand) {
      dialog.showMessageBox({
        type: 'info', buttons: ['확인'], noLink: true,
        message: '최신 버전이에요',
        detail: '지금 쓰고 계신 v' + app.getVersion() + '가 가장 최신입니다.'
      });
    }
    return;
  }
  // one nudge per version unless you ask again yourself
  if (!byHand && cfg.update.skip === found.version) return;

  const r = await dialog.showMessageBox({
    type: 'info',
    buttons: ['나중에', '받으러 가기'],
    defaultId: 1, cancelId: 0, noLink: true,
    message: '새 버전 v' + found.version + '이 나왔어요',
    detail: (found.notes ? found.notes + '\n\n' : '') +
            '지금 버전은 v' + app.getVersion() + '이에요. ' +
            '내려받아 설치하면 키우던 아이들은 그대로 이어집니다.'
  });
  if (r.response === 1) shell.openExternal(found.url);
  else if (!byHand) { cfg.update.skip = found.version; saveConfig(); }
}

function runUpdateCheck(byHand) {
  if (autoUpdater) {
    // Windows installs it; the events above take over from here
    autoUpdater.checkForUpdates().catch(() => checkUpdate(byHand));
    if (byHand) {
      // checkForUpdates is quiet when already current, so say something
      updater.check(cfg.update.repo, app.getVersion()).then((found) => {
        if (found) return;
        dialog.showMessageBox({
          type: 'info', buttons: ['확인'], noLink: true,
          message: '최신 버전이에요',
          detail: '지금 쓰고 계신 v' + app.getVersion() + '가 가장 최신입니다.'
        });
      });
    }
    return;
  }
  checkUpdate(byHand);
}

/* Twice a day was far too coarse. A desktop pet is left running for days,
   so "at launch, then in twelve hours" meant a release could sit there all
   afternoon with nobody told — which is exactly what happened with 1.25.0.
   Two hours costs one request; GitHub allows sixty an hour per address.

   Waking from sleep is the other moment worth checking: the laptop that
   was shut on Friday is opened on Monday, and that is when you want to
   hear about it. Guarded so a flurry of resume events is still one call. */
const UPDATE_EVERY = 2 * 60 * 60 * 1000;
const UPDATE_MIN_GAP = 25 * 60 * 1000;
let lastUpdateCheck = 0;

function maybeCheckUpdate() {
  const now = Date.now();
  if (now - lastUpdateCheck < UPDATE_MIN_GAP) return;
  lastUpdateCheck = now;
  runUpdateCheck(false);
}

function startUpdates() {
  if (updateTimer) clearInterval(updateTimer);
  startWinAutoUpdate();
  setTimeout(maybeCheckUpdate, 20 * 1000);
  updateTimer = setInterval(maybeCheckUpdate, UPDATE_EVERY);
  try {
    powerMonitor.on('resume', () => setTimeout(maybeCheckUpdate, 8000));
  } catch (e) { /* platform without power events */ }
}

/* ------------------------------------------------------------------ *
 * the agenda panel
 *
 * A bubble is a passing remark; a meeting in ten minutes is not. These
 * stay on screen, docked to the edge of the display the pet is on, until
 * you close them.
 * ------------------------------------------------------------------ */
const AGENDA_W = 268;
let agendaWin = null;
let agendaItems = [];

function ensureAgendaWindow() {
  if (agendaWin && !agendaWin.isDestroyed()) return agendaWin;
  agendaWin = new BrowserWindow({
    width: AGENDA_W, height: 120,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, resizable: false, movable: false,
    skipTaskbar: true, show: false, thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'agenda-preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  agendaWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  agendaWin.setAlwaysOnTop(true, 'screen-saver');
  agendaWin.loadFile(path.join(__dirname, 'renderer', 'agenda.html'));
  agendaWin.on('closed', () => { agendaWin = null; });
  return agendaWin;
}

/* Beside the pet, on whichever side has room.
 *
 * This used to dock to the far edge of the screen opposite the pet, which
 * did keep the two from overlapping — and made the panel look like some
 * unrelated window that had appeared in the corner. It is the pet telling
 * you about your day, so it belongs next to the pet, the way the speech
 * bubble and the button bar do. It follows on every move (win.on('moved')).
 */
const AGENDA_GAP = 12;

function placeAgenda(height) {
  if (!agendaWin || agendaWin.isDestroyed()) return;
  const area = win && !win.isDestroyed()
    ? screen.getDisplayMatching(win.getBounds()).workArea
    : screen.getPrimaryDisplay().workArea;
  const h = Math.max(80, Math.min(area.height - 32, Math.round(height) || 120));

  if (!win || win.isDestroyed()) {
    agendaWin.setBounds({
      x: area.x + area.width - AGENDA_W - 16,
      y: area.y + Math.round((area.height - h) / 2),
      width: AGENDA_W, height: h
    });
    return;
  }

  const p = win.getBounds();
  const left = p.x - AGENDA_GAP - AGENDA_W;          // panel's x if it sits left
  const right = p.x + p.width + AGENDA_GAP;
  // the side with room; when neither fits, the roomier one, clamped
  const fitsLeft = left >= area.x + 8;
  const fitsRight = right + AGENDA_W <= area.x + area.width - 8;
  let x = fitsLeft ? left : (fitsRight ? right : (p.x - area.x > area.width / 2 ? left : right));
  x = Math.max(area.x + 8, Math.min(area.x + area.width - AGENDA_W - 8, x));

  // level with the pet's head rather than its feet, then kept on screen
  let y = p.y + Math.round(p.height * 0.25) - Math.round(h / 2);
  y = Math.max(area.y + 8, Math.min(area.y + area.height - h - 8, y));

  agendaWin.setBounds({ x, y, width: AGENDA_W, height: h });
}

function pushAgenda() {
  const w = ensureAgendaWindow();
  const send = () => w.webContents.send('agenda-items', agendaItems);
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send);
  else send();
  if (!agendaItems.length) { w.hide(); return; }
  placeAgenda(w.getBounds().height);
  if (!w.isVisible()) w.showInactive();
}

function addAgenda(n) {
  const id = 'a' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000);
  agendaItems.unshift({
    id,
    when: n.head || '일정',
    title: (n.lines && n.lines[0]) || n.head || '',
    lines: (n.lines || []).slice(1)
  });
  if (agendaItems.length > 6) agendaItems.length = 6;
  pushAgenda();
}

ipcMain.on('agenda-dismiss', (_e, id) => {
  agendaItems = agendaItems.filter((i) => i.id !== id);
  pushAgenda();
});

ipcMain.on('agenda-measured', (_e, h) => {
  if (agendaItems.length) placeAgenda(h);
});

function reflowAgenda() {
  if (agendaWin && !agendaWin.isDestroyed() && agendaWin.isVisible()) {
    placeAgenda(agendaWin.getBounds().height);
  }
}

/* ------------------------------------------------------------------ *
 * calendar reminders
 * ------------------------------------------------------------------ */
let bubbleTimer = null;
let lastBubbleH = 100;

const BUBBLE_W = 280;
const RING_W = 195;   // four 40px buttons + gaps + padding
const RING_H = 56;
/* The bar grows when it opens a tray of dishes or games, and says how big
   it needs to be — the same handshake the bubble uses. */
let ringSize = { w: RING_W, h: RING_H };

function bubbleActive() { return !!bubbleTimer; }

/* The bubble is its own window rather than part of the pet's.
   Inside the pet window it would be only as wide as the pet — at 33%
   that is 111px, which fits about nine characters. */
function ensureBubbleWindow() {
  if (bubbleWin && !bubbleWin.isDestroyed()) return bubbleWin;

  bubbleWin = new BrowserWindow({
    width: BUBBLE_W,
    height: 120,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'bubble-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  bubbleWin.setIgnoreMouseEvents(true);          // never in the way of a click
  bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bubbleWin.setAlwaysOnTop(true, 'screen-saver');
  bubbleWin.loadFile(path.join(__dirname, 'renderer', 'bubble.html'));
  bubbleWin.on('closed', () => { bubbleWin = null; });
  return bubbleWin;
}

function placeBubble(height) {
  if (!bubbleWin || bubbleWin.isDestroyed() || !win || win.isDestroyed()) return;
  const p = win.getBounds();
  const area = screen.getDisplayMatching(p).workArea;

  let x = Math.round(p.x + p.width / 2 - BUBBLE_W / 2);
  x = Math.max(area.x + 4, Math.min(area.x + area.width - BUBBLE_W - 4, x));
  // above the pet, or below it when there is no room up top
  let y = p.y - height + 4;
  if (y < area.y + 4) y = Math.min(area.y + area.height - height - 4, p.y + p.height - 8);

  bubbleWin.setBounds({ x, y, width: BUBBLE_W, height });
}

ipcMain.on('bubble-measured', (_e, h) => {
  const height = Math.max(60, Math.min(260, Math.round(h) || 100));
  lastBubbleH = height;               // a good guess for the next one
  placeBubble(height);
  if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.showInactive();
});

function hideBubble() {
  // called unconditionally on every drag-start to cancel a pending bubble,
  // so it must not clobber the pose when there was nothing to hide — that
  // is what made a sleeping pet look awake the moment it was picked up:
  // this used to force 'idle' regardless, overwriting the 'sleeping' state
  // the renderer was showing while care.sleeping was still true underneath.
  const wasShowing = !!bubbleTimer;
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
  reflowRing();
  if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.hide();
  if (wasShowing) setPose('idle');
}

function showBubble(n) {
  if (!win || win.isDestroyed()) return;

  stopWander();                       // do not wander around wearing a bubble
  // Waving is for announcements. Chatter and reactions are quiet, and
  // forcing a wave there wiped out the eating/playing animation the
  // action had just started.
  if (!n.quiet) setPose('waving');    // ...but a sleeping pet stays asleep

  const b = ensureBubbleWindow();
  // Show it BEFORE asking it to measure itself. The bubble reveals itself
  // by reporting its height from inside requestAnimationFrame, and rAF is
  // throttled to a standstill in a hidden window — so once the first
  // bubble had been hidden, no later one could ever reappear. It sized
  // itself correctly and then sat there invisible, with the timer still
  // running, which is why the pet looked mute while the app believed it
  // was talking. Open at the last known height so the correction that
  // follows is almost always a no-op.
  placeBubble(lastBubbleH);
  if (!b.isVisible()) b.showInactive();
  const send = () => b.webContents.send('bubble-show', { head: n.head, lines: n.lines });
  if (b.webContents.isLoading()) b.webContents.once('did-finish-load', send);
  else send();

  if (bubbleTimer) clearTimeout(bubbleTimer);
  // Chatter is a passing remark, so it goes away quickly. Announcements
  // (calendar, birthdays) are the reason the app exists and still get
  // long enough to actually be read.
  bubbleTimer = setTimeout(() => { bubbleTimer = null; hideBubble(); },
    n.quiet ? 2200 : (n.kind === 'brief' ? 13000 : 9000));
  reflowRing();

  if (!n.quiet && Notification.isSupported()) {
    try {
      const note = new Notification({ title: n.head, body: n.lines.join('\n'), silent: false });
      if (n.click) note.on('click', n.click);   // e.g. "sign in again" opens settings
      note.show();
    } catch (e) { /* notifications are a bonus, never a blocker */ }
  }
}

function startCalendar() {
  calendar.start({
    getAccessToken: () => googleAuth.getAccessToken(),
    getSettings: () => cfg.cal,
    getSeen: () => cfg.seen,
    setSeen: (seen) => { cfg.seen = seen; saveConfig(); },
    onNotify: (n) => {
      if (!cfg.cal.enabled) return;
      // The detail goes to the panel and stays there; the pet only nudges
      // you to look, because a bubble is gone before you have read it.
      addAgenda(n);
      const what = (n.lines && n.lines[0]) || n.head;
      say(n.kind === 'event' ? (n.head + ' ' + what) : what, 'chat', true);
      if (Notification.isSupported()) {
        try {
          new Notification({ title: n.head, body: (n.lines || []).join('\n'), silent: false }).show();
        } catch (e) { /* notifications are a bonus, never a blocker */ }
      }
    },
    onSignedOut: () => {
      // Losing the grant used to be completely silent: the pet simply
      // stopped announcing anything and you had to open the settings
      // window to find out. Say so, once, and offer the way back.
      const wasSignedIn = googleAuth.status().signedIn;
      googleAuth.invalidate();
      pushSettings();
      if (!wasSignedIn) return;
      showBubble({
        kind: 'auth',
        head: '구글 연결이 풀렸어요',
        lines: ['설정에서 다시 로그인해 주세요'],
        click: () => openSettings()
      });
    }
  });
}

function pushSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings-config', settingsPayload());
  }
}

ipcMain.handle('google:status', () => settingsPayload());

ipcMain.handle('google:set-client', (_e, id, secret) => {
  googleAuth.setClient(id, secret);
  return settingsPayload();
});

ipcMain.handle('google:signin', async () => {
  await googleAuth.signIn();
  calendar.poll();
  return settingsPayload();
});

ipcMain.handle('google:signout', () => {
  googleAuth.signOut();
  return settingsPayload();
});

ipcMain.handle('cal:set', (_e, patch) => {
  if (patch && typeof patch === 'object') {
    if (typeof patch.enabled === 'boolean') cfg.cal.enabled = patch.enabled;
    if (Number.isFinite(patch.leadMinutes)) {
      cfg.cal.leadMinutes = Math.max(1, Math.min(60, Math.round(patch.leadMinutes)));
    }
    if (typeof patch.briefEnabled === 'boolean') cfg.cal.briefEnabled = patch.briefEnabled;
    if (/^\d{2}:\d{2}$/.test(patch.briefAt || '')) cfg.cal.briefAt = patch.briefAt;
    saveConfig();
  }
  return settingsPayload();
});


/* ------------------------------------------------------------------ *
 * raising the pet
 *
 * Only the active pet is simulated. The others are frozen at the moment
 * they were last on screen, so switching species does not hand you a
 * starved animal you never agreed to look after.
 * ------------------------------------------------------------------ */
let careTimer = null;
let ringWin = null;
let careWin = null;
let overPet = false;
let overRing = false;
let ringHide = null;
let lastWant = 0;
let lastSpoke = 0;

function careState() { return currentPet().care; }

/* Every transient pose (waving, jumping, eating...) must go through here.
   A sleeping pet keeps lying down: three separate bugs in a row were all
   some code path forcing a pose without checking, leaving the animation
   awake while care.sleeping stayed true underneath. `force` is for the
   care actions themselves, which legitimately wake the pet first. */
/* `kind` is which dish or which game — the bowl on screen should hold what
   was actually served. */
function setPose(state, force, kind) {
  if (!win || win.isDestroyed()) return;
  if (!force && careState().sleeping) return;
  win.webContents.send('state', state, kind || null);
}

function careTick(push) {
  const c = careState();
  const before = c.poops.length;
  const wasEgg = c.egg;
  const wasSleeping = c.sleeping;
  care.advance(c, Date.now(), {
    night: cfg.night.enabled, from: cfg.night.from, to: cfg.night.to
  });
  if (c.sleeping !== wasSleeping) saveConfig();
  if (wasEgg && !c.egg) { cfg.eggKey = null; announceHatch(); }
  eggTick();
  checkMissions();
  if (push !== false) pushCare();
  if (c.poops.length !== before || (wasEgg && !c.egg)) saveConfig();
}

/* What to call the thing on screen. While it is an egg the name would
   give away the species, which is the one thing an egg is for. */
/* The plain name. The care window shows it in a field you can rename, so
   it must stay the name and nothing else. */
function speakerName() {
  return careState().egg ? '알' : currentPet().name;
}

/* The bubble head: who is talking, and — since it is right there above
   the pet — how old it is and what title it is wearing. Announcement
   bubbles carry their own subject, so only chatter comes through here. */
function speakerLine() {
  const c = careState();
  if (c.egg) return '알';
  const badge = badgeLabel();
  return currentPet().name + ' · ' + c.age + '살' + (badge ? ' · ' + badge : '');
}

/* The warming cooldown is invisible, so an egg that is ready to be
   touched says so — once per window, not once a minute. */
let eggPrompted = -1;

function eggTick() {
  const c = careState();
  if (!c.egg || !cfg.chat.enabled) { eggPrompted = -1; return; }
  if (bubbleActive() || !care.canWarm(c)) return;
  const window = c.lastWarm || 0;
  if (eggPrompted === window) return;
  eggPrompted = window;
  showBubble({
    kind: 'chat',
    head: '알',
    lines: [chatter.eggLine()],
    quiet: true
  });
}

/* ---------- the egg you are holding ----------
   Every species has its own slot, and a slot whose care is still an egg
   is a pet you have not met. Which slot the egg you hold sits in IS the
   species inside it — decided when the egg arrives, kept secret until it
   opens. That way hatching never has to move state around, and the pets
   you have already raised stay exactly where they are. */

/* The nine species slots you have not met yet — the pool a plain new egg
   is drawn from. Children are not in it: they come from their parents. */
function wildUnhatched() {
  return SPECIES.map((s) => s.key).filter((k) => cfg.pets[k] && cfg.pets[k].care.egg);
}
function unhatched() { return petIds().filter((k) => cfg.pets[k].care.egg); }
function hatchedKeys() { return petIds().filter((k) => !cfg.pets[k].care.egg); }

/* ---------- family ----------
   Two pets you raised to adulthood, and a child that is neither of them
   and both: it takes after one parent's species — those are the only nine
   bodies we can draw — but its coat is mixed from the two, and it starts
   with half of their habits. Nobody is sent away to make room. */
const MAX_PETS = 20;

function mixHex(a, b) {
  const rgb = (h) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h || '');
    return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [176, 128, 82];
  };
  const x = rgb(a), y = rgb(b);
  return '#' + [0, 1, 2].map((i) => {
    const v = Math.round((x[i] + y[i]) / 2);
    return ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
  }).join('');
}

/* The rules themselves live in family.js, where they can be tested
   without launching anything. These wrap them in the pets map. */
function kinship(aId, bId) { return family.kinship(cfg.pets, aId, bId); }
function mateOf(id) { return family.mateOf(cfg.pets, id); }
function pairProblem(aId, bId) { return family.pairProblem(cfg.pets, aId, bId); }

function breed(aId, bId) {
  const a = cfg.pets[aId], b = cfg.pets[bId];
  if (!a || !b || aId === bId) return false;
  if (pairProblem(aId, bId)) return false;      // family, or already paired
  if (!care.canMate(a.care) || !care.canMate(b.care)) return false;
  if (petIds().length >= MAX_PETS) return false;

  // the child takes one parent's body, and is named after that parent
  const takesAfter = Math.random() < 0.5 ? a : b;
  const id = 'kid' + (cfg.nextKid = (cfg.nextKid || 1)) + '-' + Date.now().toString(36).slice(-4);
  cfg.nextKid += 1;

  const pet = blankPet(takesAfter.species);
  // a second child of the same parent needs its own name
  const base = takesAfter.name + '의 아이';
  const taken = petIds().map((k) => cfg.pets[k].name);
  let name = base, n = 2;
  while (taken.indexOf(name) >= 0) name = base + ' ' + (n++);
  pet.name = name;
  pet.fur = mixHex(a.fur, b.fur);
  pet.belly = mixHex(a.belly, b.belly);
  pet.props = { head: 'none', eyes: 'none', hand: 'none', body: 'none' };
  pet.parents = [aId, bId];        // ids, so the family tree can be drawn
  pet.care = care.inherit(care.blank(), a.care, b.care);

  cfg.pets[id] = pet;
  a.mate = bId;                    // one partner, for good
  b.mate = aId;
  care.markMated(a.care);
  care.markMated(b.care);
  const born = '의 사이에 「' + pet.name + '」' + care.ga(pet.name) + ' 생겼어요';
  a.care.children = (a.care.children || 0) + 1;
  b.care.children = (b.care.children || 0) + 1;
  care.note(a.care, 'child', b.name + '와' + born);
  care.note(b.care, 'child', a.name + '와' + born);
  cfg.eggKey = id;
  cfg.species = id;
  saveConfig();
  pushConfig();
  pushCare();
  showBubble({
    kind: 'age',
    head: '알이 생겼어요',
    lines: [a.name + '와 ' + b.name + '의 알이에요']
  });
  return true;
}

/* Which motion each trick is. Adding a trick means adding a line here
   and a block of CSS in the pet window — the name alone is not a trick. */
const TRICK_POSE = {
  '앉아':     ['sit', 2600],
  '손':       ['paw', 2400],
  '엎드려':   ['lie', 2800],
  '빙글':     ['spin', 2200],
  '점프':     ['jump', 1800],
  '인사':     ['bow', 2000],
  '기다려':   ['stay', 2600],
  '하이파이브': ['high', 2200],
  '구르기':   ['roll', 2000],
  '노래':     ['sing', 2800]
};

function doTrick(trick) {
  const r = care.actPerform(careState(), trick);
  if (!r.ok) return;
  const [pose, ms] = TRICK_POSE[trick] || ['waving', 1600];
  saveConfig();
  pushCare();
  setPose(pose, true);
  zoomForAction(ms);
  setTimeout(() => setPose('idle'), ms);
  say(chatter.trickLine(trick), 'react', true);
}

ipcMain.on('care-trick', (_e, trick) => { doTrick(trick); });

ipcMain.on('badge-set', (_e, id) => { setBadge(typeof id === 'string' ? id : ''); });

ipcMain.on('care-home', (_e, on) => setHome(on));
ipcMain.on('care-room', (_e, slot, value) => {
  if (missions.ROOM_SLOTS.some(([s]) => s === slot)) setRoomSlot(slot, typeof value === 'string' ? value : 'none');
});

ipcMain.on('care-game', (_e, won) => {
  const r = care.actGame(careState(), !!won);
  if (!r.ok) return;
  saveConfig();
  pushCare();
  setPose('playing', true);
  setTimeout(() => setPose('idle'), 1800);
  reactTo(won ? 'gameWin' : 'gameLose');
});

ipcMain.on('care-mate', (e, partnerId) => {
  const meId = cfg.species;
  const me = cfg.pets[meId], other = cfg.pets[partnerId];
  if (!me || !other) return;
  const parent = BrowserWindow.fromWebContents(e.sender);
  const holding = careState().egg;
  const ask = holding
    ? dialog.showMessageBox(parent && !parent.isDestroyed() ? parent : undefined, {
        type: 'warning',
        buttons: ['취소', '알 맞바꾸기'],
        defaultId: 0, cancelId: 0, noLink: true,
        message: '지금 품고 있는 알이 사라져요',
        detail: '새 알을 받으면 이 알은 없어집니다.'
      }).then((r) => r.response === 1)
    : Promise.resolve(true);
  ask.then((go) => { if (go) breed(meId, partnerId); });
});

/* Hand over a fresh egg from the pets still unmet. Returns false when
   there is nobody left to meet. */
function newEgg(announce) {
  const pool = wildUnhatched().filter((k) => k !== cfg.eggKey);
  if (!pool.length) return false;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  cfg.pets[pick].care = care.blank();
  cfg.eggKey = pick;
  cfg.species = pick;
  saveConfig();
  pushConfig();
  pushCare();
  if (announce) {
    showBubble({ kind: 'age', head: '새 알이 왔어요', lines: ['누가 나올지는 아직 몰라요'] });
  }
  return true;
}

/* The one moment the pet gets a real announcement of its own. */
function announceHatch() {
  eggPrompted = -1;
  const name = currentPet().name;
  showBubble({
    kind: 'age',
    head: '알에서 나왔어요',
    lines: [name + care.ga(name) + ' 태어났어요!']
  });
}

function carePayload() {
  const v = care.view(careState());
  v.name = speakerName();
  // the care window draws the pet too, so it needs to know who and in
  // which colours
  v.species = currentPet().species || cfg.species;
  v.pet = { fur: currentPet().fur, belly: currentPet().belly, props: currentPet().props };
  // the whole cast, so the care window can show what has been met and
  // what is still in a shell
  v.roster = petIds().map((id) => {
    const pet = cfg.pets[id];
    const c2 = pet.care;
    return {
      key: id,
      species: pet.species || id,
      name: pet.name,
      met: !c2.egg,
      // Never mark the egg you are holding: a highlighted silhouette
      // would point straight at who is inside it.
      here: id === cfg.species && !c2.egg,
      stage: care.stageFor(c2),
      build: care.weightBand(c2),
      scale: care.stageScale(care.stageFor(c2)),
      fur: pet.fur,
      belly: pet.belly,
      parents: pet.parents || null
    };
  });
  // Listed with the reason rather than quietly missing, the same way a
  // prize you have not earned is still shown.
  // Locked dishes stay on the list with what would open them, the same
  // way an unearned prize does.
  const mark = (list, field, word) => {
    const n = cooked(field);
    return (v[field] || []).map((f) => {
      const need = (list.find((x) => x.id === f.id) || {}).after || 0;
      return need <= n ? f
        : Object.assign({}, f, { lock: word + ' ' + need + '번', at: n, need });
    });
  };
  v.meals = mark(care.MEALS, 'meals', '밥');
  v.snacks = mark(care.SNACKS, 'snacks', '간식');
  v.plays = mark(care.PLAYS, 'plays', '놀기');
  v.cooked = { meals: cooked('meals'), snacks: cooked('snacks'), plays: cooked('plays') };

  v.myMate = mateOf(cfg.species) ? cfg.pets[mateOf(cfg.species)].name : null;
  v.mates = hatchedKeys().filter((k) => k !== cfg.species).map((k) => ({
    id: k, name: cfg.pets[k].name,
    no: pairProblem(cfg.species, k) || care.whyNotMate(cfg.pets[k].care)
  }));
  const myParents = currentPet().parents;
  v.parents = myParents && myParents.every((k) => cfg.pets[k])
    ? myParents.map((k) => cfg.pets[k].name)
    : null;
  v.full = petIds().length >= MAX_PETS;
  // the room, so the care window can offer it without digging through a
  // four-deep tray menu
  v.home = !!(cfg.home && cfg.home.enabled);
  v.room = {
    choice: Object.assign({ back: 'none', floor: 'none', left: 'none', right: 'none' },
                          currentPet().room || {}),
    slots: roomSlots().map(([slot, label, items]) => ({ slot, label, items }))
  };
  // 털 색과 소품은 트레이 메뉴에서 돌보기 창의 「꾸미기」 탭으로 옮겼다 —
  // 같은 것을 두 군데서 고르게 두면 한쪽만 고쳐 놓고 지나가게 된다.
  v.gear = {
    choice: Object.assign({ head: 'none', eyes: 'none', hand: 'none', body: 'none' },
                          currentPet().props || {}),
    slots: gearSlots().map(([slot, label, items]) => ({ slot, label, items }))
  };
  v.furs = (SPECIES.find((x) => x.key === (currentPet().species || cfg.species)) || {}).furs || [];
  v.fur = currentPet().fur;
  v.eyesPick = currentPet().eyes || 'basic';
  v.eyesList = EYES;
  v.missions = MISSIONS.map((m) => ({
    id: m.id, title: m.title, how: m.how, prize: m.prize, badge: m.badge,
    prizes: missions.prizesFor(m.id),
    done: missionDone(m.id), now: missionNow(m), goal: m.goal, unit: m.unit
  }));
  v.badges = MISSIONS.filter((m) => missionDone(m.id)).map((m) => ({ id: m.id, name: m.badge }));
  v.badge = badgeLabel();
  v.badgeId = cfg.missions.badge || '';
  v.met = hatchedKeys().length;
  v.total = SPECIES.length;
  v.left = wildUnhatched().filter((k) => k !== cfg.eggKey).length;
  v.scale = {
    now: care.stageScale(v.stage),
    next: v.next ? care.stageScale(v.next.stage) : 1
  };
  v.version = app.getVersion();
  v.chat = cfg.chat.enabled;
  v.night = cfg.night.enabled;
  v.away = cfg.away.enabled;
  v.zoom = cfg.zoom.enabled;
  v.zoomFactor = Math.round(targetZoom() * 100) / 100;
  v.awayMin = cfg.away.minutes;
  v.stretch = cfg.stretch.enabled;
  v.stretchMin = cfg.stretch.minutes;
  v.nightFrom = cfg.night.from;
  v.nightTo = cfg.night.to;
  v.hint = '필요할 때 돌봐줘야 경험치가 오릅니다. 배부른데 밥을 줘도 오르지 않아요.';
  return v;
}

let shownStage = null;

function pushCare() {
  const v = carePayload();
  // hatching and every birthday that crosses a tier change how big the
  // pet is drawn, and applySize() grows it from the feet so it does not
  // slide across the desk
  if (v.stage !== shownStage) {
    shownStage = v.stage;
    applySize();
    if (ringWin && !ringWin.isDestroyed() && ringWin.isVisible()) placeRing();
  }
  if (win && !win.isDestroyed()) win.webContents.send('care', v);
  if (careWin && !careWin.isDestroyed()) careWin.webContents.send('care-state', v);
  if (ringWin && !ringWin.isDestroyed()) ringWin.webContents.send('ring-state', v);
  if (tray) tray.setToolTip(careState().egg
    ? `알 · 부화까지 ${v.hatch}%`
    : `${currentPet().name} · ${v.age}살 ${v.title}` + (v.badge ? ` · ${v.badge}` : ''));
}

/* ---------- away ----------
   The pet has no idea whether anyone is at the desk. Idle time says so:
   after a while alone it curls up, and when input comes back it wakes and
   says hello. This is the difference between a screensaver and a pet. */
let awayNapping = false;
let awayTimer = null;

function idleSeconds() {
  try { return powerMonitor.getSystemIdleTime(); }
  catch (e) { return 0; }              // unsupported platform: never away
}

function awayTick() {
  if (!cfg.away.enabled) {
    if (awayNapping) wakeFromAway();
    return;
  }
  const c = careState();
  if (c.egg) return;
  const idle = idleSeconds();

  if (!awayNapping && idle >= cfg.away.minutes * 60) {
    if (c.sleeping) return;            // already down for another reason
    awayNapping = true;
    c.sleeping = true;
    c.autoSleep = true;
    saveConfig();
    pushCare();
    return;
  }
  if (awayNapping && idle < 30) wakeFromAway();
}

function wakeFromAway() {
  const c = careState();
  awayNapping = false;
  // a night nap outlasts a return to the desk
  const night = cfg.night.enabled &&
                care.isNight(Date.now(), cfg.night.from, cfg.night.to);
  if (c.sleeping && c.autoSleep && !night) {
    c.sleeping = false;
    delete c.autoSleep;
    saveConfig();
    pushCare();
    say(chatter.reactLine('back'), 'react', true);
  }
}

function startCare() {
  careTick(false);                       // catch up on time spent closed
  saveConfig();
  pushCare();
  if (careTimer) clearInterval(careTimer);
  careTimer = setInterval(() => {
    careTick();
    chatterTick();
    teachTick();
    stretchTick();
  }, 60 * 1000);
  // idle is polled faster than the care clock so coming back is noticed
  // in seconds rather than in a minute
  if (awayTimer) clearInterval(awayTimer);
  awayTimer = setInterval(awayTick, 15 * 1000);
}

/* Everything the pet says goes through here. Speech is a bubble only —
   never an OS notification, which is reserved for calendar reminders. */
function say(line, kind, force) {
  if (!line || !cfg.chat.enabled) return;
  // Eggs are kept quiet by chatterTick(), not here: warming one does get
  // an answer, and it comes through this path.
  // A reaction answers something the user just did, so it replaces
  // whatever is on screen instead of being swallowed by it — being
  // silent for nine seconds after every line read as the pet only
  // speaking once. It also survives the sleeping gate, since going to
  // sleep is itself a thing worth saying goodnight to.
  if (!force && (bubbleActive() || careState().sleeping)) return;
  lastSpoke = Date.now();
  showBubble({ kind: kind || 'chat', head: speakerLine(), lines: [line], quiet: true });
}

/* A reaction to something the user just did. Always welcome, so it skips
   the pacing that idle chatter obeys. */
function reactTo(what) {
  const c = careState();
  say(chatter.reactLine(what, { mood: care.mood(c), personality: care.personality(c) }),
      'react', true);
}

/* ---------- 처음 켰을 때 ----------
 * 팀에 나눠 준 앱이라 새로 받는 사람이 계속 생긴다. 창을 하나 더 띄우는
 * 대신 말풍선으로 세 번만 일러 주고 끝낸다 — 읽지 않아도 손해가 없고,
 * 한 번 한 말은 다시 하지 않는다.
 *
 * 조건은 '언제 알면 쓸모 있는가'로 잡았다. 막대 이야기는 부화한 뒤에,
 * 이정표 이야기는 첫 생일을 맞은 뒤에 해야 알아들을 수 있다. */
const LESSONS = [
  { id: 'egg',   when: (c) => c.egg,
    line: '알을 톡톡 눌러 주면 더 빨리 깨어나요.' },
  { id: 'ring',  when: (c) => !c.egg,
    line: '저를 가리키면 아래에 막대가 나와요. 밥과 놀기는 거기서요.' },
  { id: 'care',  when: (c) => !c.egg && c.age >= 2,
    line: '막대의 「정보」를 누르면 돌보기 창이에요. 이정표도 거기 있어요.' }
];

function teachTick() {
  if (!cfg.chat.enabled || bubbleActive()) return;
  const c = careState();
  if (c.sleeping) return;
  const lesson = LESSONS.find((l) => !cfg.taught[l.id] && l.when(c));
  if (!lesson) return;
  cfg.taught[lesson.id] = true;
  saveConfig();
  say(lesson.line, 'chat', true);
}

/* ---------- 오래 앉아 있으면 ----------
 * 자리를 비우면 재우는 것의 반대편. 자리를 뜨지 않고 계속 앉아 있으면
 * 한 번 부른다. 기본은 꺼져 있다.
 *
 * '앉아 있었는지'는 시계가 아니라 유휴 시간으로 잰다 — 앱을 켜 둔 채
 * 자리를 비운 사람에게 스트레칭하라고 하면 안 된다. */
let sittingSince = Date.now();
let lastStretch = 0;

function stretchTick() {
  if (!cfg.stretch.enabled) { sittingSince = Date.now(); return; }
  const idle = idleSeconds();
  // 5분 넘게 손을 놓았으면 이미 쉰 것이다 — 앉은 시간을 다시 센다
  if (idle > 5 * 60) { sittingSince = Date.now(); return; }
  const now = Date.now();
  const sat = (now - sittingSince) / 60000;
  if (sat < cfg.stretch.minutes) return;
  if (now - lastStretch < cfg.stretch.minutes * 60 * 1000) return;
  lastStretch = now;
  sittingSince = now;
  const c = careState();
  if (c.egg || c.sleeping) return;
  say(Math.round(sat) + '분째 앉아 계세요. 저랑 같이 좀 움직일까요?', 'react', true);
  setPose('waving', true);
  setTimeout(() => setPose('idle'), 2200);
}

/* Needs outrank small talk, and small talk only happens when nothing is
   actually wrong — a pet that whines constantly gets muted or closed. */
function chatterTick() {
  if (bubbleActive() || careState().sleeping || careState().egg || !cfg.chat.enabled) return;
  const now = Date.now();

  const want = care.wants(careState());
  if (want) {
    if (now - lastWant < 45 * 60 * 1000) return;
    lastWant = now;
    return say(chatter.needLine(want.key), 'want');
  }

  if (now - lastSpoke < 15 * 60 * 1000) return;
  if (Math.random() > 0.4) return;              // not every window, either

  const today = new Date(now).toDateString();
  const greeted = cfg.chat.greetedOn === today;
  say(chatter.idleLine(greeted, care.personality(careState())), 'chat');
  if (!greeted) { cfg.chat.greetedOn = today; saveConfig(); }
}

/* How many times anyone in the house has been fed. Cooking is the owner's
   skill, not the animal's, so a new pet does not send you back to plain
   rice — it counts across every pet in the save. */
function cooked(field) {
  return petIds().reduce((n, k) => n + (cfg.pets[k].care[field] || 0), 0);
}

/* Which dish or game. A named one is checked against what has actually
   been learned — the window disables the rest, but the rule has to hold
   without it. With nothing named (the hover bar's buttons) it picks what
   the pet likes, out of what you know. */
const LAST_KEY = { meals: 'lastMeal', snacks: 'lastSnack', plays: 'lastPlay' };

function pickFor(list, field, kind) {
  const known = care.learned(list, cooked(field));
  if (kind) return known.some((f) => f.id === kind) ? kind : null;
  const c = careState();
  const fav = care.favourite(c, known);
  if (fav) return fav.id;
  const last = c[LAST_KEY[field]];
  if (known.some((f) => f.id === last)) return last;
  return known[0].id;
}

function doAct(what, kind) {
  const c = careState();
  careTick(false);
  let r;
  if (what === 'feed') {
    const dish = pickFor(care.MEALS, 'meals', kind);
    if (!dish) return;                         // nobody has learned it yet
    r = care.actFeed(c, dish);
  } else if (what === 'snack') {
    const dish = pickFor(care.SNACKS, 'snacks', kind);
    if (!dish) return;
    r = care.actSnack(c, dish);
  } else if (what === 'play') {
    const game = pickFor(care.PLAYS, 'plays', kind);
    if (!game) return;
    r = care.actPlay(c, game);
  }
  else if (what === 'walk') r = care.actWalk(c);
  else if (what === 'sleep') r = care.actSleep(c);
  else if (what === 'clean') r = care.actClean(c);
  else if (what === 'train') r = care.actTrain(c);
  else return;

  saveConfig();
  pushCare();

  if (!r.ok) return;
  if (win && !win.isDestroyed() && !c.sleeping) {
    // feed/play get their own animation + prop (bowl, ball) so the action
    // is legible at a glance instead of reusing the generic wave/jump
    const anim = what === 'feed' ? 'eating'
               : what === 'snack' ? 'snacking'
               : what === 'play' ? 'playing'
               : what === 'walk' ? 'walking'
               : what === 'train' ? 'training' : 'waving';
    const holdMs = what === 'feed' ? 2200 : what === 'snack' ? 1600
                 : what === 'play' ? 2600 : what === 'walk' ? 4200
                 : what === 'train' ? 2400 : 1600;
    setPose(anim, true, r.food || r.play || null);   // wakes it on purpose
    zoomForAction(holdMs);
    setTimeout(() => setPose('idle'), holdMs);
  }
  if (what === 'sleep') reactTo(c.sleeping ? 'sleep' : 'wake');
  else if (what === 'train') reactTo(r.learned ? 'trickWin' : 'trickMiss');
  else if (what === 'walk') reactTo(r.found ? 'walkFind' : 'walk');
  else reactTo(what);

  checkMissions();

  if (r.learned) {
    // let it finish concentrating first: an announcement forces the
    // waving pose, which would wipe out the training animation
    const line = currentPet().name + care.ga(currentPet().name) +
                 ' 「' + r.learned + '」' + care.eul(r.learned) + ' 익혔어요';
    setTimeout(() => {
      showBubble({ kind: 'age', head: '재주를 배웠어요', lines: [line] });
    }, 2400);
  }

  if (r.aged) {
    showBubble({
      kind: 'age',
      head: '생일 축하해요',
      lines: (function () {
        const title = care.titleFor(c.age);
        return [currentPet().name + ' · ' + c.age + '살 ' + title + care.ga(title) + ' 됐어요'];
      })()
    });
  }
}

/* ---------- the hover bar ---------- */
function ensureRing() {
  if (ringWin && !ringWin.isDestroyed()) return ringWin;
  ringWin = new BrowserWindow({
    width: RING_W, height: RING_H,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, show: false, thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'ring-preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  ringWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ringWin.setAlwaysOnTop(true, 'screen-saver');
  ringWin.loadFile(path.join(__dirname, 'renderer', 'ring.html'));
  ringWin.on('closed', () => { ringWin = null; });
  return ringWin;
}

function placeRing() {
  if (!ringWin || ringWin.isDestroyed() || !win || win.isDestroyed()) return;
  const p = win.getBounds();
  const area = screen.getDisplayMatching(p).workArea;
  const w = ringSize.w, h = ringSize.h;
  let x = Math.round(p.x + p.width / 2 - w / 2);
  x = Math.max(area.x + 4, Math.min(area.x + area.width - w - 4, x));
  // The bubble sits above the pet too, so the bar used to be hidden
  // outright whenever the pet spoke — which, now that it chatters, meant
  // the buttons kept vanishing for nine seconds at a time. Step below the
  // pet instead of disappearing.
  const above = p.y - h + 6;
  const below = p.y + p.height - 6;
  const fits = (v) => v >= area.y + 4 && v <= area.y + area.height - h - 4;
  let y = bubbleActive() ? below : above;
  if (!fits(y)) y = (y === below) ? above : below;
  y = Math.max(area.y + 4, Math.min(area.y + area.height - h - 4, y));
  ringWin.setBounds({ x, y, width: w, height: h });
}

/* The bar's preferred side depends on whether the bubble is up, so it
   has to be re-placed the moment that changes. */
function reflowRing() {
  if (ringWin && !ringWin.isDestroyed() && ringWin.isVisible()) placeRing();
}

function updateRing() {
  const shouldShow = overPet || overRing;
  if (ringHide) { clearTimeout(ringHide); ringHide = null; }
  if (shouldShow) {
    const r = ensureRing();
    placeRing();
    r.webContents.send('ring-state', carePayload());
    if (!r.isVisible()) r.showInactive();
    return;
  }
  // a grace period, or the bar vanishes while the pointer travels to it
  ringHide = setTimeout(() => {
    ringHide = null;
    if (ringWin && !ringWin.isDestroyed() && !overPet && !overRing) ringWin.hide();
  }, 400);
}

ipcMain.on('ring-hover', (_e, over) => { overRing = !!over; updateRing(); });

ipcMain.on('ring-size', (_e, w, h) => {
  const nw = Math.max(RING_W, Math.min(560, w || RING_W));
  const nh = Math.max(RING_H, Math.min(220, h || RING_H));
  if (nw === ringSize.w && nh === ringSize.h) return;
  ringSize = { w: nw, h: nh };
  placeRing();
});
ipcMain.on('care-open', () => openCare());
ipcMain.on('care-act', (_e, what, kind) => doAct(what, kind));
ipcMain.on('care-clean', (_e, id) => {
  const c = careState();
  careTick(false);
  const r = care.actClean(c, id);
  saveConfig();
  pushCare();
  if (r.ok) {
    setPose('waving');
    setTimeout(() => setPose('idle'), 1200);
    reactTo('clean');
  }
});

// the renderer handles petting locally; it tells us so the pet can answer
/* Petting is a deliberate thing the user did, so it always gets an
   answer — the coin flip here read as the feature being broken. Repeats
   are held back by the bubble already being up, not by chance. */
ipcMain.on('patted', () => {
  const c = careState();
  if (c.egg) {
    // warming the egg is the only thing you can do for it
    const r = care.warmEgg(c);
    if (r !== 'soon') saveConfig();
    if (r === 'hatched') { cfg.eggKey = null; announceHatch(); }
    else if (r === 'warmed') {
      // Do NOT mark this window as prompted: the key IS lastWarm, and
      // stamping it here made the key of the *next* window match the one
      // already asked for, so the egg only ever asked once.
      say(chatter.reactLine('warm'), 'react', true);
    }
    pushCare();
    return;
  }
  care.actPat(c);
  saveConfig();
  reactTo('pat');
});
/* Deliberately starting over. The care window asks twice before it
   sends this, so there is no second confirmation here. */
/* Asking for a new egg costs nothing when a pet has already hatched —
   it stays in the roster. But if one is still in the shell, the warmth
   it has collected goes with it, and that is worth stopping for. */
function askNewEgg(parent) {
  const c = careState();
  if (!c.egg) return newEgg(true);

  const pct = Math.round(care.hatchProgress(c) * 100);
  dialog.showMessageBox(parent && !parent.isDestroyed() ? parent : undefined, {
    type: 'warning',
    buttons: ['취소', '새 알 받기'],
    defaultId: 0,      // the safe one is focused
    cancelId: 0,
    noLink: true,      // Windows renders 2+ buttons as command links otherwise
    message: '지금 품고 있는 알이 사라져요',
    detail: `부화까지 ${pct}% 왔어요. 새 알을 받으면 이 알은 없어지고, 진행도 처음부터 다시 시작합니다.`
  }).then((r) => { if (r.response === 1) newEgg(true); });
  return true;
}

ipcMain.on('care-restart', (e) => {
  askNewEgg(BrowserWindow.fromWebContents(e.sender));
});

ipcMain.on('care-pick', (_e, key) => { showPet(key); });

/* Naming is most of what makes a pet yours. Trimmed, capped, and never
   allowed to be empty — an unnamed pet has nothing to put in a bubble. */
ipcMain.on('care-rename', (_e, name) => {
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
  if (!clean) return;
  const pet = currentPet();
  if (pet.name === clean) return;
  const was = pet.name;
  pet.name = clean;
  care.note(pet.care, 'name', was + ' → ' + clean);
  saveConfig();
  pushConfig();
  pushCare();
});

ipcMain.on('zoom-set', (_e, on) => {
  cfg.zoom.enabled = !!on;
  if (!cfg.zoom.enabled) animateZoom(1);
  saveConfig();
  pushCare();
});

ipcMain.on('away-set', (_e, on) => {
  cfg.away.enabled = !!on;
  if (!cfg.away.enabled && awayNapping) wakeFromAway();
  saveConfig();
  pushCare();
});

ipcMain.on('care-prop', (_e, slot, value) => { setPetSlot(slot, value); pushCare(); });
ipcMain.on('care-props-clear', () => {
  currentPet().props = { head: 'none', eyes: 'none', hand: 'none', body: 'none' };
  pushConfig();
  pushCare();
});
ipcMain.on('care-fur', (_e, hex) => {
  const list = (SPECIES.find((x) => x.key === (currentPet().species || cfg.species)) || {}).furs || [];
  // 목록에 없는 색은 받지 않는다 — 창에서 온 값이라도 그대로 믿지 않는다
  if (!list.some(([, v]) => String(v).toLowerCase() === String(hex).toLowerCase())) return;
  setPetField('fur', hex);
  pushCare();
});
ipcMain.on('care-eyes', (_e, v) => {
  if (!EYES.some(([, k]) => k === v)) return;
  setPetField('eyes', v);
  pushCare();
});

ipcMain.on('stretch-set', (_e, on) => {
  cfg.stretch.enabled = !!on;
  sittingSince = Date.now();          // 켠 순간부터 다시 센다
  lastStretch = 0;
  saveConfig();
  pushCare();
});

ipcMain.on('night-set', (_e, on) => {
  cfg.night.enabled = !!on;
  if (!cfg.night.enabled) {
    const c = careState();
    if (c.autoSleep) { c.sleeping = false; delete c.autoSleep; }
  }
  saveConfig();
  careTick();
});

ipcMain.on('chat-set', (_e, on) => {
  cfg.chat.enabled = !!on;
  saveConfig();
  pushCare();
});

ipcMain.on('care-ready', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed()) w.webContents.send('care-state', carePayload());
});

function openCare() {
  if (careWin && !careWin.isDestroyed()) {
    if (IS_MAC) app.focus({ steal: true });
    careWin.show(); careWin.focus();
    return;
  }
  careWin = new BrowserWindow({
    width: 480, height: 470, resizable: true, minWidth: 400, minHeight: 380,
    minimizable: false, maximizable: false, fullscreenable: false,
    title: '돌보기', frame: !IS_MAC,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    trafficLightPosition: IS_MAC ? { x: 14, y: 12 } : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'care-preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  careWin.setMenuBarVisibility(false);
  careWin.loadFile(path.join(__dirname, 'renderer', 'care.html'));
  careWin.once('ready-to-show', () => {
    if (IS_MAC) app.focus({ steal: true });
    careWin.show();
  });
  careWin.on('closed', () => { careWin = null; });
}

/* ------------------------------------------------------------------ *
 * tray
 * ------------------------------------------------------------------ */
function createTray() {
  // macOS wants a monochrome template icon; Windows/Linux want the coloured one
  const iconPath = path.join(__dirname, 'assets', IS_MAC ? 'trayTemplate.png' : 'tray.png');
  let img;
  try { img = nativeImage.createFromPath(iconPath); } catch (e) { img = nativeImage.createEmpty(); }
  if (!img.isEmpty()) img = img.resize({ width: IS_WIN ? 16 : 18, height: IS_WIN ? 16 : 18 });
  if (IS_MAC) img.setTemplateImage(true);

  tray = new Tray(img);
  tray.setToolTip(careState().egg ? '알' : `${currentPet().name} · ${currentSpecies().label}`);

  if (IS_WIN) {
    // Windows expects a persistent context menu and a left-click action
    tray.setContextMenu(buildMenu());
    tray.on('click', () => { tray.setContextMenu(buildMenu()); tray.popUpContextMenu(); });
    tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  } else {
    tray.on('click', () => tray.popUpContextMenu(buildMenu()));
    tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  }
}

/* ------------------------------------------------------------------ *
 * lifecycle
 * ------------------------------------------------------------------ */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) win.showInactive(); });

  // transparent windows need GPU compositing to behave on some Windows setups
  if (IS_WIN) app.commandLine.appendSwitch('enable-transparent-visuals');

  app.whenReady().then(() => {
    // optional: a client baked into the build so teammates never see the
    // setup fields. Absent in a plain checkout — the settings UI covers that.
    let builtInClient = null;
    try {
      builtInClient = JSON.parse(fs.readFileSync(path.join(__dirname, 'google-client.json'), 'utf8'));
    } catch (e) { /* no bundled client */ }
    googleAuth.init(app.getPath('userData'), builtInClient);
    loadConfig();
    saveConfig();          // materialise the file on first run so it can be hand-edited
    keepBackup();          // this parsed, so it is worth falling back to
    applyLaunchAtLogin();
    if (IS_MAC && app.dock) app.dock.hide();   // menu-bar only
    createWindow();
    createTray();
    startCalendar();
    startCare();
    startUpdates();
    if (startupNotice) {
      // after the windows exist, or there is nowhere to say it
      setTimeout(() => { showBubble(startupNotice); startupNotice = null; }, 2500);
    }
    screen.on('display-metrics-changed', () => {
      if (!win || win.isDestroyed()) return;
      const b = win.getBounds();
      const c = clampToDisplays(b.x, b.y, b.width, b.height);
      if (c.x !== b.x || c.y !== b.y) moveTo(c.x, c.y);
    });
  });

  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (!win) createWindow(); });

  /* ---------- smoke check ----------
     main.js is the one file no unit test can require: it needs Electron
     running. So a plain ReferenceError in a menu — a name that went out
     with a refactor — sits there until somebody right-clicks the pet.
     That is exactly what shipped in 1.24.0.

     `npm run smoke` boots the app, builds every menu and payload once,
     and exits non-zero on the first throw. It touches nothing the user
     owns: MOKA_SMOKE also forces a throwaway profile. */
  if (process.env.MOKA_SMOKE) app.whenReady().then(() => setTimeout(smokeCheck, 1200));
}

function smokeCheck() {
  const checks = [
    ['펫 우클릭 메뉴', () => buildMenu()],
    ['펫 창 payload', () => payload()],
    ['돌보기 payload', () => carePayload()],
    ['설정 payload', () => settingsPayload()],
    ['소품 목록', () => gearSlots()],
    ['집 꾸미기 목록', () => roomSlots()],
    ['이정표 진행도', () => MISSIONS.map((m) => missionNow(m))],
    ['가족 관계', () => petIds().map((a) => petIds().map((b) => pairProblem(a, b)))]
  ];

  /* Both halves of the save, because they take different paths. A brand
     new profile is holding an egg, and buildMenu() returns early for an
     egg — so a name missing from the grown-up half of the menu passed
     this check the first time it was written. */
  const worlds = [
    ['알을 품은 새 저장본', () => {}],
    ['부화 · 가족까지 있는 저장본', () => {
      const grown = (c) => {
        c.egg = false; c.age = 12; c.hunger = 80; c.fun = 80; c.energy = 80;
        c.tricks = care.TRICKS.slice(0, 3); c.bornAt = Date.now() - 86400000;
        return c;
      };
      const keys = SPECIES.slice(0, 2).map((sp) => sp.key);
      keys.forEach((k) => grown(cfg.pets[k].care));
      const kid = 'smoke-kid';
      cfg.pets[kid] = blankPet(keys[0]);
      cfg.pets[kid].parents = keys.slice();
      grown(cfg.pets[kid].care);
      cfg.pets[keys[0]].mate = keys[1];
      cfg.pets[keys[1]].mate = keys[0];
      cfg.eggKey = null;
      cfg.species = keys[0];
      cfg.missions.done = MISSIONS.map((m) => m.id);   // every prize unlocked
    }]
  ];

  let bad = 0;
  worlds.forEach(([label, setUp]) => {
    console.log('\n■ ' + label);
    try { setUp(); } catch (e) { bad += 1; console.error('  FAIL 준비 — ' + e.message); return; }
    checks.forEach(([name, run]) => {
      try { run(); console.log('  ok   ' + name); }
      catch (e) {
        bad += 1;
        console.error('  FAIL ' + name + ' — ' + (e && e.message));
        console.error(e && e.stack);
      }
    });
  });
  console.log(bad ? ('\n' + bad + ' failed') : '\n모두 통과');
  app.exit(bad ? 1 : 0);
}

