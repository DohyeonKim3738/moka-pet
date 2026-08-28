/* care.js 단위 테스트 — `node test/care.test.js`
 *
 * 앱을 띄우지 않고 키우기 규칙만 검증한다. 화면 없이 확인할 수 있는 것은
 * 전부 여기서 걸러내고, 실제 앱 검증은 눈에 보이는 것에만 쓴다. */
const care = require('../care.js');
const fs = require('fs');
const path = require('path');

/* blank() 는 알로 시작하므로, 알 자체를 보는 테스트가 아니면 부화시켜 쓴다 */
const hatched = () => { const c = care.blank(); care.hatch(c); return c; };

let pass = 0, fail = 0;
const H = 3600000;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

console.log('# 소진 속도');
let c = hatched(); c.lastTick = Date.now() - 4 * H;
care.advance(c, Date.now());
ok('배고픔 4시간이면 0', Math.round(c.hunger) === 0, c.hunger);
c = hatched(); c.lastTick = Date.now() - 2 * H;
care.advance(c, Date.now());
ok('배고픔 2시간이면 절반', Math.abs(c.hunger - 50) < 1, c.hunger);
ok('에너지는 더 천천히 준다', c.energy > c.hunger, { e: c.energy, h: c.hunger });

console.log('# 오프라인 상한 (벌 없음)');
let a = hatched(); a.lastTick = Date.now() - 12 * H; care.advance(a, Date.now());
let b = hatched(); b.lastTick = Date.now() - 200 * H; care.advance(b, Date.now());
ok('12시간과 200시간 결과가 같다', Math.round(a.hunger) === Math.round(b.hunger));
ok('응아는 최대 4개', b.poops.length <= 4, b.poops.length);

console.log('# 경험치는 필요할 때만');
c = hatched();                          // 배부른 상태
let r = care.actFeed(c);
ok('배부를 때 밥은 거부', r.ok === false, r);
c.hunger = 10;
r = care.actFeed(c);
ok('배고플 때 밥은 경험치', r.ok && r.gain > 0, r);
c.hunger = 92;
r = care.actFeed(c);
ok('거의 부를 땐 경험치가 적다', !r.ok || r.gain < 8, r);
ok('밥 먹으면 배고픔이 오른다', c.hunger > 50, c.hunger);

console.log('# 하루 획득에 상한이 없다');
c = hatched();
for (let i = 0; i < 60; i++) { c.hunger = 0; care.actFeed(c); }
ok('자주 돌보면 계속 오른다', c.dayExp > 200, c.dayExp);
{
  // ...but only because you kept emptying it. Left alone, a second round
  // straight after a first is worth almost nothing — the clock is the limit.
  const d = hatched();
  d.hunger = 0; d.fun = 0; d.energy = 100; d.poops = [{ id: 'a', x: 1 }];
  const round = (x) => [care.actFeed, care.actPlay, care.actClean, care.actSnack]
    .reduce((n, f) => n + ((f(x, 'a') || {}).gain || 0), 0);
  const first = round(d), second = round(d);
  ok('연달아 하면 거의 안 오른다', second < first / 2, first + ' → ' + second);
}

console.log('# 나이');
c = hatched();
ok('1살로 시작', c.age === 1);
ok('다음 나이 요구량이 나이와 함께 는다',
   care.needFor(2) < care.needFor(10) && care.needFor(10) < care.needFor(30),
   [care.needFor(2), care.needFor(10), care.needFor(30)]);
c.dayExp = 0; c.exp = care.needFor(1) - 1; c.hunger = 0;
r = care.actFeed(c);
ok('경험치가 차면 나이가 오른다', c.age === 2 && r.aged === true, { age: c.age, r });
ok('상한 없이 계속 오른다', care.titleFor(500) === '전설');

console.log('# 잠');
c = hatched(); c.energy = 20;
r = care.actSleep(c);
ok('지쳤을 때 재우면 잠든다', r.ok && c.sleeping === true);
c.lastTick = Date.now() - 2 * H; care.advance(c, Date.now());
ok('2시간 자면 에너지 회복', c.energy >= 99, c.energy);
ok('다 자면 스스로 깬다', c.sleeping === false);

console.log('# 청소');
c = hatched();
c.poops = [{ id: 'x', x: 2 }, { id: 'y', x: 44 }];
r = care.actClean(c, 'x');
ok('지정한 응아만 치운다', c.poops.length === 1 && c.poops[0].id === 'y');
ok('청소도 경험치', r.gain > 0, r);
care.actClean(c, 'y');
r = care.actClean(c);
ok('치울 게 없으면 거부', r.ok === false);

console.log('# 손상된 저장값 복구');
const bad = care.normalize({ hunger: 'NaN', age: -5, poops: 'nope', exp: null });
ok('이상한 값도 안전하게 정규화', bad.hunger === 100 && bad.age === 1 && Array.isArray(bad.poops), bad);

console.log('# 조사(이/가) 선택');
[['아기', '가'], ['어린이', '가'], ['청소년', '이'], ['어른', '이'], ['장로', '가'], ['전설', '이']]
  .forEach(([w, expect]) => ok(w + ' -> ' + expect, care.ga(w) === expect, care.ga(w)));

console.log('# 알');
{
  const e = care.blank();
  ok('새 펫은 알로 시작', e.egg === true && care.stageFor(e) === 'egg');
  ok('알은 조르지 않는다', care.wants(e) === null);
  ok('알에는 밥을 줄 수 없다', care.actFeed(e).ok === false);
  e.lastTick = Date.now() - 6 * H;
  care.advance(e, Date.now());
  ok('알은 배고파지지도 더러워지지도 않는다',
     e.hunger === 100 && e.poops.length === 0, { hunger: e.hunger, poops: e.poops.length });

  const spam = care.blank();
  for (let i = 0; i < 50; i++) care.warmEgg(spam);
  ok('연타해도 한 번만 먹힌다', spam.eggTaps === 1 && spam.egg === true, spam.eggTaps);

  const w = care.blank();
  for (let i = 0; i < 9; i++) { w.lastWarm = 0; care.warmEgg(w); }   // 간격을 둔 셈
  ok('간격을 두고 9번이면 아직', w.egg === true, care.hatchProgress(w));
  w.lastWarm = 0;
  ok('10번째에 부화한다', care.warmEgg(w) === 'hatched' && w.egg === false);
  ok('부화하면 1살 아기', w.age === 1 && care.stageFor(w) === 'baby');

  const t = care.blank();
  t.eggAt = Date.now() - 21 * 60000;
  care.advance(t, Date.now());
  ok('20분 지나면 저절로 부화', t.egg === false);

  const old = care.normalize({ age: 7, exp: 40, hunger: 80 });
  ok('알 이전 저장본은 알로 되돌아가지 않는다', old.egg === false && old.age === 7);

  const rr = hatched(); rr.age = 9;
  care.reset(rr);
  ok('처음부터 다시 하면 알로 돌아간다', rr.egg === true && rr.age === 1);
}

console.log('# 성장 단계표');
{
  const t = care.stageTable();
  ok('알에서 시작해 전설로 끝난다',
     t[0].stage === 'egg' && t[t.length - 1].stage === 'legend', t.map(x => x.stage));
  /* 사다리 전체를 한 줄로 못 박는다. 예전에는 t[1]/t[2]/t[4]/t[6] 처럼
     자리를 짚어 봤는데, 칭호를 가운데 하나 끼우면 짚던 자리가 밀려
     "8살이 어른"이 아니라 엉뚱한 칸을 보면서도 통과한다. */
  const ladder = t.map((x) => x.title + ':' + x.stage + ':' + x.from).join(' ');
  ok('사다리가 통째로 그대로다',
     ladder === '알:egg:null 아기:baby:1 어린이:child:3 청소년:teen:5 ' +
                '어른:adult:8 장로:elder:15 원로:sage:20 현자:wise:24 ' +
                '영물:spirit:27 전설:legend:30', ladder);
  ok('칭호마다 그림 단계가 다르다',
     new Set(t.map((x) => x.stage)).size === t.length);
  [[7, '청소년'], [8, '어른'], [14, '어른'], [15, '장로'], [19, '장로'],
   [20, '원로'], [23, '원로'], [24, '현자'], [26, '현자'],
   [27, '영물'], [29, '영물'], [30, '전설']].forEach(([age, want]) => {
    ok(age + '살은 ' + want, care.titleFor(age) === want, care.titleFor(age));
  });

  const e = care.blank();
  ok('알의 다음은 아기', care.nextStage(e).stage === 'baby');
  const b = care.blank(); care.hatch(b);
  ok('아기의 다음은 어린이 3살', care.nextStage(b).stage === 'child' && care.nextStage(b).from === 3);
  const L = care.blank(); care.hatch(L); L.age = 40;
  ok('전설 다음은 없다', care.nextStage(L) === null);

  ok('지금 쓰다듬기가 먹히는지 알 수 있다', care.canWarm(e) === true);
  care.warmEgg(e);
  ok('쓰다듬은 직후에는 안 먹힌다', care.canWarm(e) === false);
  ok('부화한 뒤에는 해당 없음', care.canWarm(b) === false);
}

console.log('# 성장 속도');
{
  ok('나이 요구량이 선형으로 는다',
     care.needFor(2) - care.needFor(1) === care.needFor(9) - care.needFor(8),
     [care.needFor(1), care.needFor(2), care.needFor(8), care.needFor(9)]);
  let total = 0; const days = {};
  for (let age = 1; age < 30; age++) { total += care.needFor(age); days[age + 1] = total / 150; }
  ok('아기 단계가 닷새는 간다', days[3] >= 4 && days[3] <= 8, days[3]);
  ok('어른까지 한 달은 넘는다', days[8] > 30, days[8]);
  ok('전설은 일 년쯤 걸린다', days[30] > 300, days[30]);
  ok('등급 경계', care.titleFor(1) === '아기' && care.titleFor(3) === '어린이' &&
     care.titleFor(8) === '어른' && care.titleFor(30) === '전설');
}

