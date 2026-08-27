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
  ok('시작 나이가 TITLES 와 어긋나지 않는다',
     t[1].from === 1 && t[2].from === 3 && t[4].from === 8 && t[6].from === 30,
     t.map(x => x.from));

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

console.log('# 이정표 표');
{
  const M = require('../missions.js');
  ok('열둘', M.LIST.length === 12, M.LIST.length);
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
  const WANT = {
    cap: 'adult', beret: 'walk100', ribbon: 'three', crown: 'all9',
    bone: 'trick5', broom: 'tidy', mic: 'showoff', suitcase: 'walk20',
    apron: 'chef', medal: 'alltricks', cape: 'legend'
  };
  const find = (key) => {
    let hit = null;
    window.GEAR.slots.forEach((s) => { if (window.GEAR.items[s][key]) hit = window.GEAR.items[s][key]; });
    return hit;
  };
  Object.keys(WANT).forEach((k) => {
    const it = find(k);
    ok('상품 ' + k + ' 는 ' + WANT[k] + ' 로 잠겨 있다', !!it && it.lock === WANT[k],
       it ? String(it.lock) : '없음');
  });
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
  const known = new Set(Object.values(WANT));
  const stray = [];
  window.GEAR.slots.forEach((s) => Object.keys(window.GEAR.items[s]).forEach((k) => {
    const it = window.GEAR.items[s][k];
    if (it.lock && !known.has(it.lock)) stray.push(k + ':' + it.lock);
  }));
  ok('메뉴가 모르는 잠금은 없다', stray.length === 0, stray.join(','));
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

  // and only the two turning tricks are allowed to bring it up
  const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  const shows = (css.match(/#backHead/g) || []).length;
  ok('뒷모습을 켜는 곳은 빙글·구르기뿐', shows === 2, String(shows));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
