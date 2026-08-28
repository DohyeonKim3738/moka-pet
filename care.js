'use strict';

/* ------------------------------------------------------------------ *
 * care.js — the raising simulation.
 *
 * Needs drain against the wall clock, not against ticks, so the pet is
 * in the same shape whether the app ran all afternoon or was launched
 * five minutes ago. Time spent with the app closed is caught up on
 * load and capped, because coming back from a holiday to a ruined pet
 * is a punishment, and this game does not punish.
 *
 * Experience is only awarded for care that was actually needed. Feeding
 * a full pet is worth nothing — otherwise the optimal strategy is to
 * hammer the food button, and there is no raising left in it.
 * ------------------------------------------------------------------ */

/* minutes for a full bar to reach empty */
const DRAIN = { hunger: 4 * 60, fun: 3 * 60, energy: 7 * 60 };
const SLEEP_REFILL_MIN = 120;      // energy 0 -> 100 while asleep
const SLEEP_DRAIN_SCALE = 0.4;     // hunger/fun drain slower while asleep

const OFFLINE_CAP_MIN = 12 * 60;
const POOP_EVERY_MIN = 180;
const POOP_MAX = 4;
const POOP_SPOTS = [2, 44, 10, 36];  // dot columns beside the pet


/* ---------- how it grows up ----------
   Two pets of the same species should not end up the same. What you fed
   it and how often you played shows up in its weight; what you spent
   your attention on shows up in its temperament. Both are plain running
   totals — no hidden dice — so the pet you get is the one you raised. */
/* ---------- what is on the plate ----------
 * Four meals and five snacks. They are not skins: each fills a different
 * amount, sits differently on the ribs, and is enjoyed differently, so
 * choosing is a choice. The numbers are small on purpose — nobody should
 * need a spreadsheet, but a pet raised on 양식 ends up rounder than one
 * raised on 일식, and that is the kind of mark this game keeps.
 *
 * `weight` multiplies the base gain; `fun` is added on top.
 */
/* `after` is how many times you have to have cooked before you know it.
   You learn by cooking, not by being told — the same shape as everything
   else here. It counts across the whole house, because the cook is you,
   not the animal, so a new pet does not send you back to boiled rice. */
const MEALS = [
  { id: 'korean',   label: '한식', hunger: 45, weight: 1.0, fun: 0, note: '골고루',   after: 0 },
  { id: 'western',  label: '양식', hunger: 52, weight: 1.5, fun: 2, note: '든든하게', after: 8 },
  { id: 'chinese',  label: '중식', hunger: 48, weight: 1.4, fun: 5, note: '기름지게', after: 20 },
  { id: 'japanese', label: '일식', hunger: 38, weight: 0.6, fun: 2, note: '가볍게',   after: 40 }
];

const SNACKS = [
  { id: 'cookie',   label: '쿠키',     hunger: 18, weight: 1.0, fun: 22, after: 0 },
  { id: 'fruit',    label: '과일',     hunger: 14, weight: 0.4, fun: 15, after: 5 },
  { id: 'milk',     label: '우유',     hunger: 16, weight: 0.7, fun: 18, after: 12 },
  { id: 'jerky',    label: '육포',     hunger: 22, weight: 1.2, fun: 20, after: 25 },
  { id: 'icecream', label: '아이스크림', hunger: 16, weight: 1.6, fun: 28, after: 45 }
];

/* ---------- and what you do with it ----------
 * Same idea as the menu: four games that cost and give differently, so
 * "놀아주기" is a decision rather than a button. 원반던지기 wears a pet out
 * and takes the weight off; 숨바꼭질 is what you reach for when it is
 * nearly spent.
 */
const PLAYS = [
  { id: 'ball',  label: '공놀이',     fun: 45, energy: 8,  weight: 1.0, after: 0 },
  { id: 'hide',  label: '숨바꼭질',   fun: 38, energy: 5,  weight: 0.5, after: 6 },
  { id: 'tug',   label: '줄다리기',   fun: 42, energy: 11, weight: 1.3, after: 15 },
  { id: 'disc',  label: '원반던지기', fun: 52, energy: 14, weight: 1.7, after: 30 }
];

/* what you know, given how often you have done it at all */
function learned(list, cooked) {
  return list.filter((f) => (f.after || 0) <= (cooked || 0));
}

function foodBy(list, id) { return list.find((f) => f.id === id) || null; }

/* With no dish named — the hover bar has one button, not five — give it
   what it likes, or failing that what it had last. */
function pickFood(c, list, id, prevKey) {
  return foodBy(list, id)
      || favourite(c, list)
      || foodBy(list, c && c[prevKey])
      || list[0];
}

/* Refuse a dish nobody has learned yet — the window disables it, but the
   rules have to hold on their own. */
function canCook(list, id, cooked) {
  const f = foodBy(list, id);
  return !f || (f.after || 0) <= (cooked || 0);
}

/* What it has been given most. A taste is not chosen, it is acquired —
   the same way 성격 and 체형 are — so this is a record of how you fed it,
   not a setting. Needs a few helpings before it means anything. */
function favourite(c, list) {
  const eaten = (c && c.diet) || {};
  let best = null, most = 0;
  list.forEach((f) => {
    const n = eaten[f.id] || 0;
    if (n > most) { most = n; best = f; }
  });
  return most >= 4 ? best : null;
}

const WEIGHT = {
  start: 4,              // at hatching
  perAge: 0.8,           // what a healthy pet of this age weighs
  meal: 0.08,
  snack: 0.22,           // the easy way to make it happy, and it shows
  play: -0.12,
  driftPerHour: 0.01     // metabolism pulls back, but slower than habits push
};

/* Traits accumulate from what you actually do, and decay a little every
   day so a pet can change if you change. */
const TRAIT_DECAY = 0.97;
/* 1등이 2등을 이만큼 앞서면 그 하나가 성격이다. 이 값을 짝 판정과 같은
   1.25 로 두었더니 짝이 거의 안 나왔다 — 1등이 2등보다 조금이라도 앞서면
   바로 단독이 되어 버린다. 단독 기준을 높여 그 사이를 짝에게 준다. */
const TRAIT_SOLO = 1.4;
const TRAIT_LEAD = 1.25;   // 앞선 둘이 3등을 이만큼 앞서야 짝이 된다
const TRAIT_MIN = 8;       // 그 아래면 아직 판단할 게 없다 — 평범

/* 재주 성공률. 화면이 이 식을 다시 적으면 두 벌이 되므로 여기서만 센다. */
const TRICK_BASE = 0.35, TRICK_BOND = 0.012, TRICK_MIN = 0.15, TRICK_MAX = 0.92;
function trickChance(bond, mod) {
  return Math.min(TRICK_MAX, Math.max(TRICK_MIN,
                  TRICK_BASE + (bond || 0) * TRICK_BOND + (mod || 0)));
}

/* ---------- 성격 ----------
   여섯 갈래로 쌓이고, 이름은 그 중 앞선 것에서 나온다. 한 갈래만 뚜렷하면
   그 갈래의 이름을, 두 갈래가 나란히 앞서면 **둘을 합친 이름**을 준다.
   축을 여섯으로 늘린 것보다 짝 이름이 가짓수를 크게 늘린다 — 여섯에
   열다섯 짝을 더해 스물한 가지, 어느 쪽도 뚜렷하지 않으면 평범이다.

   짝 이름을 쓰는 이유는 따로 있다. 축만 늘리면 "쓰다듬기만 누르는 사람"과
   "쓰다듬고 치우는 사람"이 똑같이 다정이 된다. 키운 방식이 다른데 이름이
   같으면 성격이 아니라 딱지다. */
const PERSONALITY = {
  play: '활발', love: '다정', food: '먹보',
  rest: '느긋', tidy: '깔끔', smart: '똑똑'
};

const TRAIT_KEYS = Object.keys(PERSONALITY);

/* 두 갈래가 나란히 앞설 때의 이름. 키는 항상 TRAIT_KEYS 순서로 잇는다 —
   'play+love' 와 'love+play' 가 다른 성격이 되면 안 된다. */
