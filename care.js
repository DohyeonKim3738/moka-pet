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
const TRAIT_LEAD = 1.25;   // how far ahead a trait must be to name the pet

const PERSONALITY = {
  play: '활발', love: '다정', food: '먹보', rest: '느긋'
};

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
   before it was ever seen. */
const TITLES = [
  [3, '아기'], [5, '어린이'], [8, '청소년'], [15, '어른'], [30, '장로'], [Infinity, '전설']
];

/* How big the pet is drawn at each stage, as a fraction of the size the
   user picked. The window does the scaling — the same path the size
   slider uses — so nothing in the artwork has to be resized. */
const STAGE_SCALE = {
  egg: 0.60, baby: 0.64, child: 0.76, teen: 0.88,
  adult: 1, elder: 1, legend: 1.06
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
    traits: { play: 0, love: 0, food: 0, rest: 0 },
    tricks: [],
    traitDay: dayKey(now),
    bornAt: 0,                 // set when it hatches, not when the egg appears
    log: [],
    walks: 0, children: 0,
    // lifetime tallies. traits decay every day, so milestones cannot be
    // built on them — these only ever go up.
    meals: 0, snacks: 0, plays: 0, pats: 0, cleans: 0, naps: 0, shows: 0,
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
  out.traits = { play: 0, love: 0, food: 0, rest: 0 };
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

  let dropped = Math.floor((now - c.lastPoop) / 60000 / POOP_EVERY_MIN);
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

  // bedtime, and morning
  if (opts && opts.night) {
    const night = isNight(now, opts.from, opts.to);
    if (night && !c.sleeping) { c.sleeping = true; c.autoSleep = true; }
    else if (!night && c.sleeping && c.autoSleep) { c.sleeping = false; delete c.autoSleep; }
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
const STAGE_KEYS = ['baby', 'child', 'teen', 'adult', 'elder', 'legend'];

function stageTable() {
  const out = [{ stage: 'egg', title: '알', from: null }];
  let from = 1;
  TITLES.forEach(([limit, title], i) => {
    out.push({ stage: STAGE_KEYS[i], title, from });
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

function stageFor(c) {
  if (c.egg) return 'egg';
  const t = titleFor(c.age);
  return { '아기': 'baby', '어린이': 'child', '청소년': 'teen',
           '어른': 'adult', '장로': 'elder', '전설': 'legend' }[t] || 'adult';
}

/* ---------- experience ---------- */

/* No daily ceiling. There used to be one, and it was the wrong tool: the
   thing that stops you rushing a pet is that its needs refill on a clock,
   not on a counter. A full round of care from empty is worth about 78 exp;
   doing it again straight away is worth 18, because it is no longer hungry
   or bored. Someone who looks in often should get further, and now does.
   `dayExp` is still counted — it is worth seeing what today came to. */
function award(c, amount) {
  const today = dayKey(Date.now());
  if (c.dayKey !== today) { c.dayKey = today; c.dayExp = 0; }
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
function actFeed(c) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if (c.hunger >= 95) return { ok: false, reason: '배가 불러요' };
  const need = 100 - c.hunger;
  c.hunger = clamp(c.hunger + 45);
  c.sleeping = false;
  addWeight(c, WEIGHT.meal);
  c.meals = (c.meals || 0) + 1;
  return Object.assign({ ok: true, verb: '밥' }, award(c, Math.round(need / 100 * 18) + 4));
}

/* A snack is the shortcut: it cheers the pet up whether or not it was
   hungry, which is exactly why it costs two and a half times the weight
   of a meal and earns almost no experience. Feeding a pet nothing but
   treats is a way of raising it, and it will show. */
function actSnack(c) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if (c.hunger >= 99) return { ok: false, reason: '더는 못 먹어요' };
  c.hunger = clamp(c.hunger + 18);
  c.fun = clamp(c.fun + Math.round(22 * mods(c).snackFun));
  c.sleeping = false;
  addWeight(c, WEIGHT.snack);
  bump(c, 'food', 1);
  c.snacks = (c.snacks || 0) + 1;
  return Object.assign({ ok: true, verb: '간식' }, award(c, 3));
}

function actPlay(c) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if (c.fun >= 95) return { ok: false, reason: '지금은 신나 있어요' };
  if (c.energy < 15) return { ok: false, reason: '너무 지쳤어요' };
  const need = 100 - c.fun;
  c.fun = clamp(c.fun + 45);
  c.energy = clamp(c.energy - Math.round(8 * mods(c).playCost));
  c.sleeping = false;
  addWeight(c, WEIGHT.play);
  bump(c, 'play', 1);
  c.plays = (c.plays || 0) + 1;
  return Object.assign({ ok: true, verb: '놀기' }, award(c, Math.round(need / 100 * 18) + 4));
}

/* Showing off what it knows. Costs a little, gives a little, and pays no
   experience — a trick you can repeat forever must not be a way to grow. */
function actPerform(c, trick) {
  if (c.egg) return { ok: false, reason: '아직 알이에요' };
  if ((c.tricks || []).indexOf(trick) < 0) return { ok: false, reason: '아직 못 하는 재주예요' };
  if (c.energy < 12) return { ok: false, reason: '너무 지쳤어요' };
  c.fun = clamp(c.fun + 8);
  c.energy = clamp(c.energy - 5);
  c.sleeping = false;
  bump(c, 'love', 0.2);
  c.shows = (c.shows || 0) + 1;
  return { ok: true, verb: '재주', trick, gain: 0, aged: false };
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
  const chance = Math.min(0.92, Math.max(0.15, 0.35 + bond * 0.012 + mods(c).trick));
  c.energy = clamp(c.energy - 12);
  c.fun = clamp(c.fun + 6);
  c.sleeping = false;
  bump(c, 'play', 0.5);

  if (Math.random() > chance) {
    return Object.assign({ ok: true, verb: '훈련', learned: null, trick },
                         award(c, 4));
  }
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
    return { ok: true, verb: '기상', gain: 0, aged: false };
  }
  if (c.energy >= 95) return { ok: false, reason: '아직 쌩쌩해요' };
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
  return Object.assign({ ok: true, verb: '청소' }, award(c, 10));
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
  if (!c.traits) c.traits = { play: 0, love: 0, food: 0, rest: 0 };
  c.traits[key] = (c.traits[key] || 0) + amount;
}

/* The pet is named after whatever it got the most of — but only once it
   is old enough to have a character, and only if one habit is clearly
   ahead of the rest. A pet raised evenly is just itself. */
/* Null until there is something to say. A baby has no character yet —
   labelling it "성격: 아기" read as though being a baby were a
   personality. */
function personality(c) {
  if (c.egg) return null;
  if (c.age < 3) return null;
  const entries = Object.keys(PERSONALITY)
    .map((k) => [k, (c.traits && c.traits[k]) || 0])
    .sort((a, b) => b[1] - a[1]);
  const [top, second] = entries;
  if (top[1] < 8) return '평범';                      // not enough to go on yet
  if (second && second[1] > 0 && top[1] < second[1] * TRAIT_LEAD) return '평범';
  return PERSONALITY[top[0]];
}

/* ---------- what a pet is actually like ----------
   Personality and build were only a label and a wider body: an 활발 pet
   and a 느긋 one got hungry at exactly the same rate, which made "raised
   differently" a caption rather than a fact. These are the numbers that
   make them different animals. */
const NATURE_MOD = {
  play: { fun: 1.35, energy: 1.10, trick:  0.08, wander: 1.6 },   // 활발
  love: { fun: 0.95, patFun: 7,    trick:  0.08 },                // 다정
  food: { hunger: 1.40, snackFun: 1.5, gain: 1.15 },              // 먹보
  rest: { energy: 0.75, fun: 0.85, trick: -0.06, wander: 0.6 }    // 느긋
};

const BUILD_MOD = {
  slim:   { energy: 0.90, playCost: 0.85 },
  normal: {},
  plump:  { energy: 1.10, playCost: 1.20 },
  heavy:  { energy: 1.25, playCost: 1.45, walkBurn: 1.3 }
};

/* the personality as a key rather than a label */
function natureKey(c) {
  if (!c || c.egg || c.age < 3) return null;
  const entries = Object.keys(PERSONALITY)
    .map((k) => [k, (c.traits && c.traits[k]) || 0])
    .sort((a, b) => b[1] - a[1]);
  const [top, second] = entries;
  if (top[1] < 8) return null;
  if (second && second[1] > 0 && top[1] < second[1] * TRAIT_LEAD) return null;
  return top[0];
}

/* every multiplier this pet lives by, in one place */
function mods(c) {
  const n = NATURE_MOD[natureKey(c)] || {};
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
    wander:   (n.wander === undefined ? 1 : n.wander)
  };
}

/* a plain-Korean summary, so the difference is visible and not just felt */
function natureNote(c) {
  const k = natureKey(c);
  const band = weightBand(c);
  const bits = [];
  if (k === 'play') bits.push('금방 심심해하고 자주 돌아다녀요');
  else if (k === 'love') bits.push('쓰다듬어 주면 크게 좋아하고 배우는 게 빨라요');
  else if (k === 'food') bits.push('배가 빨리 고프고 간식을 무척 좋아해요');
  else if (k === 'rest') bits.push('잘 지치지 않지만 배우는 건 느려요');
  if (band === 'heavy') bits.push('무거워서 놀 때 금방 힘들어해요');
  else if (band === 'plump') bits.push('조금 무거워요');
  else if (band === 'slim') bits.push('가벼워서 잘 지치지 않아요');
  return bits.join(' · ') || null;
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
  child.traits = { play: 0, love: 0, food: 0, rest: 0 };
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
    trickTotal: TRICKS.length
  };
}

module.exports = {
  blank, normalize, advance, view, wants, mood, titleFor, needFor, ga, ro, eul,
  actFeed, actSnack, actPlay, actWalk, actSleep, actClean, actTrain, actPat, actGame,
  actPerform,
  weightBand, baseWeight, personality, natureKey, natureNote, mods, nextTrick, TRICKS,
  hatchProgress, hatch, warmEgg, canWarm, reset, stageFor, stageScale, isNight,
  canMate, whyNotMate, inherit, inheritTricks, markMated, MATE_AGE, note,
  stageTable, nextStage,
  POOP_MAX
};