console.log('# 무게와 체형');
{
  const base5 = care.baseWeight(5);
  const mk = () => { const c = hatched(); c.age = 5; c.weight = base5; c.dayExp = 0; return c; };

  const snacky = mk();
  for (let i = 0; i < 4; i++) { snacky.hunger = 40; care.actFeed(snacky); }
  for (let i = 0; i < 4; i++) { snacky.hunger = 40; care.actSnack(snacky); }
  ok('간식만 주면 살이 붙는다', snacky.weight > base5 + 0.8, snacky.weight);

  const sporty = mk();
  for (let i = 0; i < 8; i++) { sporty.fun = 30; sporty.energy = 90; care.actPlay(sporty); }
  ok('많이 놀면 빠진다', sporty.weight < base5 - 0.5, sporty.weight);

  const even = mk();
  for (let i = 0; i < 4; i++) { even.hunger = 40; care.actFeed(even); }
  for (let i = 0; i < 4; i++) { even.fun = 30; even.energy = 90; care.actPlay(even); }
  ok('균형 있게 키우면 보통', care.weightBand(even) === 'normal', even.weight);

  const heavy = mk(); heavy.weight = base5 * 1.5;
  ok('밴드는 나이 기준으로 잰다', care.weightBand(heavy) === 'heavy');
  const cub = hatched(); cub.age = 1; cub.weight = base5 * 1.5;
  ok('같은 무게라도 어릴수록 무겁다고 본다', care.weightBand(cub) === 'heavy');

  const floor = mk();
  for (let i = 0; i < 200; i++) { floor.fun = 0; floor.energy = 90; care.actPlay(floor); }
  ok('아무리 놀아도 바닥은 있다', floor.weight >= base5 * 0.5, floor.weight);
}

console.log('# 성격');
{
  const loved = hatched(); loved.age = 5;
  for (let i = 0; i < 20; i++) care.actPat(loved);
  ok('쓰다듬으면 다정해진다', care.personality(loved) === '다정');

  const fed = hatched(); fed.age = 5;
  for (let i = 0; i < 20; i++) { fed.hunger = 40; care.actSnack(fed); }
  ok('간식만 주면 먹보', care.personality(fed) === '먹보');

  const baby = hatched(); baby.age = 2;
  for (let i = 0; i < 20; i++) care.actPat(baby);
  ok('아기는 아직 성격이 없다', care.personality(baby) === null);

  const mixed = hatched(); mixed.age = 5;
  for (let i = 0; i < 10; i++) { care.actPat(mixed); mixed.fun = 30; mixed.energy = 90; care.actPlay(mixed); }
  ok('고루 키우면 평범', care.personality(mixed) === '평범', JSON.stringify(mixed.traits));

  const fresh = hatched(); fresh.age = 5;
  ok('아무것도 안 했으면 평범', care.personality(fresh) === '평범');
}

console.log('# 재주');
{
  const c2 = hatched(); c2.age = 2;
  ok('어리면 못 배운다', care.actTrain(c2).ok === false);

  const t = hatched(); t.age = 5; t.energy = 20;
  ok('지쳤으면 못 배운다', care.actTrain(t).ok === false);

  const g = hatched(); g.age = 5;
  for (let i = 0; i < 60; i++) care.actPat(g);          // 잘 따르는 아이
  let learned = 0;
  for (let i = 0; i < 40 && care.nextTrick(g); i++) {
    g.energy = 90; g.fun = 80;
    const r = care.actTrain(g);
    if (r.learned) learned++;
  }
  ok('충분히 시도하면 다 배운다', g.tricks.length === care.TRICKS.length, g.tricks);
  ok('다 배우면 더 가르칠 게 없다', care.actTrain(g).ok === false);
}

console.log('# 산책');
{
  const w = hatched(); w.age = 5; w.fun = 40; w.energy = 80; w.hunger = 80;
  const before = w.weight;
  const r = care.actWalk(w);
  ok('산책하면 즐겁고 지친다', r.ok && w.fun > 40 && w.energy < 80, { fun: w.fun, e: w.energy });
  ok('배도 고파진다', w.hunger < 80, w.hunger);
  ok('놀기보다 살이 더 빠진다', before - w.weight > 0.15, before - w.weight);

  const tired = hatched(); tired.age = 5; tired.energy = 20;
  ok('지쳤으면 못 나간다', care.actWalk(tired).ok === false);
}

console.log('# 짝짓기');
{
  const a = hatched(); a.age = 8;
  const b = hatched(); b.age = 8;
  ok('어른 둘은 가능', care.canMate(a) && care.canMate(b));

  const kid = care.inherit(care.blank(), a, b);
  ok('아이는 알로 시작', kid.egg === true);

  const rich = hatched(); rich.age = 8; rich.traits = { play: 40, love: 20, food: 0, rest: 0 };
  const poor = hatched(); poor.age = 8; poor.traits = { play: 0, love: 0, food: 0, rest: 0 };
  const k2 = care.inherit(care.blank(), rich, poor);
  ok('부모 성향을 절반씩 물려받는다',
     Math.abs(k2.traits.play - 10) < 0.01 && Math.abs(k2.traits.love - 5) < 0.01,
     k2.traits);

  const fat1 = hatched(); fat1.age = 8; fat1.weight = care.baseWeight(8) * 1.4;
  const fat2 = hatched(); fat2.age = 8; fat2.weight = care.baseWeight(8) * 1.4;
  const k3 = care.inherit(care.blank(), fat1, fat2);
  ok('통통한 부모의 아이는 통통하게 시작', k3.weight > care.baseWeight(1), k3.weight);

  care.markMated(a);
  ok('한 번 짝지으면 쉬어야 한다', care.canMate(a) === false);
  ok('언제 되는지 알려준다', /일 더/.test(care.whyNotMate(a)), care.whyNotMate(a));

  const young = hatched(); young.age = 7;
  ok('7살은 아직', care.canMate(young) === false);
  const asleep = hatched(); asleep.age = 9; asleep.sleeping = true;
  ok('자는 중에는 안 된다', care.canMate(asleep) === false);
}

console.log('# 알아맞히기 놀이');
{
  const g = hatched(); g.age = 5; g.fun = 40; g.energy = 60;
  const win = care.actGame(g, true);
  ok('이기면 즐거움이 많이 오른다', win.ok && g.fun >= 70, g.fun);
  const before = g.fun;
  const lose = care.actGame(g, false);
  ok('져도 조금은 오른다', lose.ok && g.fun > before, g.fun);
  ok('이길 때가 경험치가 더 많다', win.gain > lose.gain, [win.gain, lose.gain]);

  const tired = hatched(); tired.age = 5; tired.energy = 10;
  ok('지쳤으면 못 논다', care.actGame(tired, true).ok === false);
  const egg = care.blank();
  ok('알은 못 논다', care.actGame(egg, true).ok === false);
}

console.log('# 재주 상속');
{
  const a = hatched(); a.age = 9; a.tricks = ['앉아', '손', '빙글'];
  const b = hatched(); b.age = 9; b.tricks = ['앉아', '손'];
  let most = 0, none = 0;
  for (let i = 0; i < 300; i++) {
    const t = care.inheritTricks(a, b);
    most = Math.max(most, t.length);
    if (!t.length) none++;
  }
  ok('최대 두 개까지만 물려받는다', most === 2, most);
  ok('가끔은 아무것도 못 물려받는다', none > 0, none);

  const plain = hatched(); plain.age = 9; plain.tricks = [];
  ok('부모가 아무것도 모르면 아이도 모른다',
     care.inheritTricks(plain, plain).length === 0);

  const kid = care.inherit(care.blank(), a, b);
  ok('타고난 재주를 따로 기록한다',
     JSON.stringify(kid.bornWith) === JSON.stringify(kid.tricks), kid.bornWith);
}

console.log('# 재주에는 반드시 동작이 있어야 한다');
{
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const pet = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  const chat = fs.readFileSync(path.join(__dirname, '..', 'chatter.js'), 'utf8');

  const poses = {};
  const block = main.slice(main.indexOf('const TRICK_POSE'), main.indexOf('function doTrick'));
  care.TRICKS.forEach((t) => {
    const m = new RegExp("'" + t + "':\\s*\\['([a-z]+)'").exec(block);
    if (m) poses[t] = m[1];
  });

  const noPose = care.TRICKS.filter((t) => !poses[t]);
  ok('모든 재주에 포즈가 정해져 있다', noPose.length === 0, noPose);

  // a pose is implemented either as CSS keyed off data-state, or in JS
  // (엎드려 swaps in the lying drawing rather than animating the standing one)
  const noMove = Object.values(poses).filter((p) =>
    pet.indexOf('data-state="' + p + '"') < 0 && pet.indexOf("=== '" + p + "'") < 0);
  ok('모든 포즈에 실제 동작이 있다', noMove.length === 0, noMove);

  const noLine = care.TRICKS.filter((t) => chat.indexOf("'" + t + "':") < 0);
  ok('모든 재주에 대사가 있다', noLine.length === 0, noLine);

  const dup = Object.values(poses).filter((p, i, a) => a.indexOf(p) !== i);
  ok('포즈가 겹치지 않는다', dup.length === 0, dup);
}

console.log('# 재주 부리기');
{
  const p = hatched(); p.age = 8; p.energy = 80; p.fun = 40;
  p.tricks = ['앉아'];
  const r = care.actPerform(p, '앉아');
  ok('아는 재주는 한다', r.ok && p.fun > 40 && p.energy < 80, { fun: p.fun, e: p.energy });
  // it pays now — a little, and only while it is still keen. The bounds
  // are checked under "# 재주 보여주기" below.
  ok('재주도 조금은 경험치를 준다', r.gain > 0, r.gain);
  ok('모르는 재주는 못 한다', care.actPerform(p, '노래').ok === false);
  p.energy = 5;
  ok('지쳤으면 못 한다', care.actPerform(p, '앉아').ok === false);
}