const PERSONALITY_PAIR = {
  'play+love':  '개구쟁이',
  'play+food':  '튼튼이',
  'play+rest':  '변덕쟁이',
  'play+tidy':  '부지런이',
  'play+smart': '재간둥이',
  'love+food':  '응석받이',
  'love+rest':  '포근이',
  'love+tidy':  '살림꾼',
  'love+smart': '눈치백단',
  'food+rest':  '잠꾸러기',
  'food+tidy':  '미식가',
  'food+smart': '꾀돌이',
  'rest+tidy':  '새침이',
  'rest+smart': '사색가',
  'tidy+smart': '모범생'
};

function blankTraits() {
  const t = {};
  TRAIT_KEYS.forEach((k) => { t[k] = 0; });
  return t;
}

/* 있을 수 있는 성격 이름 전부. 대사표(chatter.js)가 이 목록과 어긋나면
   그 성격은 영영 말이 없다 — 검사가 두 표를 맞대어 보는 데 쓴다. */
function personalityNames() {
  return TRAIT_KEYS.map((k) => PERSONALITY[k])
                   .concat(Object.keys(PERSONALITY_PAIR).map((k) => PERSONALITY_PAIR[k]));
}

function pairKey(a, b) {
  const i = TRAIT_KEYS.indexOf(a), j = TRAIT_KEYS.indexOf(b);
  return i < j ? a + '+' + b : b + '+' + a;
}

/* Ten, in the order they are taught. Each one has to be a motion you can
   tell apart across a desk — a name with no move behind it is not a
   trick, so this list and TRICK_POSE in main.js grow together. */
const TRICKS = ['앉아', '손', '엎드려', '빙글', '점프',
                '인사', '기다려', '하이파이브', '구르기', '노래'];

/* Raising two pets to adulthood takes a couple of months, so a family is
   something you work up to rather than something that just happens. */
const MATE_AGE = 8;                       // 어른
const MATE_COOLDOWN_DAYS = 3;

/* A few months of raising leaves no trace unless something writes it
   down. Only the things worth remembering, newest first, and capped so
   the save file cannot grow forever. */
const LOG_MAX = 40;

/* Night. A pet that stands there wide awake at three in the morning is
   not alive, it is a screensaver — and it chatters at you while you are
   trying to work late. Off by default in the simulation, switched on by
   the app so tests stay independent of the clock. */
const NIGHT = { from: 23, to: 7 };

/* 지금 밤이라면 그 밤이 시작된 시각. 손으로 깨운 것이 '이번 밤'의 일인지
   가리는 데 쓴다 — 어젯밤에 깨운 기억으로 오늘 밤을 새우면 안 된다. */
function nightStart(now, from, to) {
  from = Number.isFinite(from) ? from : NIGHT.from;
  to = Number.isFinite(to) ? to : NIGHT.to;
  const d = new Date(now);
  const h = d.getHours();
  d.setMinutes(0, 0, 0);
  // 자정을 넘긴 밤이면 시작은 어제 저녁이다
  if (from > to && h < to) d.setDate(d.getDate() - 1);
  d.setHours(from);
  return d.getTime();
}

function isNight(now, from, to) {
  const h = new Date(now).getHours();
  from = Number.isFinite(from) ? from : NIGHT.from;
  to = Number.isFinite(to) ? to : NIGHT.to;
  return from > to ? (h >= from || h < to) : (h >= from && h < to);
}

/* Age tiers. The numbers are low on purpose: what matters is how long a
   stage LASTS in real days, not how big the number gets. With the curve
   below and attentive care, baby is about a week and legend is roughly a
   year — an age that arrived every few hours meant the baby was gone
   before it was ever seen.

   장로가 15살부터 29살까지를 혼자 다 가지고 있어서, 90일차에 장로가 된 뒤
   349일차에 전설이 될 때까지 여덟 달 반 동안 아무것도 바뀌지 않았다.
   그 구간을 넷으로 쪼갰다 — 어른 이후로는 두 달에 한 번씩 칭호가 바뀐다. */
/* [이 나이 미만까지, 칭호, 그림 단계].
   칭호와 그림 단계는 따로 적는다. 예전에는 STAGE_KEYS 와 순서로 짝지었는데,
   그러면 칭호를 하나 끼워 넣는 순간 그 뒤가 전부 한 칸씩 밀려 어린이가
   청소년 그림을 입는다. 장로 위로 셋을 더 넣으면서 갈라놓았다. */
const TITLES = [
  [3,        '아기',   'baby'],
  [5,        '어린이', 'child'],
  [8,        '청소년', 'teen'],
  [15,       '어른',   'adult'],
  [20,       '장로',   'elder'],
  [24,       '원로',   'sage'],
  [27,       '현자',   'wise'],
  [30,       '영물',   'spirit'],
  [Infinity, '전설',   'legend']
];

/* How big the pet is drawn at each stage, as a fraction of the size the
   user picked. The window does the scaling — the same path the size
   slider uses — so nothing in the artwork has to be resized. */
const STAGE_SCALE = {
  egg: 0.60, baby: 0.64, child: 0.76, teen: 0.88,
  adult: 1, elder: 1, sage: 1, wise: 1.02, spirit: 1.04, legend: 1.06
};
function stageScale(stage) { return STAGE_SCALE[stage] || 1; }

/* ---------- egg ---------- */
const HATCH_MIN = 20;        // an untouched egg hatches on its own
const HATCH_TAPS = 10;       // ...or sooner if you keep it warm
/* Warming has to be spread out, or hammering the egg hatches it in
   seconds and there was never any waiting at all. One touch counts per
   this many minutes; the rest are just affection. */
const WARM_EVERY_MIN = 1.5;

