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

console.log('# 하루 상한');
c = hatched();
for (let i = 0; i < 60; i++) { c.hunger = 0; care.actFeed(c); }
ok('하루 획득이 200을 넘지 않는다', c.dayExp <= 200, c.dayExp);

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
  ok('재주로는 경험치가 오르지 않는다', r.gain === 0);
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
