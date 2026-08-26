/* ------------------------------------------------------------------
 * missions.js — the twelve milestones, and which prizes they hold back.
 *
 * Every milestone is a count against a target. Saying so in one place is
 * what lets the care window show how far along you are: five of these are
 * pure tallies, and "모두 합쳐 100번" with no running total is a homework
 * assignment with no due date. `done` is derived from the count, never
 * written down twice.
 *
 * Nothing here reads global state. A milestone's `now` is handed a small
 * world object so the whole table can be exercised in a test:
 *
 *   world.best(pick)   the best any one pet manages — growth is about a
 *                      single animal, not the household
 *   world.tally(field) the same field added up across every pet
 *   world.hatched      how many are out of the shell
 *   world.species      how many of the nine base species have hatched
 *   world.trickTotal   how many tricks there are to learn
 * ------------------------------------------------------------------ */
'use strict';

const LIST = [
  { id: 'adult',  title: '어른까지 키우기',      how: '한 마리를 8살까지',
    prize: '졸업 모자 · 러그', badge: '보호자', unit: '살',
    goal: 8, now: (w) => w.best((c) => c.age) },

  { id: 'trick5', title: '재주 다섯 개 가르치기', how: '한 마리에게 5가지',
    prize: '뼈다귀 · 원반', badge: '훈련사', unit: '가지',
    goal: 5, now: (w) => w.best((c) => (c.tricks || []).length) },

  { id: 'walk20', title: '산책 스무 번',          how: '모두 합쳐 20번',
    prize: '여행 가방 · 강아지집', badge: '산책왕', unit: '번',
    goal: 20, now: (w) => w.tally('walks') },

  { id: 'family', title: '아이 낳기',            how: '어른 둘로 한 번',
    prize: '가족 액자', badge: '가족', unit: '명',
    goal: 1, now: (w) => w.tally('children') },

  { id: 'all9',   title: '아홉 마리 모두 만나기', how: '알을 아홉 번 깨우기',
    prize: '황금 왕관 · 사진 벽', badge: '아홉의 친구', unit: '마리',
    goal: 9, now: (w) => w.species },

  { id: 'legend', title: '전설까지 키우기',       how: '한 마리를 30살까지',
    prize: '별 망토 · 레드카펫', badge: '전설의 주인', unit: '살',
    goal: 30, now: (w) => w.best((c) => c.age) },

  /* The second six are about the doing rather than the growing: they add
     up across every pet in the save, so they keep counting whichever one
     you are looking after today. */
  { id: 'alltricks', title: '재주 열 개 모두 가르치기', how: '한 마리에게 10가지',
    prize: '금메달 · 트로피', badge: '사범', unit: '가지',
    goal: 10, now: (w) => w.best((c) => (c.tricks || []).length) },

  { id: 'chef',   title: '밥 백 번 차려주기',      how: '모두 합쳐 100번',
    prize: '앞치마 · 간식 통', badge: '집밥', unit: '번',
    goal: 100, now: (w) => w.tally('meals') },

  { id: 'tidy',   title: '치우기 쉰 번',           how: '모두 합쳐 50번',
    prize: '빗자루 · 양동이', badge: '깔끔이', unit: '번',
    goal: 50, now: (w) => w.tally('cleans') },

  { id: 'showoff', title: '재주 백 번 보여주기',   how: '모두 합쳐 100번',
    prize: '마이크 · 스피커', badge: '무대체질', unit: '번',
    goal: 100, now: (w) => w.tally('shows') },

  { id: 'walk100', title: '산책 백 번',            how: '모두 합쳐 100번',
    prize: '탐험 모자 · 잔디 바닥', badge: '탐험가', unit: '번',
    goal: 100, now: (w) => w.tally('walks') },

  { id: 'three',  title: '세 마리 함께 키우기',    how: '알 셋을 깨우기',
    prize: '리본 · 선반', badge: '대가족', unit: '마리',
    goal: 3, now: (w) => w.hatched }
];

function byId(id) { return LIST.find((m) => m.id === id) || null; }
function title(id) { const m = byId(id); return m ? m.title : ''; }