function clamp(v) { return Math.max(0, Math.min(100, v)); }
function dayKey(ms) {
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function blank() {
  const now = Date.now();
  return {
    hunger: 100, fun: 100, energy: 100,
    exp: 0, age: 1,
    weight: WEIGHT.start,
    traits: blankTraits(),
    tricks: [],
    traitDay: dayKey(now),
    bornAt: 0,                 // set when it hatches, not when the egg appears
    log: [],
    walks: 0, children: 0,
    // lifetime tallies. traits decay every day, so milestones cannot be
    // built on them — these only ever go up.
    meals: 0, snacks: 0, plays: 0, pats: 0, cleans: 0, naps: 0, shows: 0,
    diet: {}, lastMeal: null, lastSnack: null, lastPlay: null,   // what it has had, and the last of each
    egg: true, eggAt: now, eggTaps: 0, lastWarm: 0,
    poops: [], sleeping: false,
    lastTick: now, lastPoop: now,
    dayKey: dayKey(now), dayExp: 0
  };
}

/* an older save, a hand-edited file, or a brand new species */
function normalize(c) {
  const base = blank();
  if (!c || typeof c !== 'object') return base;
  const out = Object.assign(base, c);
  ['hunger', 'fun', 'energy'].forEach((k) => {
    out[k] = Number.isFinite(out[k]) ? clamp(out[k]) : 100;
  });
  out.age = Number.isFinite(out.age) && out.age >= 1 ? Math.floor(out.age) : 1;
  out.exp = Number.isFinite(out.exp) && out.exp >= 0 ? out.exp : 0;
  out.dayExp = Number.isFinite(out.dayExp) ? out.dayExp : 0;
  out.sleeping = !!out.sleeping;
  // A save written before eggs existed has no `egg` key, and blank()'s
  // default must not turn a grown pet back into one.
  out.egg = c.egg === undefined ? false : !!c.egg;
  if (!Number.isFinite(out.eggAt)) out.eggAt = Date.now();
  out.eggTaps = Number.isFinite(out.eggTaps) ? out.eggTaps : 0;
  out.weight = Number.isFinite(out.weight) && out.weight > 0 ? out.weight : baseWeight(out.age);
  const t = out.traits && typeof out.traits === 'object' ? out.traits : {};
  // 갈래가 늘었다 — 예전에 저장된 아이는 없는 갈래를 0 으로 채워 받는다
  out.traits = blankTraits();
  Object.keys(out.traits).forEach((k) => {
    if (Number.isFinite(t[k]) && t[k] >= 0) out.traits[k] = t[k];
  });
  out.tricks = Array.isArray(out.tricks) ? out.tricks.filter((x) => TRICKS.indexOf(x) >= 0) : [];
  out.bornWith = Array.isArray(out.bornWith) ? out.bornWith.filter((x) => TRICKS.indexOf(x) >= 0) : [];
  if (typeof out.traitDay !== 'string') out.traitDay = dayKey(Date.now());
  out.bornAt = Number.isFinite(out.bornAt) ? out.bornAt : 0;
  out.walks = Number.isFinite(out.walks) && out.walks >= 0 ? out.walks : 0;
  out.children = Number.isFinite(out.children) && out.children >= 0 ? out.children : 0;
  ['meals', 'snacks', 'plays', 'pats', 'cleans', 'naps', 'shows'].forEach((k) => {
    out[k] = Number.isFinite(out[k]) && out[k] >= 0 ? out[k] : 0;
  });
  // only dishes that exist, only counts that are numbers
  const menu = MEALS.concat(SNACKS).concat(PLAYS).map((f) => f.id);
  const diet = {};
  if (out.diet && typeof out.diet === 'object') {
    menu.forEach((id) => {
      const n = out.diet[id];
      if (Number.isFinite(n) && n > 0) diet[id] = Math.floor(n);
    });
  }
  out.diet = diet;
  ['lastMeal', 'lastSnack', 'lastPlay'].forEach((k) => {
    if (menu.indexOf(out[k]) < 0) out[k] = null;
  });
  out.log = Array.isArray(out.log)
    ? out.log.filter((e) => e && typeof e.text === 'string').slice(0, LOG_MAX)
    : [];
  out.lastWarm = Number.isFinite(out.lastWarm) ? out.lastWarm : 0;
  out.poops = Array.isArray(out.poops) ? out.poops.slice(0, POOP_MAX) : [];
  if (!Number.isFinite(out.lastTick)) out.lastTick = Date.now();
  if (!Number.isFinite(out.lastPoop)) out.lastPoop = Date.now();
  return out;
}

/* Linear, not exponential. The old curve doubled every couple of ages,
   which made the early birthdays arrive in hours and the later ones never.
   At ~150 experience on a well-cared-for day this is about five days to
   leave the baby stage, four months to adulthood, and a year to legend. */
function needFor(age) { return 300 + 150 * (age - 1); }

/* Korean subject particle (이/가) picked by whether the preceding
   syllable ends in a consonant (받침). Hard-coding "이" broke every
   title without a batchim — "아기이 됐어요" instead of "아기가 됐어요". */
function hasBatchim(ch) {
  const code = ch.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return false;   // not a Hangul syllable block
  return code % 28 !== 0;
}
function ga(word) {
  const last = word.charAt(word.length - 1);
  return hasBatchim(last) ? '이' : '가';
}

/* 으로/로. Bare '(으)로' in the middle of a sentence reads like a form
   field. No batchim takes 로, and so does a ㄹ batchim — 장로로, not
   장로으로. */
/* 은/는. Same batchim rule as 이/가, different pair — "쿠키은" is as wrong
   as "쿠키이", and "은(는)" in the middle of a sentence reads like a form. */
function neun(word) {
  const last = String(word || '').trim().slice(-1);
  return hasBatchim(last) ? '은' : '는';
}

function ro(word) {
  const last = word.charAt(word.length - 1);
  const code = last.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return '로';
  const jong = code % 28;
  return (jong === 0 || jong === 8) ? '로' : '으로';   // 8 = ㄹ
}

/* 을/를 — the object particle, same batchim test as 이/가. */
function eul(word) {
  return hasBatchim(word.charAt(word.length - 1)) ? '을' : '를';
}

function titleFor(age) {
  for (const [limit, name] of TITLES) if (age < limit) return name;
  return '전설';
}

function cleanliness(c) { return Math.max(0, 100 - c.poops.length * 25); }

function freeSpot(c) {
  const used = c.poops.map((p) => p.x);
  const open = POOP_SPOTS.filter((x) => used.indexOf(x) < 0);
  return open.length ? open[Math.floor(Math.random() * open.length)] : null;
}

/* ---------- time ---------- */

function advance(c, now, opts) {
  // Hatching is measured from when the egg was laid, not from the last
  // tick, so it must be checked before the "no time has passed" guard.
  // An egg does not get hungry, bored, tired or dirty — it only waits.
  if (c.egg) {
    if (hatchProgress(c) >= 1) hatch(c);
    c.lastTick = now;
    return c;
  }

  const raw = (now - c.lastTick) / 60000;
  if (!(raw > 0)) { c.lastTick = now; return c; }
  const mins = Math.min(OFFLINE_CAP_MIN, raw);

  const scale = c.sleeping ? SLEEP_DRAIN_SCALE : 1;
  const m = mods(c);
  c.hunger = clamp(c.hunger - (mins / DRAIN.hunger) * 100 * scale * m.hunger);
  c.fun = clamp(c.fun - (mins / DRAIN.fun) * 100 * scale * m.fun);
  c.energy = c.sleeping
    ? clamp(c.energy + (mins / SLEEP_REFILL_MIN) * 100)
    : clamp(c.energy - (mins / DRAIN.energy) * 100 * m.energy);

  // A rested pet wakes on its own — unless it went to bed because it is
  // night, in which case it stays down until morning however full its
  // energy gets.
  if (c.sleeping && c.energy >= 100 && !c.autoSleep) c.sleeping = false;

  // 깔끔한 아이는 덜 어지른다 — 성격이 이름표가 아니라 사는 방식이 되도록
  let dropped = Math.floor((now - c.lastPoop) / 60000 / (POOP_EVERY_MIN / m.poop));
  if (dropped > 0) {
    c.lastPoop = now;
    while (dropped-- > 0 && c.poops.length < POOP_MAX) {
      const x = freeSpot(c);
      if (x === null) break;
      c.poops.push({ id: 'p' + now + '-' + c.poops.length, x });
    }
  }

  // Metabolism: weight creeps back toward what is healthy for this age,
  // slowly enough that a week of treats still shows.
  const target = baseWeight(c.age);
  if (Math.abs(c.weight - target) > 0.01) {
    const step = WEIGHT.driftPerHour * (mins / 60);
    c.weight = c.weight > target
      ? Math.max(target, c.weight - step)
      : Math.min(target, c.weight + step);
  }

  decayTraits(c, now);
  // 경험치를 한 번도 못 얻은 날도 하루로 세어야 평균이 맞는다
  rollDay(c, now);

  /* 잠자리와 아침.
   *
   * 예전에는 밤이면 무조건 다시 재웠다. 그래서 밤에 손으로 깨워도 다음
   * 1분 tick 이 도로 재웠고, 버튼은 볼 때마다 「깨우기」였다 — 눌러도
   * 아무 일도 일어나지 않는 것처럼 보인다. actSleep 에는 이미
   * "woken on purpose; do not put it back" 이라고 적혀 있었지만, 그 뜻을
   * 여기서 보지 않았다.
   *
   * 그래서 '이번 밤에 손으로 깨웠는가'를 보고, 그랬으면 그 밤 동안은
   * 도로 재우지 않는다. 밤이 지나면 저절로 풀린다. */
  if (opts && opts.night) {
    const night = isNight(now, opts.from, opts.to);
    if (night) {
      const woke = c.wokeAt && c.wokeAt >= nightStart(now, opts.from, opts.to);
      if (!c.sleeping && !woke) { c.sleeping = true; c.autoSleep = true; }
    } else {
      if (c.sleeping && c.autoSleep) { c.sleeping = false; delete c.autoSleep; }
      delete c.wokeAt;                 // 밤이 끝나면 기억도 끝난다
    }
  }

  c.lastTick = now;
  return c;
}

/* ---------- egg ---------- */

/* Two ways to the same place: time passing, or attention. Whichever is
   further along wins, so a warmed egg never hatches later than one left
   alone. */
function hatchProgress(c) {
  if (!c.egg) return 1;
  const byTime = (Date.now() - c.eggAt) / 60000 / HATCH_MIN;
  const byTaps = c.eggTaps / HATCH_TAPS;
  return Math.max(0, Math.min(1, Math.max(byTime, byTaps)));
}

function hatch(c) {
  if (!c.egg) return false;
  c.egg = false;
  c.eggTaps = 0;
  c.lastWarm = 0;
  c.age = 1;
  c.exp = 0;
  c.bornAt = Date.now();
  c.lastTick = Date.now();
  c.lastPoop = Date.now();
  note(c, 'born', '알에서 태어났어요');
  return true;
}

/* Is a touch going to count right now? The cooldown is invisible from
   the outside, so the pet has to say when it is ready. */
function canWarm(c) {
  return !!c.egg && Date.now() - (c.lastWarm || 0) >= WARM_EVERY_MIN * 60000;
}

/* Touching the egg warms it, but only once every WARM_EVERY_MIN — an
   egg you can rub for four seconds straight is not an egg you waited
   for. Returns 'hatched', 'warmed', or 'soon'. */
function warmEgg(c) {
  if (!c.egg) return 'hatched';
  const now = Date.now();
  if (now - (c.lastWarm || 0) < WARM_EVERY_MIN * 60000) return 'soon';
  c.lastWarm = now;
  c.eggTaps += 1;
  return hatchProgress(c) >= 1 && hatch(c) ? 'hatched' : 'warmed';
}

/* Start this pet over from an egg, on purpose. */
function reset(c) {
  const fresh = blank();
  Object.keys(fresh).forEach((k) => { c[k] = fresh[k]; });
  return c;
}

/* The whole ladder, derived from TITLES so the two can never disagree:
   which stage, what it is called, and the age it starts at. */
const STAGE_KEYS = TITLES.map(([, , stage]) => stage);

function stageTable() {
  const out = [{ stage: 'egg', title: '알', from: null }];
  let from = 1;
  TITLES.forEach(([limit, title, stage]) => {
    out.push({ stage, title, from });
    from = limit;
  });
  return out;
}

/* what this pet turns into next, and when */
function nextStage(c) {
  const table = stageTable();
  const here = stageFor(c);
  const i = table.findIndex((t) => t.stage === here);
  if (i < 0 || i + 1 >= table.length) return null;
  const n = table[i + 1];
  return { stage: n.stage, title: n.title, from: n.from, ro: ro(n.title) };
}

/* 칭호 -> 그림 단계. TITLES 에서 뽑아 만든다 — 손으로 한 번 더 적어 두면
   칭호를 늘릴 때 한쪽만 고치고 지나가게 된다. */
const STAGE_OF_TITLE = TITLES.reduce((m, [, title, stage]) => {
  m[title] = stage; return m;
}, {});

function stageFor(c) {
  if (c.egg) return 'egg';
  return STAGE_OF_TITLE[titleFor(c.age)] || 'adult';
}

/* ---------- experience ---------- */

/* No daily ceiling. There used to be one, and it was the wrong tool: the
   thing that stops you rushing a pet is that its needs refill on a clock,
   not on a counter. A full round of care from empty is worth about 78 exp;
   doing it again straight away is worth 18, because it is no longer hungry
   or bored. Someone who looks in often should get further, and now does.
   `dayExp` is still counted — it is worth seeing what today came to. */
/* 하루가 넘어갈 때 어제까지의 하루치를 남겨 둔다. 이게 있어야 "이 속도면
   며칠"을 짐작이 아니라 실제로 계산할 수 있다. 이레치만 들고 있으면 된다.
   앱을 며칠 꺼 두었다면 그 날들은 기록되지 않는다 — 돌보지 않은 날을 0으로
   세는 것도 틀린 말은 아니지만, 실제로 재 본 날만 남기는 편이 정직하다. */
const EXP_DAYS = 7;

function rollDay(c, now) {
  const today = dayKey(now);
  if (c.dayKey === today) return;
  if (c.dayKey) {
    c.expDays = [Math.round(c.dayExp || 0)].concat(c.expDays || []).slice(0, EXP_DAYS);
  }
  c.dayKey = today;
  c.dayExp = 0;
}

/* 하루에 얼마나 오르고 있나. 다 채운 날들의 평균이다 — 오늘은 아직
   진행 중이라 넣으면 아침마다 "앞으로 백 일" 같은 소리가 나온다. */
function pace(c) {
  const days = (c.expDays || []).filter((n) => Number.isFinite(n));
  if (!days.length) return null;
  return Math.round(days.reduce((a, b) => a + b, 0) / days.length);
}

/* 지금부터 그 나이가 될 때까지 남은 경험치 */
function expToAge(c, target) {
  let n = -c.exp;
  for (let a = c.age; a < target; a++) n += needFor(a);
  return Math.max(0, Math.round(n));
}

function award(c, amount) {
  rollDay(c, Date.now());
  decayTraits(c, Date.now());
  const gain = Math.max(0, amount);
  if (gain <= 0) return { gain: 0, aged: false };

  c.exp += gain;
  c.dayExp += gain;

  let aged = false;
  while (c.exp >= needFor(c.age)) {
    c.exp -= needFor(c.age);
    c.age += 1;
    aged = true;
    const t = titleFor(c.age);
    // only note the birthdays that change what it is
    if (titleFor(c.age - 1) !== t) note(c, 'age', c.age + '살 ' + t + ga(t) + ' 되었어요');
  }
  return { gain, aged };
}

/* Care that was needed pays; topping up a full bar does not. */
/* Two things make the choice worth making beyond the numbers: it lights
   up for the thing it has come to love, and it is unimpressed by the same
   dish twice running. Both land on 즐거움 only — being bored of the menu
   should never mean going hungry. */
function eat(c, food, prevKey) {
  const again = c[prevKey] === food.id;
  const loved = favourite(c, MEALS.concat(SNACKS).concat(PLAYS)) === food;
  let fun = food.fun + (loved ? 3 : 0);
  if (again) fun = Math.round(fun * 0.5);
  c[prevKey] = food.id;
  if (!c.diet) c.diet = {};
  c.diet[food.id] = (c.diet[food.id] || 0) + 1;
  return { fun, again, loved };
}

function actFeed(c, kind) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if (c.hunger >= 95) return { ok: false, reason: '배가 불러요' };
  const meal = pickFood(c, MEALS, kind, 'lastMeal');
  const need = 100 - c.hunger;
  const e = eat(c, meal, 'lastMeal');
  c.hunger = clamp(c.hunger + meal.hunger);
  c.fun = clamp(c.fun + e.fun);
  c.sleeping = false;
  addWeight(c, WEIGHT.meal * meal.weight);
  c.meals = (c.meals || 0) + 1;
  /* 밥도 먹보를 올리되 간식의 3분의 1이다. 밥은 챙겨 줘야 하는 것이고
     간식은 고르는 것이니, 같은 무게로 치면 성실히 밥만 챙긴 아이가
     먹보가 되어 버린다. 오래 '밥은 아무 성격도 안 올린다'였던 것을
     고치는 것이라, 아예 0 으로 두지도 않는다. */
  bump(c, 'food', 0.3);
  return Object.assign({ ok: true, verb: '밥', food: meal.id, label: meal.label,
                         again: e.again, loved: e.loved },
                       award(c, Math.round(need / 100 * 18) + 4));
}

