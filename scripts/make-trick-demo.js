#!/usr/bin/env node
/* ------------------------------------------------------------------
 * make-trick-demo.js — build a single self-contained page for trying
 * the tricks by hand.
 *
 * It has to be ONE file with everything inlined, because a browser
 * opening a file:// page cannot fetch its siblings — which is exactly
 * what the http-served harness (renderer/_tricks.html) relies on.
 *
 * The CSS is lifted out of renderer/index.html rather than copied, so
 * the demo can never show a pose the app does not actually do.
 *
 *   node scripts/make-trick-demo.js [output.html]
 * ------------------------------------------------------------------ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const out = process.argv[2] ||
  path.join(process.env.HOME, 'Desktop', '모카펫-동작-해보기.html');

const indexHtml = R('renderer/index.html');
/* sprite.css first: P.build() always emits every optional part, and that
   stylesheet is what hides the tear and the closed eyes. Leaving it out
   is why the first build of this page had a pet in tears. */
const appCss = R('renderer/sprite.css') + '\n' +
  indexHtml.slice(indexHtml.indexOf('<style>') + 7, indexHtml.indexOf('</style>'));

const libs = ['renderer/pixel.js', 'renderer/tint.js', 'renderer/gear.js',
              'renderer/species.js'].map(R).join('\n');

/* The bowls, snacks and toys are lifted VERBATIM out of index.html rather
   than retyped, so this page can never show a dish or a toy the app does
   not actually draw. Anchors are the `var NAME = ` lines; each block runs
   to the first line that closes it at two-space indent. */
function lift(name, kind) {
  const src = indexHtml;
  const head = kind === 'fn' ? '  function ' + name + '(' : '  var ' + name + ' = ';
  const at = src.indexOf(head);
  if (at < 0) throw new Error('make-trick-demo: ' + name + ' 를 index.html 에서 못 찾음');
  const close = kind === 'one' ? '];\n' : (kind === 'fn' ? '\n  }\n' : '\n  };\n');
  const end = src.indexOf(close, at);
  if (end < 0) throw new Error('make-trick-demo: ' + name + ' 의 끝을 못 찾음');
  return src.slice(at, end + close.length);
}
const foodArt = ['BOWL_BASE', 'CRUMB'].map((n) => lift(n, 'one')).join('') +
  lift('MEAL_ART', 'obj') + lift('SNACK_ART', 'obj') +
  lift('BALL', 'one') + lift('PLAY_ART', 'obj') +
  lift('bowlRows', 'fn');

/* 성장 사다리는 care.js 에서 끌어온다. 여기에 옮겨 적어 두면 칭호를
   늘렸을 때 이 페이지만 옛 여섯 단계를 보여 준다. */
const STAGES = (function () {
  const src = R('care.js');
  const rows = eval(src.match(/const TITLES = (\[[\s\S]*?\n\];)/)[1].replace(/;$/, ''));
  return rows.map(([, title, stage]) => [title, stage]);
})();

/* Kept in step with TRICK_POSE in main.js: same pose, same length. */
const TRICKS = [
  ['앉아', 'sit', 2600], ['손', 'paw', 2400], ['엎드려', 'lie', 2800],
  ['빙글', 'spin', 2200], ['점프', 'jump', 1800], ['인사', 'bow', 2000],
  ['기다려', 'stay', 2600], ['하이파이브', 'high', 2200],
  ['구르기', 'roll', 2000], ['노래', 'sing', 2800]
];
const OTHER = [
  ['훈련 중', 'training', 2400], ['손 흔들기', 'waving', 2000], ['자기', 'sleeping', 4000]
];
/* [버튼 이름, 동작, 종류, 길이] — main.js 의 doAct 와 같은 길이로 */
const FOOD = [
  ['한식', 'eating', 'korean', 2600], ['양식', 'eating', 'western', 2600],
  ['중식', 'eating', 'chinese', 2600], ['일식', 'eating', 'japanese', 2600],
  ['쿠키', 'snacking', 'cookie', 1800], ['과일', 'snacking', 'fruit', 1800],
  ['우유', 'snacking', 'milk', 1800], ['육포', 'snacking', 'jerky', 1800],
  ['아이스크림', 'snacking', 'icecream', 1800]
];
const GAMES = [
  ['공놀이', 'playing', 'ball', 2600], ['숨바꼭질', 'playing', 'hide', 2600],
  ['줄다리기', 'playing', 'tug', 2600], ['원반던지기', 'playing', 'disc', 2600]
];