console.log('# 성격과 체형이 실제로 다르게 만든다');
{
  const H2 = 2 * H;
  // 성향 객체는 반드시 복사해서 넘긴다 — bump() 가 객체를 직접 고치므로
  // 같은 객체를 두 펫에게 주면 한쪽을 놀린 결과가 다른 쪽 성격을 바꾼다
  const grown = (traits, weightMul) => {
    const c = hatched(); c.age = 6; c.traits = Object.assign({}, traits);
    c.weight = care.baseWeight(6) * (weightMul || 1);
    c.lastTick = Date.now() - H2;
    care.advance(c, Date.now(), {});
    return c;
  };
  const even = { play: 5, love: 5, food: 5, rest: 5 };
  const base = grown(even);

  const lively = grown({ play: 30, love: 2, food: 1, rest: 1 });
  ok('활발한 아이가 더 빨리 심심해한다', lively.fun < base.fun - 15, [lively.fun, base.fun]);

  const greedy = grown({ food: 30, play: 2, love: 1, rest: 1 });
  ok('먹보가 더 빨리 배고파진다', greedy.hunger < base.hunger - 10, [greedy.hunger, base.hunger]);

  const calm = grown({ rest: 30, play: 2, love: 1, food: 1 });
  ok('느긋한 아이가 덜 지친다', calm.energy > base.energy + 5, [calm.energy, base.energy]);

  ok('성격이 없으면 아무 배수도 없다',
     care.mods(base).hunger === 1 && care.mods(base).fun === 1 && care.mods(base).energy === 1);

  // 체형
  const play = (mul) => {
    const c = hatched(); c.age = 6; c.traits = Object.assign({}, even);
    c.weight = care.baseWeight(6) * mul; c.fun = 30; c.energy = 90;
    const before = c.energy; care.actPlay(c);
    return before - c.energy;
  };
  const thin = play(0.8), mid = play(1.0), fat = play(1.5);
  ok('무거우면 놀 때 더 지친다', fat > mid && mid >= thin, [thin, mid, fat]);

  // 재주 습득
  const eager = hatched(); eager.age = 6; eager.traits = { play: 30, love: 2, food: 1, rest: 1 };
  const lazy = hatched(); lazy.age = 6; lazy.traits = { rest: 30, play: 2, love: 1, food: 1 };
  ok('활발한 아이가 더 잘 배운다', care.mods(eager).trick > care.mods(lazy).trick,
     [care.mods(eager).trick, care.mods(lazy).trick]);

  // 쓰다듬기
  const sweet = hatched(); sweet.age = 6; sweet.traits = { love: 30, play: 2, food: 1, rest: 1 };
  sweet.fun = 50; care.actPat(sweet);
  ok('다정한 아이는 쓰다듬으면 즐거워한다', sweet.fun > 50, sweet.fun);
  const plain = hatched(); plain.age = 6; plain.traits = Object.assign({}, even); plain.fun = 50;
  care.actPat(plain);
  ok('보통 아이는 쓰다듬어도 수치는 그대로', plain.fun === 50);

  // 설명 문구
  ok('성격이 무엇을 바꾸는지 말해준다', typeof care.natureNote(lively) === 'string');
  ok('성격이 없으면 설명도 없다', care.natureNote(base) === null);
}

console.log('# 밤잠');
{
  const at = (h) => new Date(2026, 7, 25, h, 0, 0).getTime();
  ok('밤 구간 판정', care.isNight(at(23)) && care.isNight(at(3)) &&
     !care.isNight(at(7)) && !care.isNight(at(14)));

  const p1 = hatched(); p1.lastTick = at(22) - 60000;
  care.advance(p1, at(23), { night: true });
  ok('밤이 되면 알아서 잔다', p1.sleeping === true && p1.autoSleep === true);

  p1.lastTick = at(23); p1.energy = 100;
  care.advance(p1, at(3), { night: true });
  ok('에너지가 가득해도 아침까지 잔다', p1.sleeping === true);

  p1.lastTick = at(3);
  care.advance(p1, at(8), { night: true });
  ok('아침에 깬다', p1.sleeping === false && p1.autoSleep === undefined);

  const p2 = hatched(); p2.lastTick = at(22) - 60000;
  care.advance(p2, at(23), {});
  ok('설정이 꺼져 있으면 밤이어도 안 잔다', p2.sleeping === false);

  const p3 = hatched(); p3.lastTick = at(22) - 60000;
  care.advance(p3, at(23), { night: true });
  care.actSleep(p3);                                  // 사람이 직접 깨움
  ok('직접 깨우면 다시 눕히지 않는다',
     p3.sleeping === false && p3.autoSleep === undefined);

  const e = care.blank(); e.lastTick = at(22);
  care.advance(e, at(23), { night: true });
  ok('알은 밤에도 자지 않는다', e.sleeping === false && e.egg === true);
}

console.log('# 조사 (으)로');
[['아기', '아기로'], ['청소년', '청소년으로'], ['어른', '어른으로'],
 ['장로', '장로로'], ['전설', '전설로']]
  .forEach(([w, expect]) => ok(expect, w + care.ro(w) === expect, w + care.ro(w)));

console.log('# 업데이트 버전 비교');
{
  const up = require('../updater.js');
  [['1.21.0', '1.20.1', true],
   ['v1.20.1', '1.20.1', false],
   ['1.20.0', '1.20.1', false],
   ['2.0.0', '1.99.9', true],
   ['1.20.10', '1.20.9', true],
   ['1.20.2-beta', '1.20.1', true]].forEach(([r, l, want]) => {
    ok(r + ' > ' + l + ' = ' + want, up.isNewer(r, l) === want, up.isNewer(r, l));
  });
  ok('앞의 v 는 무시한다', JSON.stringify(up.parts('v1.2.3')) === '[1,2,3]');
  ok('이상한 값도 터지지 않는다', up.isNewer(null, undefined) === false);
}

console.log('# 평생 횟수');
{
  const c = care.blank();
  c.egg = false; c.age = 5; c.bornAt = Date.now();
  c.hunger = 10; c.fun = 10; c.energy = 100;
  care.actFeed(c);  ok('밥 한 번', c.meals === 1);
  care.actSnack(c); ok('간식 한 번', c.snacks === 1);
  care.actPlay(c);  ok('놀기 한 번', c.plays === 1);
  care.actPat(c);   ok('쓰다듬기 한 번', c.pats === 1);
  c.energy = 40; care.actSleep(c); ok('잠 한 번', c.naps === 1);
  c.sleeping = false;
  c.poops = [{ id: 'a', x: 1 }];
  care.actClean(c, 'a'); ok('치우기 한 번', c.cleans === 1);
  c.tricks = ['앉아']; c.energy = 90;
  care.actPerform(c, '앉아'); ok('재주 한 번', c.shows === 1);

  // and they must survive a reload, since milestones are counted off them
  const back = care.normalize(JSON.parse(JSON.stringify(c)));
  ok('저장했다 읽어도 남는다', back.meals === 1 && back.pats === 1 && back.shows === 1);

  // a save written before these existed must not come back as NaN
  const older = care.normalize({ egg: false, age: 4 });
  ok('예전 저장본은 0 으로', older.meals === 0 && older.cleans === 0 && older.shows === 0);

  // failed actions must not count
  const full = care.blank();
  full.egg = false; full.age = 5; full.hunger = 100;
  care.actFeed(full);
  ok('못 먹인 밥은 세지 않는다', full.meals === 0);
}

console.log('# 몸통 소품이 체형 따라 뭉개지지 않는다');
{
  // widen() adds/removes columns at the ROW CENTRE to fit clothing to the
  // body. A hard object centred on the chest lost half its width on a slim
  // pet, which is how the medal became a gold sliver.
  global.window = global;
  require('../renderer/pixel.js');
  require('../renderer/gear.js');
  require('../renderer/tint.js');
  require('../renderer/species.js');

  function gearWidth(build, key) {
    const m = window.SPECIES.at('capybara', 'adult', build).markup()
      .match(new RegExp('data-gear="' + key + '"[\\s\\S]*?<\\/g>'));
    const box = [...m[0].matchAll(/x="(\d+)"[^>]*width="(\d+)"/g)]
      .map((g) => [+g[1], +g[1] + +g[2]]);
    return Math.max(...box.map((b) => b[1])) - Math.min(...box.map((b) => b[0]));
  }

  const builds = ['slim', 'normal', 'plump', 'heavy'];
  const medal = builds.map((b) => gearWidth(b, 'medal'));
  ok('금메달은 체형이 달라도 같은 크기', medal.every((w) => w === medal[0]), medal.join('/'));

  const hoodie = builds.map((b) => gearWidth(b, 'hoodie'));
  ok('옷은 체형 따라 넓어진다', hoodie[0] < hoodie[3], hoodie.join('/'));

  // ...and because it does not stretch, it has to fit the narrowest chest
  // there is, or the ribbon hangs off the side of a slim pet.
  function overhang(key) {
    const bad = [];
    ['capybara', 'dodam', 'danchu', 'crab', 'haru'].forEach((sk) => {
      builds.forEach((b) => {
        const sp = window.SPECIES.at(sk, 'adult', b);
        const m = sp.markup().match(new RegExp('data-gear="' + key + '"[\\s\\S]*?<\\/g>'))[0];
        const rows = {};
        for (const g of m.matchAll(/x="(\d+)"[^>]*y="(\d+)"[^>]*width="(\d+)"/g)) {
          const x = +g[1] / 5, y = +g[2] / 5, w = +g[3] / 5;
          rows[y] = rows[y] || [Infinity, -Infinity];
          rows[y][0] = Math.min(rows[y][0], x);
          rows[y][1] = Math.max(rows[y][1], x + w - 1);
        }
        const body = sp.parts.body;
        Object.keys(rows).forEach((y) => {
          const row = body.rows[+y - body.y];
          if (!row) return;
          const lo = row.search(/[^.]/);
          const hi = row.length - 1 - [...row].reverse().join('').search(/[^.]/);
          if (rows[y][0] < body.x + lo || rows[y][1] > body.x + hi) bad.push(sk + '/' + b + ' y' + y);
        });
      });
    });
    return bad;
  }
  const off = overhang('medal');
  ok('금메달은 어느 종·체형에서도 몸 밖으로 안 나간다', off.length === 0, off.slice(0, 3).join(', '));
}