/* A snack is the shortcut: it cheers the pet up whether or not it was
   hungry, which is exactly why it costs two and a half times the weight
   of a meal and earns almost no experience. Feeding a pet nothing but
   treats is a way of raising it, and it will show. */
function actSnack(c, kind) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if (c.hunger >= 99) return { ok: false, reason: '더는 못 먹어요' };
  const snack = pickFood(c, SNACKS, kind, 'lastSnack');
  const e = eat(c, snack, 'lastSnack');
  c.hunger = clamp(c.hunger + snack.hunger);
  c.fun = clamp(c.fun + Math.round(e.fun * mods(c).snackFun));
  c.sleeping = false;
  addWeight(c, WEIGHT.snack * snack.weight);
  bump(c, 'food', 1);
  c.snacks = (c.snacks || 0) + 1;
  return Object.assign({ ok: true, verb: '간식', food: snack.id, label: snack.label,
                         again: e.again, loved: e.loved },
                       award(c, 3));
}

function actPlay(c, kind) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if (c.fun >= 95) return { ok: false, reason: '지금은 신나 있어요' };
  const game = pickFood(c, PLAYS, kind, 'lastPlay');
  const cost = Math.round(game.energy * mods(c).playCost);
  if (c.energy < cost + 7) return { ok: false, reason: '너무 지쳤어요' };
  const need = 100 - c.fun;
  const e = eat(c, game, 'lastPlay');           // same rules: bored of it, or fond of it
  c.fun = clamp(c.fun + e.fun);
  c.energy = clamp(c.energy - cost);
  c.sleeping = false;
  addWeight(c, WEIGHT.play * game.weight);
  bump(c, 'play', 1);
  c.plays = (c.plays || 0) + 1;
  return Object.assign({ ok: true, verb: '놀기', play: game.id, label: game.label,
                         again: e.again, loved: e.loved },
                       award(c, Math.round(need / 100 * 18) + 4));
}