/* how far along, never above the target */
function now(m, world) {
  let n = 0;
  try { n = m.now(world) || 0; } catch (e) { n = 0; }
  return Math.max(0, Math.min(m.goal, n));
}

function met(m, world) { return now(m, world) >= m.goal; }

/* ---------- what the milestones hold back ----------
   Kept next to the milestones, not next to the drawings: an item losing
   its lock is silent — it simply turns up in the menu for free — so the
   two tables have to be read together. */
const GEAR_LOCKS = {
  head: { cap: 'adult', crown: 'all9', beret: 'walk100', ribbon: 'three' },
  hand: { bone: 'trick5', suitcase: 'walk20', broom: 'tidy', mic: 'showoff' },
  body: { cape: 'legend', apron: 'chef', medal: 'alltricks' }
};

const GEAR_PRIZES = {
  head: [['졸업 모자', 'cap'], ['황금 왕관', 'crown'],
         ['탐험 모자', 'beret'], ['리본', 'ribbon']],
  hand: [['뼈다귀', 'bone'], ['여행 가방', 'suitcase'],
         ['빗자루', 'broom'], ['마이크', 'mic']],
  body: [['별 망토', 'cape'], ['앞치마', 'apron'], ['금메달', 'medal']]
};

const ROOM_LOCKS = {
  house: 'walk20', frame: 'family', rug: 'adult', grass: 'walk100',
  shelf: 'three', wall9: 'all9', carpet: 'legend', trophy: 'alltricks',
  jar: 'chef', disc: 'trick5', bucket: 'tidy', speaker: 'showoff'
};

/* Must stay in step with renderer/room.js. */
const SIDE_ITEMS = [
  ['밥그릇', 'bowl'], ['물그릇', 'water'], ['뼈다귀', 'bone'], ['공', 'ball'],
  ['화분', 'plant'], ['인형', 'plush'], ['원반', 'disc'], ['양동이', 'bucket'],
  ['스피커', 'speaker'], ['트로피', 'trophy'], ['간식 통', 'jar']
];

const ROOM_SLOTS = [
  ['back',  '뒤쪽 배경', [['창문', 'window'], ['강아지집', 'house'],
                          ['가족 액자', 'frame'], ['선반', 'shelf'], ['사진 벽', 'wall9']]],
  ['floor', '바닥',      [['방석', 'cushion'], ['타일 바닥', 'tiles'], ['러그', 'rug'],
                          ['잔디 바닥', 'grass'], ['레드카펫', 'carpet']]],
  ['left',  '왼쪽 소품', SIDE_ITEMS],
  ['right', '오른쪽 소품', SIDE_ITEMS]
];

/* Rows come back as [label, key, lockedByTitle]. A third entry means the
   milestone that gives it has not been reached — the item is still
   listed, because hiding it hid that there was anything to work towards,
   and only the picking is refused. */
function offer(items, lockFor, isDone) {
  return items.map(([label, key]) => {
    const lock = lockFor(key);
    return (!lock || isDone(lock)) ? [label, key] : [label, key, title(lock)];
  });
}

function gearSlots(baseSlots, isDone) {
  return baseSlots.map(([slot, label, items]) => [
    slot, label,
    items.concat(offer(GEAR_PRIZES[slot] || [],
                       (k) => (GEAR_LOCKS[slot] || {})[k], isDone))
  ]);
}

function roomSlots(isDone) {
  return ROOM_SLOTS.map(([slot, label, items]) => [
    slot, label, offer(items, (k) => ROOM_LOCKS[k], isDone)
  ]);
}

/* is this one pickable right now? */
function pickable(rows, slot, key) {
  if (key === 'none') return true;
  const row = rows.find(([s]) => s === slot);
  return !!row && row[2].some(([, k, locked]) => k === key && !locked);
}

module.exports = {
  LIST, byId, title, now, met,
  gearSlots, roomSlots, pickable,
  GEAR_LOCKS, ROOM_LOCKS, ROOM_SLOTS
};