console.log('# 밥과 간식의 종류');
{
  const hungry = () => {
    const c = care.blank();
    c.egg = false; c.age = 5; c.bornAt = Date.now();
    c.hunger = 0; c.fun = 0; c.energy = 100;
    return c;
  };
  ok('밥 네 가지', care.MEALS.length === 4);
  ok('간식 다섯 가지', care.SNACKS.length === 5);
  ok('id 가 겹치지 않는다',
     new Set(care.MEALS.concat(care.SNACKS).map((f) => f.id)).size === 9);

  // each dish has to actually differ, or the choice is decoration
  const fills = care.MEALS.map((m) => m.hunger);
  const gains = care.MEALS.map((m) => m.weight);
  ok('밥마다 배부름이 다르다', new Set(fills).size === fills.length, fills.join(','));
  ok('밥마다 살이 다르게 붙는다', new Set(gains).size === gains.length, gains.join(','));

  // 일식 is the light one, 양식 the heavy one — the numbers should say so
  const weigh = (id) => {
    const c = hungry(); const before = c.weight;
    care.actFeed(c, id);
    return +(c.weight - before).toFixed(4);
  };
  ok('일식이 양식보다 덜 찐다', weigh('japanese') < weigh('western'),
     weigh('japanese') + ' vs ' + weigh('western'));

  // the same dish twice running is worth less fun, but fills the same
  {
    const c = hungry();
    const a = care.actFeed(c, 'chinese'); const funA = c.fun;
    c.hunger = 0; c.fun = 0;
    const b = care.actFeed(c, 'chinese'); const funB = c.fun;
    ok('연달아 같은 밥은 시들하다', b.again === true && funB < funA, funA + ' → ' + funB);
    ok('그래도 배는 똑같이 부르다', a.ok && b.ok);
  }

  // a taste is acquired, not chosen
  {
    const c = hungry();
    ok('처음엔 입맛이 없다', care.favourite(c, care.MEALS) === null);
    for (let i = 0; i < 4; i++) { c.hunger = 0; care.actFeed(c, 'korean'); }
    ok('많이 먹인 것이 입맛이 된다', (care.favourite(c, care.MEALS) || {}).id === 'korean');
    c.hunger = 0; c.lastMeal = null;
    ok('최애를 주면 좋아한다', care.actFeed(c, 'korean').loved === true);
  }

  // no dish named: give it what it likes
  {
    const c = hungry();
    for (let i = 0; i < 4; i++) { c.hunger = 0; care.actSnack(c, 'jerky'); }
    c.hunger = 0;
    ok('종류를 안 고르면 입맛대로', care.actSnack(c).food === 'jerky');
  }

  // learned by cooking, and it is the cook who learns — so it counts across
  // the house, not per pet
  {
    ok('처음엔 한식과 쿠키뿐',
       care.learned(care.MEALS, 0).length === 1 && care.learned(care.SNACKS, 0).length === 1);
    ok('밥 8번이면 양식', care.learned(care.MEALS, 8).map((f) => f.id).join() === 'korean,western');
    ok('밥 40번이면 전부', care.learned(care.MEALS, 40).length === care.MEALS.length);
    ok('간식 45번이면 전부', care.learned(care.SNACKS, 45).length === care.SNACKS.length);
    ok('열리는 순서가 겹치지 않는다',
       new Set(care.MEALS.map((f) => f.after)).size === care.MEALS.length &&
       new Set(care.SNACKS.map((f) => f.after)).size === care.SNACKS.length);
    ok('안 배운 것은 못 만든다',
       !care.canCook(care.MEALS, 'japanese', 10) && care.canCook(care.MEALS, 'japanese', 40));
    ok('첫 요리는 언제나 만들 수 있다', care.canCook(care.MEALS, 'korean', 0));
  }

  console.log('# 놀이의 종류');
  {
    const fresh = () => {
      const c = care.blank();
      c.egg = false; c.age = 6; c.bornAt = Date.now();
      c.fun = 0; c.energy = 100; c.weight = 9;
      return c;
    };
    ok('놀이 네 가지', care.PLAYS.length === 4);
    const funs = care.PLAYS.map((g) => g.fun), costs = care.PLAYS.map((g) => g.energy);
    ok('놀이마다 즐거움이 다르다', new Set(funs).size === funs.length, funs.join(','));
    ok('놀이마다 기운이 다르게 든다', new Set(costs).size === costs.length, costs.join(','));

    // the expensive one takes more off the ribs — that is what it is for
    const lose = (id) => { const c = fresh(); const w = c.weight; care.actPlay(c, id); return +(w - c.weight).toFixed(4); };
    ok('원반이 숨바꼭질보다 살이 빠진다', lose('disc') > lose('hide'), lose('disc') + ' vs ' + lose('hide'));

    // ...and is the first to be out of reach when it is tired
    const tired = (id) => { const c = fresh(); c.energy = 18; return care.actPlay(c, id).ok; };
    ok('지치면 원반은 못 한다', tired('hide') === true && tired('disc') === false);

    // same rules as the menu
    {
      const c = fresh();
      care.actPlay(c, 'ball'); const first = c.fun;
      c.fun = 0;
      const r = care.actPlay(c, 'ball');
      ok('같은 놀이 연달아는 시들하다', r.again === true && c.fun < first, first + ' → ' + c.fun);
    }
    ok('처음엔 공놀이뿐', care.learned(care.PLAYS, 0).map((g) => g.id).join() === 'ball');
    ok('30번이면 전부', care.learned(care.PLAYS, 30).length === care.PLAYS.length);
    ok('안 배운 놀이는 못 한다',
       !care.canCook(care.PLAYS, 'disc', 10) && care.canCook(care.PLAYS, 'disc', 30));
  }

  console.log('# 은/는');
  [['쿠키', '쿠키는'], ['양식', '양식은'], ['우유', '우유는'], ['아이스크림', '아이스크림은']]
    .forEach(([w, want]) => ok(want, w + care.neun(w) === want, w + care.neun(w)));

  // and a save must not come back with a dish that does not exist
  {
    const bad = care.normalize({ egg: false, age: 4, diet: { 불닭: 9, korean: 2, cookie: -1 },
                                 lastMeal: '없는것', lastSnack: 'fruit' });
    ok('없는 음식은 버린다', JSON.stringify(bad.diet) === '{"korean":2}', JSON.stringify(bad.diet));
    ok('없는 마지막 메뉴는 비운다', bad.lastMeal === null && bad.lastSnack === 'fruit');
  }
}

console.log('# 재주 보여주기');
{
  const mk = (n) => {
    const c = care.blank();
    c.egg = false; c.age = 5; c.bornAt = Date.now();
    c.tricks = Array.from({ length: n }, (_, i) => care.TRICKS[i]);
    c.energy = 100; c.fun = 0;
    return c;
  };
  const one = care.actPerform(mk(1), care.TRICKS[0]);
  const ten = care.actPerform(mk(10), care.TRICKS[0]);
  ok('재주가 많을수록 더 준다', ten.gain > one.gain, one.gain + ' → ' + ten.gain);
  ok('한 번이라도 경험치를 준다', one.gain > 0, one.gain);

  // ...but never enough to make clicking the better use of a day
  const c = mk(10);
  let total = 0, presses = 0;
  for (;;) { const r = care.actPerform(c, care.TRICKS[0]); if (!r.ok) break; total += r.gain; presses++; }
  ok('기운이 다할 때까지 눌러도 한 바퀴 돌보기보다 적다', total < 78, total + 'exp / ' + presses + '번');

  // once it is already delighted it will still perform, and learn nothing
  const d = mk(10); d.fun = 100;
  const r = care.actPerform(d, care.TRICKS[0]);
  ok('신나 있으면 해주되 경험치는 없다', r.ok && r.gain === 0 && r.jaded === true);

  ok('못 하는 재주는 거절한다', !care.actPerform(mk(1), care.TRICKS[5]).ok);
  const tired = mk(3); tired.energy = 5;
  ok('지치면 거절한다', !care.actPerform(tired, care.TRICKS[0]).ok);
}