/* Showing off what it knows.
 *
 * This used to pay nothing at all, on the grounds that a trick you can
 * repeat forever must not become a way to grow. That was true of the
 * repeating; it was not a reason to make the whole thing worthless.
 * Teaching ten tricks takes days and had one use — a milestone.
 *
 * So it pays, but badly per unit of effort, and it pays MORE the bigger
 * the repertoire: a pet that knows one thing is doing a party piece, a pet
 * that knows ten is putting on a show.
 *
 *   exp  = 2 + floor(known / 2)      1 trick -> 2,  10 tricks -> 7
 *   fun  = 8 + known                 1 trick -> 9,  10 tricks -> 18
 *
 * It only pays while the pet is actually enjoying it — the same threshold
 * play uses. Ask for a trick from an animal that is already delighted and
 * it will do it, gladly, and learn nothing. That is what stops eighteen
 * clicks in a row from being worth a day of care; the ceiling is the same
 * clock as everything else, not a counter. */
function actPerform(c, trick) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if ((c.tricks || []).indexOf(trick) < 0) return { ok: false, reason: '아직 못 하는 재주예요' };
  if (c.energy < 12) return { ok: false, reason: '너무 지쳤어요' };
  const known = (c.tricks || []).length;
  const keen = c.fun < 95;
  c.fun = clamp(c.fun + 8 + known);
  c.energy = clamp(c.energy - 5);
  c.sleeping = false;
  bump(c, 'love', 0.2);
  c.shows = (c.shows || 0) + 1;
  if (!keen) return { ok: true, verb: '재주', trick, gain: 0, aged: false, jaded: true };
  return Object.assign({ ok: true, verb: '재주', trick },
                       award(c, 2 + Math.floor(known / 2)));
}

/* what one performance is worth right now — the care window says so, or
   nobody would know the repertoire mattered */
function showValue(c) {
  const known = ((c && c.tricks) || []).length;
  return {
    exp: 2 + Math.floor(known / 2),
    fun: 8 + known,
    known,
    keen: !!c && c.fun < 95      // false: it will still perform, but learn nothing
  };
}

/* ---------- the guessing game ----------
   The old Tamagotchi game: the pet turns left or right and you call it.
   Winning is worth more than a plain play session, losing is still time
   spent together. */
function canPlayGame(c) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if (c.energy < 20) return { ok: false, reason: '너무 지쳤어요' };
  if (c.fun >= 98) return { ok: false, reason: '지금은 신나 있어요' };
  return { ok: true };
}

function actGame(c, won) {
  const gate = canPlayGame(c);
  if (!gate.ok) return gate;
  const need = 100 - c.fun;
  c.fun = clamp(c.fun + (won ? 34 : 14));
  c.energy = clamp(c.energy - Math.round(10 * mods(c).playCost));
  c.sleeping = false;
  addWeight(c, WEIGHT.play);
  bump(c, 'play', won ? 1.2 : 0.6);
  return Object.assign({ ok: true, verb: '놀이', won: !!won },
                       award(c, Math.round(need / 100 * (won ? 16 : 8)) + (won ? 6 : 2)));
}

/* A walk is play's older sibling: it costs more energy and gives back
   less fun per minute, but it burns weight properly and now and then the
   pet brings something back. Somewhere to spend a tired evening. */
function actWalk(c) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if (c.energy < 30) return { ok: false, reason: '너무 지쳤어요' };
  if (c.fun >= 98) return { ok: false, reason: '지금은 신나 있어요' };
  const need = 100 - c.fun;
  const mw = mods(c);
  c.fun = clamp(c.fun + 28);
  c.energy = clamp(c.energy - Math.round(22 * mw.playCost));
  c.hunger = clamp(c.hunger - 6);          // walking works up an appetite
  c.sleeping = false;
  addWeight(c, WEIGHT.play * 1.6 * mw.walkBurn);
  c.walks = (c.walks || 0) + 1;
  bump(c, 'play', 0.8);
  bump(c, 'love', 0.4);                    // time spent together counts
  const found = Math.random() < 0.28;
  return Object.assign({ ok: true, verb: '산책', found },
                       award(c, Math.round(need / 100 * 12) + (found ? 10 : 4)));
}

/* Teaching something takes a pet that is awake, interested and old
   enough to concentrate. Whether it lands depends on how much time you
   have already spent playing with it and stroking it — a pet that knows
   you learns faster. */
function actTrain(c) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if (c.age < 3) return { ok: false, reason: '아직 어려요' };
  const trick = nextTrick(c);
  if (!trick) return { ok: false, reason: '더 가르칠 게 없어요' };
  if (c.energy < 25) return { ok: false, reason: '너무 지쳤어요' };
  if (c.fun < 30) return { ok: false, reason: '지금은 시큰둥해요' };

  const bond = ((c.traits && c.traits.love) || 0) + ((c.traits && c.traits.play) || 0);
  const chance = trickChance(bond, mods(c).trick);
  c.energy = clamp(c.energy - 12);
  c.fun = clamp(c.fun + 6);
  c.sleeping = false;
  bump(c, 'play', 0.3);
  bump(c, 'smart', 0.4);          // 가르치려 든 것만으로도 조금은 쌓인다

  if (Math.random() > chance) {
    return Object.assign({ ok: true, verb: '훈련', learned: null, trick },
                         award(c, 4));
  }
  bump(c, 'smart', 1);            // 실제로 배웠을 때가 크다
  c.tricks = (c.tricks || []).concat([trick]);
  note(c, 'trick', '「' + trick + '」' + eul(trick) + ' 배웠어요');
  return Object.assign({ ok: true, verb: '훈련', learned: trick, trick },
                       award(c, 16));
}

/* Stroking is not an action with a button, but it is attention, and
   attention is what makes a pet affectionate. */
function actPat(c) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  bump(c, 'love', 1);
  c.pats = (c.pats || 0) + 1;
  // an affectionate pet actually gets something out of being stroked
  const f = mods(c).patFun;
  if (f) c.fun = clamp(c.fun + f);
  return { ok: true, verb: '쓰다듬기', gain: 0, aged: false };
}

function actSleep(c) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if (c.sleeping) {
    c.sleeping = false;
    delete c.autoSleep;              // woken on purpose; do not put it back
    // 언제 손으로 깨웠는지 남긴다. 밤 자동재우기가 이걸 보고 물러선다 —
    // 이 줄이 없으면 다음 tick 이 도로 재운다.
    c.wokeAt = Date.now();
    return { ok: true, verb: '기상', gain: 0, aged: false };
  }
  if (c.energy >= 95) return { ok: false, reason: '아직 쌩쌩해요' };
  delete c.wokeAt;                   // 손으로 재웠으면 깨어 있겠다는 뜻은 거둔다
  c.sleeping = true;
  bump(c, 'rest', 1);
  c.naps = (c.naps || 0) + 1;
  const need = 100 - c.energy;
  return Object.assign({ ok: true, verb: '잠' }, award(c, Math.round(need / 100 * 14) + 3));
}

function actClean(c, id) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  const before = c.poops.length;
  c.poops = id ? c.poops.filter((p) => p.id !== id) : c.poops.slice(1);
  if (c.poops.length === before) return { ok: false, reason: '치울 게 없어요' };
  c.cleans = (c.cleans || 0) + 1;
  bump(c, 'tidy', 1);
  return Object.assign({ ok: true, verb: '청소' }, award(c, 10));
}