const page = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>모카 펫 — 동작 해보기</title>
<style>
${appCss}

/* ---- undoing what the app window needs and a web page must not have ----
   index.html is a frameless transparent desktop pet: it sets
   html,body{pointer-events:none} so clicks fall THROUGH to whatever window
   is behind, and only #petRoot takes the mouse. Inheriting that verbatim
   made this whole page ignore the mouse — the buttons rendered, hovered
   nothing, and did nothing when clicked. (A programmatic .click() still
   fired, which is why the first round of checks said it worked.)
   It also pins the page to 100% height with overflow:hidden, which would
   clip the button pads on a short window. */
html,body{pointer-events:auto;overflow:auto;height:auto;cursor:default}

/* ---- the page around the pet, which the app itself has no need for ---- */
html,body{background:#EDE9E3}
body{margin:0;font:14px -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;
     color:#2b2b2b;display:flex;flex-direction:column;align-items:center;padding:22px 16px 40px}
h1{font-size:18px;margin:0 0 2px}
.sub{color:#777;font-size:12.5px;margin:0 0 18px}
.stage{background:#fff;border-radius:16px;box-shadow:0 2px 10px rgba(0,0,0,.07);
       width:340px;height:330px;display:flex;align-items:center;justify-content:center;position:relative}
#wrap{width:300px}
#stageSvg{width:100%;height:auto;display:block}
.now{position:absolute;left:0;right:0;bottom:10px;text-align:center;font-size:12px;color:#999}
.pads{width:min(560px,100%);margin-top:18px}
.lab{font-size:12px;color:#888;margin:14px 2px 6px}
.pad{display:flex;flex-wrap:wrap;gap:7px}
button{font:inherit;font-size:13px;padding:7px 13px;border-radius:999px;cursor:pointer;
       border:1px solid #D8D2C8;background:#fff;color:#2b2b2b}
button:hover{border-color:#A8763F;color:#A8763F}
button.on{background:#A8763F;border-color:#A8763F;color:#fff}
select{font:inherit;font-size:13px;padding:6px 10px;border-radius:10px;border:1px solid #D8D2C8;background:#fff}
.opts{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;width:min(560px,100%)}
.tip{color:#999;font-size:12px;margin-top:20px;max-width:560px;line-height:1.6}
</style></head>
<body>

<h1>동작 해보기</h1>
<p class="sub">앱에 들어 있는 것과 똑같은 동작입니다. 눌러 보세요.</p>

<div class="stage">
  <div id="wrap" data-state="idle" data-eyes="basic" style="--gx:0;--gy:0;--hx:0px;--hy:0px">
    <svg id="stageSvg" viewBox="-20 -40 280 300" xmlns="http://www.w3.org/2000/svg">
      <g id="groundShadow" shape-rendering="crispEdges">
        <rect x="90" y="215" width="60" height="5" fill="rgba(0,0,0,.15)"/>
        <rect x="70" y="220" width="100" height="5" fill="rgba(0,0,0,.15)"/>
        <rect x="90" y="225" width="60" height="5" fill="rgba(0,0,0,.15)"/>
      </g>
      <g id="petRoot"><g id="petAnim"></g></g>
      <g id="actionFx" shape-rendering="crispEdges"></g>
      <g id="zzz" shape-rendering="crispEdges"></g>
    </svg>
  </div>
  <div class="now" id="now">가만히</div>
</div>

<div class="pads">
  <div class="lab">재주 — 돌보기 창에서 가르치고 나면 쓸 수 있는 것들</div>
  <div class="pad" id="tricks"></div>
  <div class="lab">밥과 간식 — 종류마다 그릇에 담기는 것이 다릅니다</div>
  <div class="pad" id="food"></div>
  <div class="lab">놀기 — 놀이마다 다른 물건이 나옵니다</div>
  <div class="pad" id="games"></div>
  <div class="lab">그 밖의 동작</div>
  <div class="pad" id="other"></div>
</div>

<div class="opts">
  <select id="who"></select>
  <select id="stage"></select>
  <select id="build"></select>
  <select id="gear"></select>
</div>

<p class="tip">이 파일은 앱의 그림과 동작 규칙을 그대로 담고 있어서 인터넷 없이 혼자 돌아갑니다.
동작이 마음에 안 들면 어느 것이 어떻게 어색한지 알려주세요.</p>

<script>
${libs}
</script>
<script>
(function(){
  "use strict";
  var TRICKS = ${JSON.stringify(TRICKS)};
  var OTHER  = ${JSON.stringify(OTHER)};
  var FOOD   = ${JSON.stringify(FOOD)};
  var GAMES  = ${JSON.stringify(GAMES)};

${foodArt}
  var STAGES = ${JSON.stringify(STAGES)};
  var BUILDS = [['날씬','slim'],['보통','normal'],['통통','plump'],['포동포동','heavy']];
  var NOTE = ['..K.','..K.','KKK.','KK..'];
  var Z = ['KKKK','..K.','.K..','KKKK'];

  var wrap = document.getElementById('wrap');
  var svgEl = document.getElementById('stageSvg');
  var petAnim = document.getElementById('petAnim');
  var actionFx = document.getElementById('actionFx');
  var now = document.getElementById('now');
  var zzzLayer = document.getElementById('zzz');
  var timer = null;

  function fill(sel, rows, chosen){
    sel.innerHTML = rows.map(function(r){
      return '<option value="'+r[1]+'"'+(r[1]===chosen?' selected':'')+'>'+r[0]+'</option>';
    }).join('');
  }

  var who = document.getElementById('who');
  fill(who, window.SPECIES.list.map(function(s){ return [s.label, s.key]; }), 'capybara');
  var stage = document.getElementById('stage'); fill(stage, STAGES, 'adult');
  var build = document.getElementById('build'); fill(build, BUILDS, 'normal');
  var gear  = document.getElementById('gear');

  function gearOptions(){
    var rows = [['소품 없음','none']];
    (window.GEAR.slots).forEach(function(slot){
      var items = window.GEAR.items[slot] || {};
      Object.keys(items).forEach(function(k){
        rows.push([window.GEAR.labels[slot] + ' · ' + items[k].label, slot + ':' + k]);
      });
    });
    fill(gear, rows, 'none');
  }
  gearOptions();

  /* 엎드려 and 자기 are not the standing rig bent into shape — the app
     swaps the whole drawing for the lying sprite (index.html
     applySleepSprite). This page has to do the same, or it shows a pose
     the app never actually strikes. */
  var LYING = { lie: 1, sleeping: 1 };
  var current = 'idle';

  function render(){
    var sp = window.SPECIES.at(who.value, stage.value, build.value);
    petAnim.innerHTML = (LYING[current] && sp.sleepMarkup)
      ? ((current === 'lie' && sp.lieMarkup) ? sp.lieMarkup() : sp.sleepMarkup())
      : sp.markup();
    wrap.toggleAttribute('data-sleepart', !!(LYING[current] && sp.sleepMarkup));
    wrap.setAttribute('data-species', sp.key);
    var t = window.TINT.vars({ fur: sp.fur, belly: sp.belly }, sp);
    Object.keys(t).forEach(function(k){ svgEl.style.setProperty(k, t[k]); });
    var o = sp.origins || {};
    Object.keys(o).forEach(function(k){ svgEl.style.setProperty('--o-'+k, o[k]); });
    wearGear();
  }

  function wearGear(){
    var pick = gear.value.split(':');
    window.GEAR.slots.forEach(function(slot){
      var host = petAnim.querySelector('#' + (slot === 'head' ? 'prop' : 'slot-' + slot));
      if(!host) return;
      var want = (pick[0] === slot) ? pick[1] : null;
      for(var i=0;i<host.children.length;i++){
        host.children[i].style.display =
          (host.children[i].getAttribute('data-gear') === want) ? '' : 'none';
      }
    });
  }

  function crumbs(){
    var P = window.PIXEL;
    return '<g class="fx-crumb">' + P.encode(CRUMB, 16, 34) + '</g>' +
           '<g class="fx-crumb c2">' + P.encode(CRUMB, 31, 35) + '</g>';
  }

  function fx(state, kind){
    var P = window.PIXEL;
    if(state === 'training') return '<g class="fx-note">' + P.encode(NOTE, 34, 6) + '</g>';
    if(state === 'sing') return '<g class="fx-note">' + P.encode(NOTE, 34, 6) + '</g>' +
      '<g class="fx-note n2">' + P.encode(NOTE, 8, 9) + '</g>' +
      '<g class="fx-note n3">' + P.encode(NOTE, 38, 2) + '</g>';
    if(state === 'eating')
      return '<g class="fx-bowl">' + P.encode(bowlRows(kind || 'korean', 0), 17, 29) + '</g>';
    if(state === 'snacking')
      return '<g class="fx-treat">' + P.encode(SNACK_ART[kind] || SNACK_ART.cookie, 21, 29) + '</g>';
    if(state === 'playing'){
      var toy = PLAY_ART[kind] || PLAY_ART.ball;
      return '<g class="' + toy.cls + '">' + P.encode(toy.rows, toy.x, toy.y) + '</g>';
    }
    return '';
  }

  /* 밥은 앱에서 세 단계로 줄어든다. 데모도 같은 시간표로 줄여 보여준다. */
  var eatTimers = [];
  function eatingSteps(kind){
    eatTimers.forEach(clearTimeout); eatTimers = [];
    [[750, 1], [1500, 2]].forEach(function(step){
      eatTimers.push(setTimeout(function(){
        actionFx.innerHTML =
          '<g class="fx-bowl">' + window.PIXEL.encode(bowlRows(kind, step[1]), 17, 29) + '</g>' + crumbs();
      }, step[0]));
    });
  }

  function play(label, state, ms, btn, kind){
    if(timer) clearTimeout(timer);
    document.querySelectorAll('.pad button').forEach(function(b){ b.classList.remove('on'); });
    if(btn) btn.classList.add('on');
    // restart from idle so pressing the same one twice replays it
    current = 'idle';
    render();
    wrap.setAttribute('data-state', 'idle');
    wrap.removeAttribute('data-play');
    actionFx.innerHTML = '';
    zzzLayer.innerHTML = '';
    void wrap.offsetWidth;
    current = state;
    render();
    wrap.setAttribute('data-state', state);
    // 앱과 같은 갈래: 놀이는 종류마다 몸짓이 다르다
    if(state === 'playing') wrap.setAttribute('data-play', kind || 'ball');
    else wrap.removeAttribute('data-play');
    actionFx.innerHTML = fx(state, kind);
    eatTimers.forEach(clearTimeout); eatTimers = [];
    if(state === 'eating') eatingSteps(kind || 'korean');
    if(state === 'snacking') eatTimers.push(setTimeout(function(){ actionFx.innerHTML = crumbs(); }, 900));
    // the Z's are what tell 자기 apart from 엎드려 — the drawing is the same
    zzzLayer.innerHTML = (state === 'sleeping')
      ? '<g class="fx-z">'    + window.PIXEL.encode(Z, 32, 7) + '</g>' +
        '<g class="fx-z z2">' + window.PIXEL.encode(Z, 36, 3) + '</g>' +
        '<g class="fx-z z3">' + window.PIXEL.encode(Z, 40, -1) + '</g>'
      : '';
    now.textContent = label;
    timer = setTimeout(function(){
      current = 'idle';
      render();
      wrap.setAttribute('data-state', 'idle');
      wrap.removeAttribute('data-play');
      eatTimers.forEach(clearTimeout); eatTimers = [];
      actionFx.innerHTML = '';
      zzzLayer.innerHTML = '';
      now.textContent = '가만히';
      if(btn) btn.classList.remove('on');
      timer = null;
    }, ms);
  }

  function pad(host, rows, kinded){
    rows.forEach(function(r){
      var b = document.createElement('button');
      b.textContent = r[0];
      var state = r[1], kind = kinded ? r[2] : null, ms = kinded ? r[3] : r[2];
      b.addEventListener('click', function(){ play(r[0], state, ms, b, kind); });
      host.appendChild(b);
    });
  }
  pad(document.getElementById('tricks'), TRICKS);
  pad(document.getElementById('food'), FOOD, true);
  pad(document.getElementById('games'), GAMES, true);
  pad(document.getElementById('other'), OTHER);

  [who, stage, build].forEach(function(s){ s.addEventListener('change', render); });
  gear.addEventListener('change', wearGear);
  render();
})();
</script>
</body></html>
`;

fs.writeFileSync(out, page);
console.log(out + '  (' + Math.round(page.length / 1024) + ' KB)');