console.log('# 화면이 없는 요소를 만지지 않는다');
{
  /* The care window renders inside one big onState handler. A
     getElementById that returns null throws, and everything AFTER the
     throw silently never runs — which is how removing the 밥/간식/놀기
     buttons left four checkboxes stuck unchecked and the hint blank.
     Nothing catches that: the smoke check exercises main.js, and the
     renderer has no test at all. So check statically that every id the
     script reaches for is an id the markup actually has. */
  const pages = ['care.html', 'ring.html', 'index.html', 'agenda.html', 'settings.html', 'bubble.html'];
  pages.forEach((page) => {
    let html;
    try { html = fs.readFileSync(path.join(__dirname, '..', 'renderer', page), 'utf8'); }
    catch (e) { return; }

    const have = new Set();
    for (const m of html.matchAll(/\sid="([A-Za-z][\w-]*)"/g)) have.add(m[1]);

    // ids the script asks for by literal name
    const want = new Set();
    for (const m of html.matchAll(/getElementById\(\s*['"]([A-Za-z][\w-]*)['"]\s*\)/g)) want.add(m[1]);
    for (const m of html.matchAll(/querySelector\(\s*['"]#([A-Za-z][\w-]*)['"]\s*\)/g)) want.add(m[1]);

    const missing = [...want].filter((k) => !have.has(k));
    ok(page + ' 의 id 참조가 전부 존재한다', missing.length === 0, missing.join(', '));

    // and no id twice, or getElementById quietly picks the first
    const seen = {}, dupes = [];
    for (const m of html.matchAll(/\sid="([A-Za-z][\w-]*)"/g)) {
      seen[m[1]] = (seen[m[1]] || 0) + 1;
      if (seen[m[1]] === 2) dupes.push(m[1]);
    }
    ok(page + ' 에 중복 id 가 없다', dupes.length === 0, dupes.join(', '));
  });
}

console.log('# 가족 관계');
{
  const family = require('../family.js');
  const pets = {};
  const P = (id, par) => { pets[id] = { name: id, parents: par || null }; };
  P('아빠'); P('엄마'); P('남남이'); P('외부1'); P('외부2');
  P('첫째', ['아빠', '엄마']); P('둘째', ['아빠', '엄마']);
  P('손주', ['첫째', '남남이']);
  P('사촌', ['둘째', '외부1']);
  P('타가문', ['외부1', '외부2']);

  const k = (a, b) => family.kinship(pets, a, b);
  [['첫째', '둘째', '형제예요'],
   ['둘째', '손주', '삼촌·조카예요'],     // the hole that shipped in 1.23.0
   ['손주', '둘째', '삼촌·조카예요'],     // and the same the other way round
   ['첫째', '손주', '자식이에요'],
   ['첫째', '아빠', '부모예요'],
   ['아빠', '손주', '자손이에요'],
   ['손주', '아빠', '조상이에요'],
   ['사촌', '손주', '한 핏줄이에요'],
  ].forEach(([a, b, want]) => ok(a + ' × ' + b + ' = ' + want, k(a, b) === want, k(a, b)));

  // separate lines must stay crossable, or the family ends in two
  // generations and the whole feature dies with it
  ok('남남끼리는 된다', k('아빠', '엄마') === null);
  ok('다른 집안 아이끼리는 된다', k('첫째', '타가문') === null);
  ok('손주도 다른 집안과는 된다', k('손주', '타가문') === null);

  // one partner, for good
  pets['아빠'].mate = '엄마'; pets['엄마'].mate = '아빠';
  ok('짝이 있으면 다른 상대는 막힌다', family.pairProblem(pets, '아빠', '타가문') === '짝이 있어요');
  ok('제 짝과는 계속 된다', family.pairProblem(pets, '아빠', '엄마') === null);
  ok('임자 있는 상대는 그렇게 말한다',
     family.pairProblem(pets, '타가문', '엄마') === '아빠의 짝이에요',
     family.pairProblem(pets, '타가문', '엄마'));
  pets['아빠'].mate = '없는아이';
  ok('사라진 짝은 풀린다', family.mateOf(pets, '아빠') === null);
}

console.log('# 다음 칭호까지 얼마나');
{
  const c = care.blank(); care.hatch(c);
  c.age = 15; c.exp = 500;

  // 재 본 날이 없으면 아는 척하지 않는다
  const v0 = care.view(c);
  ok('기록이 없으면 날짜를 지어내지 않는다',
     v0.toNext && v0.toNext.days === null && v0.toNext.pace === null,
     JSON.stringify(v0.toNext));
  ok('남은 경험치는 그래도 안다', v0.toNext.exp > 0, String(v0.toNext.exp));
  ok('다음 칭호는 원로', v0.toNext.title === '원로' && v0.toNext.from === 20);

  c.expDays = [200, 100, 150];
  const v = care.view(c);
  ok('속도는 다 채운 날들의 평균', v.toNext.pace === 150, String(v.toNext.pace));
  ok('남은 날은 남은 경험치 나누기 속도',
     v.toNext.days === Math.ceil(v.toNext.exp / 150), String(v.toNext.days));

  // 남은 경험치는 나이 하나씩이 아니라 칭호까지 전부 더한 값이다
  const step = care.needFor(15) + care.needFor(16) + care.needFor(17) +
               care.needFor(18) + care.needFor(19) - 500;
  ok('15살에서 20살까지를 다 더한다', v.toNext.exp === step,
     v.toNext.exp + ' vs ' + step);

  // 하루가 넘어가면 어제치가 기록된다
  const d = care.blank(); care.hatch(d);
  d.dayKey = '2026-08-26'; d.dayExp = 77; d.expDays = [];
  // advance() 는 흐른 시간이 없으면 바로 돌아간다 — 하루를 넘기려면
  // 실제로 시간이 지나야 한다
  d.lastTick = Date.now() - 60 * 60 * 1000;
  care.advance(d, Date.now(), null);
  ok('하루가 넘어가면 어제치가 남는다', (d.expDays || [])[0] === 77,
     JSON.stringify(d.expDays));
  ok('오늘치는 0 부터 다시', d.dayExp === 0);

  // 이레치만
  const e = care.blank(); care.hatch(e);
  e.expDays = [1, 2, 3, 4, 5, 6, 7]; e.dayKey = '2026-08-26'; e.dayExp = 9;
  e.lastTick = Date.now() - 60 * 60 * 1000;
  care.advance(e, Date.now(), null);
  ok('이레치만 들고 있는다', e.expDays.length === 7 && e.expDays[0] === 9,
     JSON.stringify(e.expDays));

  // 전설이면 다음이 없다
  const L = care.blank(); care.hatch(L); L.age = 30;
  ok('마지막 단계면 남은 날도 없다', care.view(L).toNext === null);

  // 사다리는 지금 어디인지 표시한다
  const lad = care.view(c).ladder;
  ok('사다리에 지금 칸이 하나 있다',
     lad.filter((x) => x.now).length === 1 && lad.find((x) => x.now).title === '장로');
}

console.log('# 밤에 손으로 깨우기');
{
  const NIGHT = { night: true, from: 23, to: 7 };
  const at = (day, h, m) => new Date(2026, 7, day, h, m || 0, 0, 0).getTime();
  const real = Date.now;
  const clockAt = (t) => { Date.now = () => t; };

  const c = care.blank(); care.hatch(c);
  c.energy = 40; c.hunger = 60; c.fun = 60;

  // 밤이 되면 알아서 잠든다 — 이건 그대로여야 한다
  c.lastTick = at(27, 22, 50);
  care.advance(c, at(27, 23, 10), NIGHT);
  ok('밤이 되면 알아서 잠든다', c.sleeping === true && c.autoSleep === true);

  // 손으로 깨운다
  clockAt(at(27, 23, 11));
  const woke = care.actSleep(c);
  ok('깨우기는 먹힌다', woke.ok && c.sleeping === false, JSON.stringify(woke));

  // ★1분 뒤 tick 이 도로 재우면 안 된다 — 버튼이 계속 「깨우기」로 보이던 증상
  care.advance(c, at(27, 23, 12), NIGHT);
  ok('★깨워 놓으면 다음 tick 이 도로 재우지 않는다', c.sleeping === false, String(c.sleeping));
  care.advance(c, at(28, 2, 0), NIGHT);
  ok('새벽까지도 깨어 있다', c.sleeping === false, String(c.sleeping));

  // 손으로 다시 재우면 깨어 있겠다는 뜻은 거둔다
  clockAt(at(28, 2, 1));
  care.actSleep(c);
  ok('손으로 재우면 잔다', c.sleeping === true);
  care.advance(c, at(28, 2, 2), NIGHT);
  ok('재워 둔 채로 있다', c.sleeping === true);

  // 아침이면 자동으로 깨고, 그날 밤에는 다시 자동으로 잠든다
  care.advance(c, at(28, 8, 0), NIGHT);
  ok('아침이면 일어난다', c.sleeping === false && !c.autoSleep);
  c.energy = 40;
  care.advance(c, at(28, 23, 30), NIGHT);
  ok('★어젯밤에 깨운 기억이 오늘 밤까지 남지 않는다', c.sleeping === true, String(c.sleeping));

  // 밤 설정이 꺼져 있으면 아무것도 강제하지 않는다
  const d = care.blank(); care.hatch(d);
  d.energy = 40; d.lastTick = at(27, 23, 10);
  care.advance(d, at(27, 23, 20), null);
  ok('밤 설정이 꺼져 있으면 재우지 않는다', d.sleeping === false);

  Date.now = real;
}

console.log('# README 가 코드와 같은 말을 하는가');
{
  /* README 는 팀원이 읽는 문서인데 아무도 검사하지 않아 조용히 낡았다 —
     단계는 여섯이라 적혀 있고 실제로는 아홉이었고, 이정표는 열둘이라
     적혀 있고 실제로는 열다섯이었다. 숫자만이라도 못 박아 둔다. */
  const fs4 = require('fs'), path4 = require('path');
  const doc = fs4.readFileSync(path4.join(__dirname, '..', 'README.md'), 'utf8');
  const MI = require('../missions.js');
  global.window = global;
  require('../renderer/pixel.js'); require('../renderer/tint.js');
  require('../renderer/gear.js'); require('../renderer/room.js');

  const NUM = { 6: '여섯', 9: '아홉', 12: '열둘', 15: '열다섯', 23: '스물세', 24: '스물네' };
  const say = (n) => NUM[n] || String(n);

  const stages = care.stageTable().length - 1;          // 알은 단계가 아니다
  ok('README 의 성장 단계 수', doc.includes(say(stages) + ' 단계로 자랍니다'),
     say(stages));

  ok('README 의 이정표 수', doc.includes('이정표가 ' + say(MI.LIST.length) + ' 있습니다'),
     say(MI.LIST.length));
  ok('README 의 missions.js 설명', doc.includes('이정표 ' + say(MI.LIST.length) + '과'));

  const R = window.ROOM.items;
  const roomAll = new Set([].concat(
    Object.keys(R.back), Object.keys(R.floor), Object.keys(R.left)));
  const roomLocked = Object.keys(MI.ROOM_LOCKS).length;
  ok('README 의 집 꾸미기 가짓수',
     doc.includes(say(roomAll.size) + ' 가지 중 ' + say(roomLocked) + '이 이정표 상품'),
     roomAll.size + ' / ' + roomLocked);

  // 사다리에 적힌 칭호가 실제 칭호와 같은지
  const titles = care.stageTable().slice(1).map((t) => t.title);
  ok('README 의 성장 사다리', doc.includes(titles.join(' → ')), titles.join(' → '));

  // 사라진 창을 아직 안내하고 있지는 않은지
  ok('README 에 없어진 설정 창 안내가 없다', !/설정 창에서/.test(doc));
}

console.log('# 왜 지금 못 하는가');
{
  const c = care.blank(); care.hatch(c);
  c.age = 2; c.hunger = 100; c.fun = 100; c.energy = 100; c.poops = []; c.tricks = [];
  const b = care.blocked(c);
  ['feed', 'snack', 'play', 'walk', 'train', 'sleep', 'clean', 'show'].forEach((k) => {
    ok('막힌 이유가 있다 — ' + k, typeof b[k] === 'string' && b[k].length > 0, String(b[k]));
  });
  ok('세 살 전에는 훈련이 막힌다', b.train === '아직 어려요', b.train);
  ok('재주를 모르면 그렇게 말한다', b.show === '아직 배운 재주가 없어요', b.show);

  /* ★밥과 간식은 배부른 기준이 다르다(95 / 99). 그 사이에는 밥만 막히고
     간식은 되는 구간이 생긴다 — 실제로 여기서, 막대의 밥 버튼은 켜져 있고
     트레이의 「한식」도 눌리는데 눌러도 아무 일이 없었다.
     그러니 이 구간이 정말 존재한다는 것을 못 박아 둔다. */
  const between = care.blank(); care.hatch(between);
  between.hunger = 97; between.fun = 50; between.energy = 80;
  const bb = care.blocked(between);
  ok('배고픔 97 이면 밥은 막힌다', bb.feed === '배가 불러요', String(bb.feed));
  ok('배고픔 97 이어도 간식은 된다', bb.snack === null, String(bb.snack));
  const full = care.blank(); care.hatch(full);
  full.hunger = 99.5;
  ok('배고픔 99.5 면 간식도 막힌다',
     care.blocked(full).snack === '더는 못 먹어요', String(care.blocked(full).snack));

  // 막대는 줄마다 따로 잠가야 한다 — 낱개를 안 잠그면 눌러도 아무 일이 없다
  const ringSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'renderer', 'ring.html'), 'utf8');
  ok('막대 트레이가 줄마다 이유를 받는다', /row\('밥',[^)]*no\.feed\)/.test(ringSrc));
  ok('막대 트레이가 낱개를 잠근다', /why \? ' disabled title=/.test(ringSrc));

  /* ★같은 실수를 세 번 했다 — 막대의 놀기(1.28.0 전), 막대 트레이의 낱개
     음식(1.28.0), 트레이 메뉴의 재주 시키기(1.29.0). 전부 "판정은 care.js 에
     있는데 그 화면만 안 쓴" 경우다. 화면마다 실제로 쓰는지 못 박아 둔다. */
  const careSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'renderer', 'care.html'), 'utf8');
  const mainSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'main.js'), 'utf8');
  ok('돌보기 창의 재주가 판정을 쓴다',
     /\(c\.blocked \|\| \{\}\)\.show/.test(careSrc));
  ok('돌보기 창이 제 손으로 기력을 재지 않는다',
     !/c\.energy\s*<\s*\d/.test(careSrc),
     (careSrc.match(/c\.energy\s*<\s*\d+/g) || []).join(', '));
  ok('트레이 메뉴의 재주가 판정을 쓴다',
     /care\.blocked\(c\)\.show/.test(mainSrc));

  // 기력이 모자라면 재주는 정말 막혀야 한다
  const tired = care.blank(); care.hatch(tired);
  tired.energy = 11; tired.tricks = ['앉아'];
  ok('기력 11 이면 재주가 막힌다',
     care.blocked(tired).show === '너무 지쳤어요', String(care.blocked(tired).show));
  tired.energy = 40;
  ok('기력이 있으면 재주가 열린다', care.blocked(tired).show === null);

  // 신나 있으면 '못 하는' 것이 아니라 '해도 안 오르는' 것이다 — 막으면 안 된다
  const jaded = care.blank(); care.hatch(jaded);
  jaded.energy = 60; jaded.fun = 99; jaded.tricks = ['앉아'];
  ok('신나 있어도 재주 자체는 막지 않는다', care.blocked(jaded).show === null,
     String(care.blocked(jaded).show));

  // 소품과 집 꾸미기는 같은 모양이어야 한다
  /* 「모카펫 설정」 창을 돌보기 창의 설정 탭으로 합쳤다. 창이 사라졌는데
     그리로 보내던 길이 남아 있으면 눌러도 아무 일이 없다 — 실제로
     openSettings 를 부르던 곳이 세 군데였다. */
  const fs3 = require('fs'), path3 = require('path');
  ok('설정 창은 사라졌다',
     !/settingsWin|function openSettings|settings-ready/.test(mainSrc));
  ok('설정 화면 파일도 없다',
     !fs3.existsSync(path3.join(__dirname, '..', 'renderer', 'settings.html')) &&
     !fs3.existsSync(path3.join(__dirname, '..', 'settings-preload.js')));
  ok('빌드 목록에도 남지 않았다',
     !/settings-preload/.test(fs3.readFileSync(path3.join(__dirname, '..', 'package.json'), 'utf8')));
  ok('설정으로 보내던 길은 돌보기 설정 탭으로 간다',
     (mainSrc.match(/openCare\('prefs'\)/g) || []).length >= 3,
     String((mainSrc.match(/openCare\('prefs'\)/g) || []).length));
  ok('돌보기 창이 설정 값을 싣는다', /Object\.assign\(v, settingsPayload\(\)\)/.test(mainSrc));
  ok('돌보기 창이 탭 이동 신호를 받는다', /api\.onTab/.test(careSrc));

  /* 알일 때 「꾸미기」 탭은 고를 것이 하나도 없어 통째로 빈 화면이었다.
     탭을 눌렀는데 아무것도 없으면 고장으로 읽힌다 — 다섯 탭 모두 무언가는
     말해야 한다. */
  /* 곁에 선 아이.
     ★채널을 나누지 않으면 곁의 아이를 쓰다듬어도 돌보는 아이가 쓰다듬어진다 —
     펫 창의 핸들러들은 보낸 창을 구분하지 않기 때문이다. */
  const buddyPre = fs3.readFileSync(path3.join(__dirname, '..', 'buddy-preload.js'), 'utf8');
  ['buddy-hit', 'buddy-menu', 'buddy-patted', 'buddy-drag-start', 'buddy-drag-end']
    .forEach((ch) => {
      ok('곁의 아이가 ' + ch + ' 로 보낸다', buddyPre.includes("'" + ch + "'"), ch);
      ok('main 이 ' + ch + ' 를 받는다', mainSrc.includes("ipcMain.on('" + ch + "'"), ch);
    });
  ok('곁의 아이는 돌보는 아이의 채널을 쓰지 않는다',
     !/ipcRenderer\.send\('(hit|menu|patted|drag-start|drag-end)'/.test(buddyPre));
  ok('곁의 아이도 빌드에 들어간다',
     /buddy-preload\.js/.test(fs3.readFileSync(path3.join(__dirname, '..', 'package.json'), 'utf8')));
  // 알은 곁에 세우지 않는다 — 알은 누구인지가 비밀이다
  // 알은 누가 나올지가 전부다 — 책상에 세워 두면 그 비밀이 새어 나간다
  ok('곁의 아이 목록이 알을 거른다',
     /!cfg\.pets\[k\]\.care\.egg/.test(mainSrc));
  ok('곁에 둘 후보도 부화한 아이뿐', /hatchedKeys\(\)\.filter\(\(k\) => k !== cfg\.species\)/.test(mainSrc));
  ok('돌보는 아이는 곁에 서지 않는다', /k !== cfg\.species &&/.test(mainSrc));
  ok('곁의 아이들도 한 번씩 다시 그린다', /pushBuddies\(\);\n  if \(push !== false\)/.test(mainSrc));
  // 셋까지. 창 하나가 렌더러 하나라 한 마리에 140MB 쯤 는다
  ok('곁의 아이는 셋까지', /const BUDDY_MAX = 3;/.test(mainSrc));
  // 크기가 '어느 쪽이 지금 돌보는 아이인가'를 말해 준다
  ok('곁의 아이는 작게 그린다', /const BUDDY_SCALE = 0\.6;/.test(mainSrc));
  ok('곁의 아이 크기에 그 값을 쓴다', /sizeFor\(cfg\.pct \* BUDDY_SCALE,/.test(mainSrc));
  ok('꽉 차면 새로 켜는 것만 막는다', /enabled: here \|\| !full/.test(mainSrc));
  // 여럿이면 채널만으로는 누가 보냈는지 모른다 — 창으로 되짚어야 한다
  ok('보낸 창으로 누구인지 되짚는다', /function buddyOf\(sender\)/.test(mainSrc));
  // 서성이다 겹치면 두 마리가 한 마리로 뭉쳐 보인다
  ok('서성일 때 남의 자리를 피한다', /hitsAny\(\{ x: nx/.test(mainSrc));
  ['buddy-hit', 'buddy-patted', 'buddy-drag-start', 'buddy-drag-end', 'buddy-menu']
    .forEach((ch) => {
      const re = new RegExp("ipcMain\\.on\\('" + ch + "', \\(e[,)]");
      ok(ch + ' 이 보낸 창을 받는다', re.test(mainSrc), ch);
    });
  // 1.31 저장본(곁의 아이 하나)에서 올라와도 이어져야 한다
  ok('옛 저장본의 buddy 를 목록으로 옮긴다', /raw\.buddy && raw\.buddy\.key/.test(mainSrc));

  ok('알일 때도 꾸미기 탭이 비지 않는다',
     /if \(c\.egg\) \{[\s\S]{0,200}알에서 깨어나면 털 색과 소품/.test(careSrc));

  /* ★탭을 기억하게 두면 메뉴 이름이 거짓말을 한다 — 마지막이 설정이면
     「돌보기…」를 눌러도 설정이 열려서 두 항목이 구분되지 않는다.
     여는 쪽이 어디로 갈지 정하고, 창은 기억하지 않는다. */
  ok('창이 마지막 탭을 기억하지 않는다', !/localStorage/.test(careSrc));
  ok('탭을 안 넘기면 돌보기로 연다', /const where = tab \|\| 'care';/.test(mainSrc));
  /* 화면 구성이 바뀌는 순간은 셋이다. metrics-changed 만 듣고 있었더니
     모니터를 '뽑았을' 때(display-removed) 펫이 사라진 좌표에 남았다. */
  ['display-metrics-changed', 'display-removed', 'display-added'].forEach((ev) => {
    ok(ev + ' 를 듣는다', mainSrc.includes(ev), ev);
  });
  ok('셋 다 같은 곳으로 이어진다', /screen\.on\(ev, keepOnScreen\)/.test(mainSrc));
  ok('자고 일어날 때도 화면을 확인한다', /powerMonitor\.on\('resume', \(\) => setTimeout\(keepOnScreen/.test(mainSrc));

  ok('열 때 언제나 탭을 알려 준다',
     /careWin\.webContents\.send\('care-tab', where\)/.test(mainSrc));
  ['scale', 'gLogin', 'gSave', 'cEnabled', 'cLead', 'cBrief'].forEach((id) => {
    ok('설정 탭에 ' + id + ' 가 있다', new RegExp('id="' + id + '"').test(careSrc));
  });

  ok('소품 드롭다운도 집 꾸미기와 같은 규칙을 받는다',
     /#room \.slot select, #look \.slot select\{/.test(careSrc));

  // ★재 보는 것이 상태를 바꾸면 화면을 그릴 때마다 펫이 밥을 먹는다
  const before = JSON.stringify(c);
  care.blocked(c);
  ok('재 보기만 하고 상태는 그대로다', JSON.stringify(c) === before);

  const ok2 = care.blank(); care.hatch(ok2);
  ok2.age = 5; ok2.hunger = 20; ok2.fun = 20; ok2.energy = 90;
  ok2.poops = [{ id: 'p1', x: 2 }]; ok2.tricks = ['앉아'];
  const b2 = care.blocked(ok2);
  ['feed', 'snack', 'play', 'walk', 'sleep', 'clean', 'show'].forEach((k) => {
    ok('할 수 있으면 안 막는다 — ' + k, b2[k] === null, String(b2[k]));
  });

  // 판정과 실제 동작이 같은 말을 해야 한다
  const stuffed = care.blank(); care.hatch(stuffed);
  stuffed.hunger = 100;
  ok('판정과 실제 거절 이유가 같다',
     care.blocked(stuffed).feed === care.actFeed(stuffed).reason);

  // 화면이 제 손으로 판단하던 것을 걷어냈는지 — 조건이 두 벌이 되면
  // 훈련이 세 살 전에도 눌리던 그 버그가 그대로 돌아온다
  const fs2 = require('fs'), path2 = require('path');
  ['ring.html', 'care.html'].forEach((f) => {
    const src = fs2.readFileSync(path2.join(__dirname, '..', 'renderer', f), 'utf8');
    ok(f + ' 은 care.js 의 판정을 쓴다', /c\.blocked/.test(src));
    ok(f + ' 에 제 손으로 적은 문턱이 없다',
       !/disabled\s*=\s*[^;]*(?:hunger|fun|energy|age)\s*[<>]/.test(src));
  });
}

console.log('# 이정표 표');
{
  const M = require('../missions.js');
  ok('열다섯', M.LIST.length === 15, M.LIST.length);

  /* 상품 이름은 이정표 옆에 손으로 적혀 있고, 어느 슬롯인지는 잠금표에
     들어 있다. 둘이 어긋나면 "받았다는데 그런 물건이 없다"가 된다.
     잠금표에서 뒤집어 읽은 이름이 손으로 적은 문구와 같아야 한다. */
  M.LIST.forEach((m) => {
    const got = M.prizesFor(m.id);
    ok(m.title + ' 의 상품이 표와 일치한다',
       got.map((p) => p.label).join(' · ') === m.prize,
       got.map((p) => p.label).join(' · ') + ' vs ' + m.prize);
    ok(m.title + ' 의 상품마다 있을 곳이 있다',
       got.length > 0 && got.every((p) => /^꾸미기 · /.test(p.where)),
       JSON.stringify(got.map((p) => p.where)));
    /* 화면이 안 쓰는 안내문은 틀린 채로 남는다 — 실제로 '펫을 오른쪽 클릭
       → 소품' 이 소품이 옮겨 간 뒤에도 그대로 있었다. 쓰는 것만 만든다. */
    ok(m.title + ' 의 상품에 안 쓰는 안내문이 없다',
       got.every((p) => Object.keys(p).sort().join(',') === 'key,label,where'),
       JSON.stringify(Object.keys(got[0] || {})));
  });
  const ids = M.LIST.map((m) => m.id);
  ok('id 가 겹치지 않는다', new Set(ids).size === ids.length);
  ok('전부 목표와 세는 법이 있다',
     M.LIST.every((m) => m.goal > 0 && typeof m.now === 'function' && m.unit && m.prize && m.badge));

  const world = { best: () => 0, tally: () => 0, hatched: 0, species: 0, trickTotal: 10 };
  ok('아무것도 안 했으면 전부 0', M.LIST.every((m) => M.now(m, world) === 0));
  ok('아무것도 안 했으면 달성 없음', M.LIST.every((m) => !M.met(m, world)));

  const done = { best: () => 99, tally: () => 999, hatched: 99, species: 99, trickTotal: 10 };
  ok('다 했으면 전부 달성', M.LIST.every((m) => M.met(m, done)));
  ok('진행도는 목표를 넘지 않는다', M.LIST.every((m) => M.now(m, done) === m.goal));

  // a milestone that throws must not take the window down with it
  const broken = { best: () => { throw new Error('nope'); }, tally: () => 0, hatched: 0, species: 0 };
  ok('세다가 터져도 0 으로 넘어간다', M.now(M.byId('adult'), broken) === 0);

  // every prize a milestone promises must be an item that exists
  const none = () => false, all = () => true;
  const roomLocked = M.roomSlots(none), roomOpen = M.roomSlots(all);
  ok('잠긴 방 아이템은 이유가 붙는다',
     roomLocked.every(([, , items]) => items.every(([, , why]) => !M.ROOM_LOCKS[items[0][1]] || true)) &&
     roomLocked.some(([, , items]) => items.some(([, , why]) => !!why)));
  ok('다 풀면 이유가 사라진다', roomOpen.every(([, , items]) => items.every(([, , why]) => !why)));
  ok('잠겨도 목록에서 사라지지는 않는다',
     JSON.stringify(roomLocked.map(([, , i]) => i.length)) ===
     JSON.stringify(roomOpen.map(([, , i]) => i.length)));
  ok('잠긴 것은 고를 수 없다', !M.pickable(roomLocked, 'floor', 'carpet'));
  ok('풀린 것은 고를 수 있다', M.pickable(roomOpen, 'floor', 'carpet'));
  ok('없음은 언제나 고를 수 있다', M.pickable(roomLocked, 'floor', 'none'));

  // and every lock must name a milestone that is really there
  const known = new Set(ids);
  const strayRoom = Object.values(M.ROOM_LOCKS).filter((id) => !known.has(id));
  const strayGear = Object.values(M.GEAR_LOCKS)
    .flatMap((slot) => Object.values(slot)).filter((id) => !known.has(id));
  ok('없는 이정표를 가리키는 잠금은 없다',
     strayRoom.length === 0 && strayGear.length === 0, strayRoom.concat(strayGear).join(','));
}

console.log('# 미션 상품은 잠겨 있어야 한다');
{
  global.window = global;
  require('../renderer/pixel.js');
  require('../renderer/gear.js');
  // main.js gearSlots()/ROOM_LOCKS decide what the menu offers; if an item
  // loses its `lock` it silently becomes free for everyone. That is exactly
  // what happened when the broom art was rewritten.
  /* 잠금은 두 곳에 적혀 있다 — 그림 옆(gear.js 의 lock:)과 이정표 옆
     (missions.js 의 GEAR_LOCKS). 여기서 기대값을 손으로 한 번 더 적어 두면
     상품을 새로 넣을 때 세 곳을 고쳐야 하고, 한 곳을 빠뜨린 채 통과한다.
     그래서 베끼지 않고 두 표를 서로 대조한다. */
  const MI = require('../missions.js');
  const mismatch = [];
  window.GEAR.slots.forEach((s) => Object.keys(window.GEAR.items[s]).forEach((k) => {
    const a = window.GEAR.items[s][k].lock || null;
    const b = (MI.GEAR_LOCKS[s] || {})[k] || null;
    if (a !== b) mismatch.push(s + '.' + k + ' gear=' + a + ' missions=' + b);
  }));
  ok('그림의 잠금과 이정표의 잠금이 같다', mismatch.length === 0, mismatch.join(', '));

  const missingPrize = [];
  Object.keys(MI.GEAR_LOCKS).forEach((s) => Object.keys(MI.GEAR_LOCKS[s]).forEach((k) => {
    if (!window.GEAR.items[s][k]) missingPrize.push(s + '.' + k);
    if (!(MI.GEAR_PRIZES[s] || []).some(([, key]) => key === k)) {
      missingPrize.push(s + '.' + k + '(메뉴에 없음)');
    }
  }));
  ok('잠긴 상품은 그려져 있고 메뉴에도 오른다', missingPrize.length === 0,
     missingPrize.join(', '));

  const ids = new Set(MI.LIST.map((m) => m.id));
  const orphan = [];
  Object.keys(MI.GEAR_LOCKS).forEach((s) =>
    Object.values(MI.GEAR_LOCKS[s]).forEach((v) => { if (!ids.has(v)) orphan.push(v); }));
  Object.values(MI.ROOM_LOCKS).forEach((v) => { if (!ids.has(v)) orphan.push(v); });
  ok('없는 이정표로 잠근 것은 없다', orphan.length === 0, orphan.join(', '));
  // Anything held must actually be in the paw. The paw is at y33..35; a
  // broom drawn entirely above it left the pet cupping the brush head, and
  // the bone was floating clear of the hand for the same reason.
  Object.keys(window.GEAR.items.hand).forEach((k) => {
    const it = window.GEAR.items.hand[k];
    const y0 = it.at[1];
    const rows = [33, 34, 35].filter((y) => {
      const r = it.art[y - y0];
      return r !== undefined && /[^.]/.test(r);
    });
    ok('손에 든 ' + k + ' 가 앞발에 닿는다', rows.length >= 2, rows.length + '줄');
  });

  // 가족 액자 lives in the room now, not the hand — one prize, one place
  ok('손에 드는 가족 액자는 없다', !window.GEAR.items.hand.photo);

  // and nothing else may carry a lock main.js does not know about
  const stray = [];
  window.GEAR.slots.forEach((s) => Object.keys(window.GEAR.items[s]).forEach((k) => {
    const it = window.GEAR.items[s][k];
    if (it.lock && !ids.has(it.lock)) stray.push(k + ':' + it.lock);
  }));
  ok('메뉴가 모르는 잠금은 없다', stray.length === 0, stray.join(','));
}

console.log('# 목에 거는 소품이 머리에 가려지지 않는가');
{
  /* 몸 소품은 어린 단계에서 위로 당겨진다(아기 -6, 어린이 -4, 청소년 -2).
     몸통이 짧아진 만큼 옷을 올려 주는 보정인데, 나비넥타이처럼 목에 있는
     것은 그만큼 머리 속으로 밀려 들어간다 — 아기는 스물세 줄이 전부
     머리 밑이라 아예 보이지 않았다. `belowHead` 로 머리 아래끝을 기준
     삼아 고쳤고, 아홉 종 · 아홉 단계를 전부 본다. */
  global.window = global;
  require('../renderer/pixel.js'); require('../renderer/tint.js');
  require('../renderer/gear.js'); require('../renderer/species.js');

  const STAGES = ['baby', 'child', 'teen', 'adult', 'elder', 'sage', 'wise', 'spirit', 'legend'];
  const NECK = ['bowtie', 'scarf', 'medal'];

  const rowsOf = (markup, key) => {
    const i = markup.indexOf('data-gear="' + key + '"');
    if (i < 0) return null;
    const seg = markup.slice(i, markup.indexOf('</g>', i));
    const ys = [...seg.matchAll(/y="(\d+)"/g)].map((m) => +m[1] / 5);
    return ys.length ? ys : null;
  };

  const bad = [];
  window.SPECIES.list.forEach((spx) => NECK.forEach((k) => STAGES.forEach((st) => {
    const sp = window.SPECIES.at(spx.key, st, 'normal');
    const ys = rowsOf(sp.markup(), k);
    if (!ys) { bad.push(spx.key + '/' + k + '/' + st + ' 안 그려짐'); return; }
    const headBottom = sp.parts.head.y + sp.parts.head.rows.length;
    const hidden = ys.filter((y) => y < headBottom - 1).length;
    if (hidden / ys.length > 0.5) {
      bad.push(spx.key + '/' + k + '/' + st + ' ' + hidden + '/' + ys.length);
    }
  })));
  ok('목에 거는 소품이 어느 종·어느 단계에서도 머리에 묻히지 않는다',
     bad.length === 0, bad.slice(0, 5).join(', '));

  /* ★어느 옷이든 '아예 안 보이는' 곳은 없어야 한다. 별 망토는 아기에서
     통째로 머리에 먹혀 하나도 보이지 않았다 — 목에 거는 것만 보다가는
     어깨에 걸치는 것을 놓친다. 옷 전부 × 아홉 종 × 아홉 단계를 본다. */
  const unseen = [];
  window.SPECIES.list.forEach((spx) => Object.keys(window.GEAR.items.body).forEach((k) =>
    STAGES.forEach((st) => {
      const sp = window.SPECIES.at(spx.key, st, 'normal');
      const headBottom = sp.parts.head.y + sp.parts.head.rows.length;
      const rows = rowsOf(sp.markup(), k) || [];
      const shown = new Set(rows.filter((y) => y >= headBottom - 1)).size;
      if (shown < 3) unseen.push(spx.key + '/' + k + '/' + st + ' ' + shown + '줄');
    })));
  ok('어떤 옷도 어디서나 최소 세 줄은 보인다', unseen.length === 0,
     unseen.slice(0, 5).join(', '));

  /* 어른의 자리는 그대로여야 한다 — 고치면서 옮겨 놓으면 그것도 버그다.
     아홉 종 모두 어른의 머리 아래끝이 26 이라, belowHead: -4 는 지금까지의
     자리(at 의 y=22)를 그대로 재현한다. */
  const moved = [];
  window.SPECIES.list.forEach((spx) => {
    const a = window.SPECIES.at(spx.key, 'adult', 'normal');
    Object.keys(window.GEAR.items.body).forEach((k) => {
      const it = window.GEAR.items.body[k];
      if (it.belowHead === undefined) return;
      const headBottom = a.parts.head.y + a.parts.head.rows.length;
      if (headBottom + it.belowHead !== it.at[1]) {
        moved.push(spx.key + '/' + k + ' ' + (headBottom + it.belowHead) + ' vs ' + it.at[1]);
      }
    });
  });
  ok('어른이 입은 자리는 예전과 같다', moved.length === 0, moved.slice(0, 4).join(', '));

  /* ★머리 소품이 게에서만 허공에 떠 있었다. 게는 머리가 y14 에서 시작하는데
     (다른 여덟 종은 y4) 소품 자리는 y4 기준으로 적혀 있었고, 게의 보정값은
     -4 라 오히려 더 위로 올라갔다 — 열네 칸 어긋난 채였다.
     이제 머리 소품도 머리 윗줄을 따라간다. */
  const floaty = [];
  window.SPECIES.list.forEach((spx) => STAGES.forEach((st) => {
    const sp = window.SPECIES.at(spx.key, st, 'normal');
    const m = sp.markup();
    const headTop = sp.parts.head.y;
    Object.keys(window.GEAR.items.head).forEach((k) => {
      if (k === 'halo') return;                    // 후광은 머리를 감싼다 — 얹는 것이 아니다
      const rows = rowsOf(m, k);
      if (!rows) { floaty.push(spx.key + '/' + k + '/' + st + ' 안 그려짐'); return; }
      const bottom = Math.max(...rows);
      // 아래끝이 머리 위쪽 근처에 있어야 '얹은 것'으로 보인다
      if (bottom < headTop - 4 || bottom > headTop + 8) {
        floaty.push(spx.key + '/' + k + '/' + st + ' 아래끝 y' + bottom + ' vs 머리위 y' + headTop);
      }
    });
  }));
  ok('머리 소품이 어느 종에서도 허공에 뜨지 않는다', floaty.length === 0,
     floaty.slice(0, 4).join(', '));

  /* 손에 드는 것은 팔(게는 집게)과 겹쳐야 쥔 것으로 보인다. 게는 집게가
     y18..25 인데 물건이 y25..31 에 있어 떨어져 떠 있었다. */
  const loose = [];
  window.SPECIES.list.forEach((spx) => STAGES.forEach((st) => {
    const sp = window.SPECIES.at(spx.key, st, 'normal');
    const m = sp.markup();
    const arm = sp.parts.armR;
    const a0 = arm.y, a1 = arm.y + arm.rows.length - 1;
    Object.keys(window.GEAR.items.hand).forEach((k) => {
      const rows = rowsOf(m, k);
      if (!rows) { loose.push(spx.key + '/' + k + '/' + st + ' 안 그려짐'); return; }
      const lo = Math.max(Math.min(...rows), a0), hi = Math.min(Math.max(...rows), a1);
      if (hi - lo < 1) {
        loose.push(spx.key + '/' + k + '/' + st + ' 팔 y' + a0 + '..' + a1 +
                   ' 물건 y' + Math.min(...rows) + '..' + Math.max(...rows));
      }
    });
  }));
  ok('손에 든 것이 어느 종에서도 팔에 닿는다', loose.length === 0, loose.slice(0, 4).join(', '));
}

console.log('# 뒷모습');
{
  const FACE = /--belly|--nose|#2B2622|#F6C3BB/;
  ['capybara', 'dodam', 'danchu', 'shiba', 'crab'].forEach((k) => {
    const m = window.SPECIES.at(k, 'adult', 'normal').markup();
    const cut = (id) => {
      const i = m.indexOf('id="' + id + '"');
      return i < 0 ? null : m.slice(i, m.indexOf('</g>', i));
    };
    const head = cut('backHead'), body = cut('backBody');
    ok(k + ': 뒷모습 레이어가 있다', !!head && !!body);
    // the crab's shell is hand-drawn and has no plain version, so it is
    // allowed to fall back to its front art; everyone else must be bare
    if (head && k !== 'crab') {
      const faces = (head.match(/fill="([^"]+)"/g) || []).filter((f) => FACE.test(f));
      ok(k + ': 뒷머리에 얼굴이 없다', faces.length === 0, faces.slice(0, 2).join(','));
    }
    if (body && k !== 'crab') {
      const bellies = (body.match(/fill="var\(--belly[^"]*\)"/g) || []);
      ok(k + ': 뒷몸에 배가 없다', bellies.length === 0, String(bellies.length));
    }
    ok(k + ': 평소에는 숨어 있다',
       head.indexOf('style="opacity:0"') >= 0 && body.indexOf('style="opacity:0"') >= 0);
  });

  // 엎드려 is its own drawing: head up, eye open, forelegs out in front.
  // 자기 stays curled with the eye shut.
  ['capybara', 'dodam', 'shiba', 'danchu'].forEach((k) => {
    const sp = window.SPECIES.get(k);
    ok(k + ': 엎드려 그림이 따로 있다', !!sp.lieMarkup && sp.lieMarkup() !== sp.sleepMarkup());

    // the glint only exists on an open eye
    ok(k + ': 엎드려는 눈을 떴다', sp.lieMarkup().indexOf('#FFFFFF') >= 0);
    ok(k + ': 자기는 눈을 감았다', sp.sleepMarkup().indexOf('#FFFFFF') < 0);

    const top = (rows) => rows.findIndex((r) => /[^.]/.test(r));
    ok(k + ': 엎드려가 머리를 더 들고 있다', top(sp.lie.rows) < top(sp.sleep.rows),
       top(sp.lie.rows) + ' vs ' + top(sp.sleep.rows));

    // they swap in place, so the floor must not move
    const floor = (rows) => rows.length - 1 - [...rows].reverse().findIndex((r) => /[^.]/.test(r));
    ok(k + ': 바닥 높이가 같다', floor(sp.lie.rows) === floor(sp.sleep.rows) &&
       sp.lie.y === sp.sleep.y);
  });
  ok('게는 눈이 없어 한 가지뿐', !window.SPECIES.get('crab').lieMarkup ||
     window.SPECIES.get('crab').lieMarkup() === window.SPECIES.get('crab').sleepMarkup());

  // 뒷모습은 아무 데서나 켜면 안 된다 — 도는 재주 둘과, 원반을 물러 달려가는
  // 놀이 하나. 셋뿐이고, 켜는 곳마다 눈을 끄는 짝이 반드시 있어야 한다.
  const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  const shows = (css.match(/#backHead/g) || []).length;
  ok('뒷모습을 켜는 곳은 빙글·구르기·원반뿐', shows === 3, String(shows));
  const backFrames = (css.match(/@keyframes (faceBack|rollBack|discBack)\b/g) || []).length;
  const frontFrames = (css.match(/@keyframes (faceFront|rollFront|discFront)\b/g) || []).length;
  ok('뒷모습을 켤 때마다 눈을 끄는 짝이 있다', backFrames === frontFrames,
     backFrames + '/' + frontFrames);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