/* ---------- 왜 지금 못 하는가 ----------
 * 조건을 화면마다 따로 적어 두었더니 세 벌(care.js · ring.html · care.html)이
 * 서로 어긋났다. 훈련은 세 살부터인데 막대는 그대로 열어 두었고, 놀기는
 * 놀이마다 드는 힘이 다른데 화면은 15 로 뭉뚱그렸다. 그리고 막힌 버튼은
 * 흐려지기만 할 뿐 이유를 말하지 않아서, 만든 사람조차 "놀기가 왜 안
 * 눌리지" 하고 한참을 헤맸다.
 *
 * 그래서 판단을 여기 한 곳으로 모은다. 조건을 다시 적는 대신 **실제 동작을
 * 복사본에 한 번 태워 본다** — 조건을 옮겨 적으면 그 순간 또 두 벌이 된다.
 * 복사본이라 진짜 상태는 건드리지 않는다. */
const PROBES = [
  ['feed',  (c) => actFeed(c)],
  ['snack', (c) => actSnack(c)],
  ['play',  (c) => actPlay(c)],
  ['walk',  (c) => actWalk(c)],
  ['train', (c) => actTrain(c)],
  ['sleep', (c) => actSleep(c)],
  ['clean', (c) => actClean(c)],
  ['show',  (c) => actPerform(c, (c.tricks || [])[0])]
];

function blocked(c) {
  const out = {};
  PROBES.forEach(([key, run]) => {
    let why = null;
    try {
      const r = run(JSON.parse(JSON.stringify(c)));
      if (!r || !r.ok) why = (r && r.reason) || '지금은 안 돼요';
    } catch (e) {
      why = null;               // 알 수 없으면 막지 않는다 — 막는 쪽이 더 나쁘다
    }
    out[key] = why;
  });
  // 재주를 하나도 모르면 "못 하는 재주예요"가 아니라 아직 배운 게 없는 것이다
  if (out.show && !(c.tricks || []).length) out.show = '아직 배운 재주가 없어요';
  return out;
}

/* ---------- reporting ---------- */

/* ---------- weight ---------- */

function baseWeight(age) { return WEIGHT.start + (age - 1) * WEIGHT.perAge; }

/* Four bands, measured against what is healthy for that age rather than
   an absolute number — a legend is meant to be heavier than a puppy. */
function weightBand(c) {
  const r = c.weight / baseWeight(c.age);
  if (r < 0.86) return 'slim';
  if (r < 1.16) return 'normal';
  if (r < 1.45) return 'plump';
  return 'heavy';
}

const WEIGHT_LABEL = { slim: '날씬', normal: '보통', plump: '통통', heavy: '포동포동' };

function addWeight(c, kg) {
  // a 먹보 puts it on faster; nothing makes losing it slower
  if (kg > 0) kg *= mods(c).gain;
  // the floor moves with age: a legend cannot waste away to puppy weight
  c.weight = Math.max(baseWeight(c.age) * 0.5, c.weight + kg);
}

/* ---------- temperament ---------- */

/* Habits fade a little each day, so a pet raised on treats can become
   something else if you start playing with it instead. Keyed off its own
   day stamp: called from both the clock and from actions, it must only
   ever fire once per day however many times it is asked. */
function decayTraits(c, now) {
  const today = dayKey(now);
  if (!c.traitDay) { c.traitDay = today; return; }
  if (c.traitDay === today) return;
  const days = Math.max(1, Math.round((now - Date.parse(c.traitDay)) / 86400000) || 1);
  const k = Math.pow(TRAIT_DECAY, days);
  if (c.traits) Object.keys(c.traits).forEach((key) => { c.traits[key] *= k; });
  c.traitDay = today;
}

function bump(c, key, amount) {
  if (!c.traits) c.traits = blankTraits();
  c.traits[key] = (c.traits[key] || 0) + amount;
}

/* The pet is named after whatever it got the most of — but only once it
   is old enough to have a character, and only if one habit is clearly
   ahead of the rest. A pet raised evenly is just itself. */
/* Null until there is something to say. A baby has no character yet —
   labelling it "성격: 아기" read as though being a baby were a
   personality. */
function personality(c) {
  const k = natureKeys(c);
  if (k === null) return null;
  if (k.length === 0) return '평범';
  if (k.length === 1) return PERSONALITY[k[0]];
  return PERSONALITY_PAIR[pairKey(k[0], k[1])] || '평범';
}

/* 앞선 갈래를 순서대로 돌려준다.
     null  아직 성격이라 할 게 없다(알·세 살 미만)
     []    평범
     [a]   한 갈래가 뚜렷하다
     [a,b] 두 갈래가 나란히 앞선다

   판정이 두 단계인 이유: 1등이 2등을 확실히 앞서면 그 하나가 성격이고,
   그렇지 않더라도 **둘이 3등을 확실히 앞서면** 그 둘이 성격이다. 셋 이상이
   엉키면 골고루 키운 것이니 평범이다. */
function natureKeys(c) {
  if (!c || c.egg) return null;
  if (c.age < 3) return null;
  const e = TRAIT_KEYS
    .map((k) => [k, (c.traits && c.traits[k]) || 0])
    .sort((a, b) => b[1] - a[1]);
  const [top, second, third] = e;
  if (top[1] < TRAIT_MIN) return [];                     // 아직 판단할 게 없다
  if (!second || top[1] >= second[1] * TRAIT_SOLO) return [top[0]];
  if (second[1] < TRAIT_MIN) return [top[0]];            // 2등이 허수면 1등만
  if (!third || second[1] >= third[1] * TRAIT_LEAD) return [top[0], second[0]];
  return [];
}

/* ---------- what a pet is actually like ----------
   Personality and build were only a label and a wider body: an 활발 pet
   and a 느긋 one got hungry at exactly the same rate, which made "raised
   differently" a caption rather than a fact. These are the numbers that
   make them different animals. */
const NATURE_MOD = {
  play:  { fun: 1.35, energy: 1.10, trick:  0.08, wander: 1.6 },  // 활발
  love:  { fun: 0.95, patFun: 7,    trick:  0.08 },               // 다정
  food:  { hunger: 1.40, snackFun: 1.5, gain: 1.15 },             // 먹보
  rest:  { energy: 0.75, fun: 0.85, trick: -0.06, wander: 0.6 },  // 느긋
  tidy:  { poop: 0.7, fun: 0.95, wander: 0.85 },                  // 깔끔
  /* 재주 보정은 **더하기 하나로만** 준다. 곱하기(learn)를 같이 걸었더니
     기본 35% 인 성공률이 똑똑 74%, 재간둥이 86% 가 되어 훈련이 거의 무조건
     성공했다 — 재주 열 개 이정표가 성격 하나로 무너진다. */
  smart: { trick: 0.14, fun: 1.10 }                               // 똑똑
};

const BUILD_MOD = {
  slim:   { energy: 0.90, playCost: 0.85 },
  normal: {},
  plump:  { energy: 1.10, playCost: 1.20 },
  heavy:  { energy: 1.25, playCost: 1.45, walkBurn: 1.3 }
};

/* 성격을 이름 대신 갈래 하나로 — 짝일 때는 앞선 쪽을 준다 */
function natureKey(c) {
  const k = natureKeys(c);
  return (k && k.length) ? k[0] : null;
}

/* every multiplier this pet lives by, in one place */
/* 두 갈래가 겹치면 곱하는 값은 곱하고 더하는 값은 더한다 — 표를 짝마다
   손으로 적으면 열다섯 벌이 되고, 한 축을 고칠 때마다 다섯 곳을 놓친다. */
const NATURE_ADD = ['trick', 'patFun'];

function natureMod(c) {
  const keys = natureKeys(c) || [];
  const out = {};
  keys.forEach((k) => {
    const m = NATURE_MOD[k] || {};
    Object.keys(m).forEach((f) => {
      if (NATURE_ADD.indexOf(f) >= 0) out[f] = (out[f] || 0) + m[f];
      else out[f] = (out[f] === undefined ? 1 : out[f]) * m[f];
    });
  });
  return out;
}

function mods(c) {
  const n = natureMod(c);
  const b = BUILD_MOD[weightBand(c)] || {};
  const pick = (k, d) => (n[k] === undefined ? d : n[k]) * (b[k] === undefined ? 1 : b[k]);
  return {
    hunger:   pick('hunger', 1),
    fun:      pick('fun', 1),
    energy:   pick('energy', 1),
    playCost: (b.playCost === undefined ? 1 : b.playCost),
    walkBurn: (b.walkBurn === undefined ? 1 : b.walkBurn),
    trick:    (n.trick || 0),
    gain:     (n.gain === undefined ? 1 : n.gain),
    snackFun: (n.snackFun === undefined ? 1 : n.snackFun),
    patFun:   (n.patFun === undefined ? 0 : n.patFun),
    wander:   (n.wander === undefined ? 1 : n.wander),
    poop:     (n.poop === undefined ? 1 : n.poop)
  };
}

/* 무엇이 달라지는지 한국어로 — 성격이 딱지가 아니라는 걸 보이려면
   이름 옆에 그 결과가 같이 있어야 한다. 짝이면 두 줄이 다 나온다. */
const NATURE_NOTE = {
  play:  '금방 심심해하고 자주 돌아다녀요',
  love:  '쓰다듬어 주면 크게 좋아해요',
  food:  '배가 빨리 고프고 간식을 무척 좋아해요',
  rest:  '잘 지치지 않고 느긋해요',
  tidy:  '덜 어지르고 얌전히 있는 편이에요',
  smart: '호기심이 많아요'
};

function natureNote(c) {
  const keys = natureKeys(c) || [];
  const bits = keys.map((k) => NATURE_NOTE[k]).filter(Boolean);

  /* 배우는 속도는 갈래마다 적어 두면 안 된다 — 느긋(-0.06)과 똑똑(+0.14)이
     겹친 아이한테 "배우는 건 느려요 · 금방 배워요" 가 나란히 붙었다.
     합친 결과를 한 번만 말한다. */
  if (keys.length) {
    const t = mods(c).trick;
    if (t >= 0.1) bits.push('가르치면 금방 배워요');
    else if (t <= -0.03) bits.push('배우는 건 조금 느려요');
  }

  const band = weightBand(c);
  if (band === 'heavy') bits.push('무거워서 놀 때 금방 힘들어해요');
  else if (band === 'plump') bits.push('조금 무거워요');
  else if (band === 'slim') bits.push('가벼워서 잘 지치지 않아요');
  return bits.join(' · ') || null;
}

/* ---------- 알아두기 ----------
   성격이 어떻게 정해지고 무엇을 바꾸는지는 여태 코드 안에만 있었다. 화면에
   숫자를 옮겨 적으면 그 순간 두 벌이 되고, 이 저장소는 그걸로 이미 여러 번
   당했다(missions 의 안 쓰이는 안내문, 낡은 README, 막대와 어긋난 잠금).

   그래서 표를 적지 않는다. **복사본에 실제 동작을 태워 보고**, 실제 보정
   계산을 그대로 불러서 뽑는다 — `blocked()` 가 쓰는 방법과 같다. 규칙을
   고치면 안내가 저절로 따라온다. */

/* 무엇이든 할 수 있는 상태의 다섯 살배기. 어느 하나라도 막히면 그 행동은
   아무것도 안 올린 것처럼 보이므로, 문턱을 전부 넘겨 둔다. */
function guidePet() {
  const c = blank();
  c.egg = false;
  c.hatch = 100;
  c.age = 5;
  c.hunger = 40;
  c.fun = 60;
  c.energy = 90;
  c.weight = baseWeight(5);
  c.tricks = ['앉아'];
  c.poops = [{ id: 'guide', x: 2 }];
  c.sleeping = false;
  return c;
}

/* 훈련은 성공 여부가 운이라 한 번 태워서는 폭을 알 수 없다. 주사위를 양쪽
   끝으로 고정해 두 번 태우고 최소~최대로 적는다. */
function withDice(v, fn) {
  const real = Math.random;
  Math.random = function () { return v; };
  try { return fn(); } finally { Math.random = real; }
}

const GUIDE_ACTS = [
  ['밥 주기',       (c) => actFeed(c)],
  ['간식 주기',     (c) => actSnack(c)],
  ['놀아주기',      (c) => actPlay(c)],
  ['산책',          (c) => actWalk(c)],
  ['게임',          (c) => actGame(c, true)],
  ['재주 가르치기', (c) => actTrain(c)],
  ['재주 시키기',   (c) => actPerform(c, '앉아')],
  ['쓰다듬기',      (c) => actPat(c)],
  ['재우기',        (c) => actSleep(c)],
  ['치우기',        (c) => actClean(c)]
];

/* 어떤 행동이 어떤 갈래를 얼마나 올리는가 — 적어 두지 않고 태워 본다 */
function traitSources() {
  return GUIDE_ACTS.map(([label, run]) => {
    const runs = [0, 0.999].map((dice) => {
      const c = JSON.parse(JSON.stringify(guidePet()));
      let ok = false;
      try { ok = !!(withDice(dice, () => run(c)) || {}).ok; } catch (e) { ok = false; }
      return { ok, traits: c.traits };
    });
    const base = guidePet().traits;
    const gains = TRAIT_KEYS.map((k) => {
      const vs = runs.map((r) => Math.round(((r.traits[k] || 0) - (base[k] || 0)) * 100) / 100);
      return { key: k, name: PERSONALITY[k], min: Math.min.apply(null, vs), max: Math.max.apply(null, vs) };
    }).filter((g) => g.max > 0);
    return { act: label, reached: runs.some((r) => r.ok), gains };
  });
}

/* 성격 하나가 실제로 바꾸는 값. mods() 를 그대로 불러 쓰므로 보정을 고치면
   안내도 같이 바뀐다. 시간은 '0 에서 100 까지 차는 데 걸리는 시간'이다. */
function effectsOf(c) {
  const m = mods(c);
  const r1 = (n) => Math.round(n * 10) / 10;
  return {
    hungerH: r1(DRAIN.hunger / 60 / m.hunger),
    funH:    r1(DRAIN.fun / 60 / m.fun),
    energyH: r1(DRAIN.energy / 60 / m.energy),
    trick:   Math.round(trickChance(0, m.trick) * 100),
    poopH:   r1(POOP_EVERY_MIN / 60 / m.poop),
    wander:  Math.round(m.wander * 100) / 100,
    patFun:  m.patFun,
    snackFun: m.snackFun,
    gain:    Math.round(m.gain * 100) / 100,
    playCost: Math.round(m.playCost * 100) / 100,
    walkBurn: Math.round(m.walkBurn * 100) / 100
  };
}

function natureTable() {
  const rows = [{ name: '평범', keys: [] }];
  TRAIT_KEYS.forEach((k) => rows.push({ name: PERSONALITY[k], keys: [k] }));
  Object.keys(PERSONALITY_PAIR).forEach((pk) =>
    rows.push({ name: PERSONALITY_PAIR[pk], keys: pk.split('+') }));

  return rows.map((r) => {
    const c = guidePet();
    r.keys.forEach((k, i) => { c.traits[k] = i === 0 ? 20 : 18; });
    if (r.keys.length === 1) c.traits[r.keys[0]] = 30;
    return {
      name: r.name,
      parts: r.keys.map((k) => PERSONALITY[k]),
      // 표에 적은 이름과 실제 판정이 어긋나면 그건 안내가 아니라 거짓말이다
      reads: personality(c),
      effects: effectsOf(c)
    };
  });
}

function buildTable() {
  return ['slim', 'normal', 'plump', 'heavy'].map((band) => {
    const c = guidePet();
    // 그 체형으로 읽히는 무게를 찾는다 — 경계값을 옮겨 적지 않기 위해
    const base = baseWeight(c.age);
    let w = base * 0.5;
    while (w < base * 2.5) {
      c.weight = w;
      if (weightBand(c) === band) break;
      w += base * 0.01;
    }
    return { key: band, name: WEIGHT_LABEL[band], reads: weightBand(c), effects: effectsOf(c) };
  });
}

function guide() {
  return {
    rules: { solo: TRAIT_SOLO, lead: TRAIT_LEAD, min: TRAIT_MIN,
             decay: Math.round((1 - TRAIT_DECAY) * 100), fromAge: 3 },
    traits: TRAIT_KEYS.map((k) => ({ key: k, name: PERSONALITY[k], note: NATURE_NOTE[k] })),
    sources: traitSources(),
    natures: natureTable(),
    builds: buildTable()
  };
}

/* ---------- tricks ---------- */

/* ---------- family ---------- */

function canMate(c) {
  if (!c || c.egg) return false;
  if (c.age < MATE_AGE) return false;
  if (c.sleeping) return false;
  return Date.now() - (c.lastMate || 0) >= MATE_COOLDOWN_DAYS * 86400000;
}

function whyNotMate(c) {
  if (!c || c.egg) return '아직 알이에요';
  if (c.age < MATE_AGE) return '어른이 되어야 해요 (' + MATE_AGE + '살)';
  if (c.sleeping) return '자고 있어요';
  const left = MATE_COOLDOWN_DAYS * 86400000 - (Date.now() - (c.lastMate || 0));
  if (left > 0) return Math.ceil(left / 86400000) + '일 더 기다려야 해요';
  return null;
}

/* The child starts with half of what its parents became: their habits,
   averaged and halved, so it leans their way without being finished. */
/* A puppy that already knows a trick its parents both knew is the kind
   of detail that makes a family feel like a family. Never more than two,
   so there is always something left for you to teach. */
function inheritTricks(a, b) {
  const A = a.tricks || [], B = b.tricks || [];
  const out = [];
  TRICKS.forEach((t) => {
    if (out.length >= 2) return;
    const both = A.indexOf(t) >= 0 && B.indexOf(t) >= 0;
    const one = A.indexOf(t) >= 0 || B.indexOf(t) >= 0;
    if (!one) return;
    if (Math.random() < (both ? 0.6 : 0.25)) out.push(t);
  });
  return out;
}

function inherit(child, a, b) {
  const ta = a.traits || {}, tb = b.traits || {};
  child.tricks = inheritTricks(a, b);
  child.bornWith = child.tricks.slice();
  child.traits = blankTraits();
  Object.keys(child.traits).forEach((k) => {
    child.traits[k] = (((ta[k] || 0) + (tb[k] || 0)) / 2) * 0.5;
  });
  // and their build: a family of round pets tends to be round
  const ra = a.weight / baseWeight(a.age);
  const rb = b.weight / baseWeight(b.age);
  child.weight = baseWeight(1) * Math.max(0.7, Math.min(1.4, (ra + rb) / 2));
  return child;
}

function markMated(c) { c.lastMate = Date.now(); }

/* ---------- the record ---------- */

function note(c, kind, text) {
  if (!c.log) c.log = [];
  c.log.unshift({ t: Date.now(), kind, text });
  if (c.log.length > LOG_MAX) c.log.length = LOG_MAX;
  return c;
}

function nextTrick(c) {
  return TRICKS.find((t) => (c.tricks || []).indexOf(t) < 0) || null;
}

function mood(c) {
  const avg = (c.hunger + c.fun + c.energy + cleanliness(c)) / 4;
  if (avg < 30) return 'low';
  if (avg < 60) return 'mid';
  return 'good';
}

/* the single thing the pet most wants right now, or null */
function wants(c) {
  if (c.egg) return null;              // an egg has no needs to nag about
  const items = [
    ['hunger', c.hunger, '배고파요'],
    ['fun', c.fun, '심심해요'],
    ['energy', c.energy, '졸려요'],
    ['clean', cleanliness(c), '치워주세요']
  ].filter((it) => it[1] < 25).sort((a, b) => a[1] - b[1]);
  return items.length ? { key: items[0][0], text: items[0][2] } : null;
}

function view(c) {
  return {
    hunger: Math.round(c.hunger),
    fun: Math.round(c.fun),
    energy: Math.round(c.energy),
    clean: cleanliness(c),
    poops: c.poops.map((p) => ({ id: p.id, x: p.x })),
    sleeping: c.sleeping,
    age: c.age,
    title: c.egg ? '알' : titleFor(c.age),
    egg: !!c.egg,
    stage: stageFor(c),
    next: nextStage(c),
    hatch: Math.round(hatchProgress(c) * 100),
    canWarm: canWarm(c),
    bornAt: c.bornAt || 0,
    log: (c.log || []).slice(0, 10),
    canMate: canMate(c),
    mateBlocked: whyNotMate(c),
    blocked: blocked(c),
    // 스스로 잠든 것인지, 손으로 재운 것인지. 화면이 "왜 자고 있는지"를
    // 말해 줄 수 있어야 한다 — 밤에 자는 걸 고장으로 오해했다.
    napKind: c.sleeping ? (c.autoSleep ? 'auto' : 'manual') : null,
    // 다음 칭호까지 — 남은 경험치와, 요즘 속도로 며칠쯤인지
    toNext: (function () {
      const n = nextStage(c);
      if (!n || c.egg) return null;
      const need = expToAge(c, n.from);
      const per = pace(c);
      return {
        title: n.title, from: n.from, ro: n.ro, exp: need,
        pace: per,
        days: per > 0 ? Math.max(1, Math.ceil(need / per)) : null
      };
    })(),
    ladder: stageTable().filter((t) => t.stage !== 'egg')
      .map((t) => ({ title: t.title, from: t.from, now: t.title === titleFor(c.age) })),
    exp: Math.round(c.exp),
    expNeed: needFor(c.age),
    dayExp: Math.round(c.dayExp),
    mood: mood(c),
    weight: Math.round(c.weight * 10) / 10,
    weightBase: Math.round(baseWeight(c.age) * 10) / 10,
    build: weightBand(c),
    buildLabel: WEIGHT_LABEL[weightBand(c)],
    personality: personality(c),
    nature: natureKey(c),
    natureNote: natureNote(c),
    wander: mods(c).wander || 1,
    tricks: (c.tricks || []).slice(),
    walks: c.walks || 0,
    children: c.children || 0,
    meals: c.meals || 0, snacks: c.snacks || 0, plays: c.plays || 0,
    pats: c.pats || 0, cleans: c.cleans || 0, naps: c.naps || 0, shows: c.shows || 0,
    nextTrick: nextTrick(c),
    bornWith: (c.bornWith || []).slice(),
    canGame: canPlayGame(c).ok,
    gameBlocked: canPlayGame(c).reason || null,
    trickTotal: TRICKS.length,
    show: showValue(c),
    meals: MEALS.map((f) => ({ id: f.id, label: f.label, note: f.note, neun: neun(f.label) })),
    snacks: SNACKS.map((f) => ({ id: f.id, label: f.label, neun: neun(f.label) })),
    plays: PLAYS.map((f) => ({ id: f.id, label: f.label, neun: neun(f.label) })),
    lastMeal: c.lastMeal || null,
    lastSnack: c.lastSnack || null,
    lastPlay: c.lastPlay || null,
    favMeal: (favourite(c, MEALS) || {}).id || null,
    favSnack: (favourite(c, SNACKS) || {}).id || null,
    favPlay: (favourite(c, PLAYS) || {}).id || null,
    diet: Object.assign({}, c.diet || {})
  };
}

module.exports = {
  blocked, nightStart, pace, expToAge,
  blank, normalize, advance, view, wants, mood, titleFor, needFor, ga, ro, eul, neun,
  actFeed, actSnack, actPlay, actWalk, actSleep, actClean, actTrain, actPat, actGame,
  actPerform, showValue, MEALS, SNACKS, PLAYS, favourite, learned, canCook,
  weightBand, baseWeight, personality, personalityNames, natureKey, natureKeys, guide,
  natureNote, mods, nextTrick, TRICKS,
  hatchProgress, hatch, warmEgg, canWarm, reset, stageFor, stageScale, isNight,
  canMate, whyNotMate, inherit, inheritTricks, markMated, MATE_AGE, note,
  stageTable, nextStage,
  POOP_MAX
};
