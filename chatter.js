'use strict';

/* ------------------------------------------------------------------ *
 * chatter.js — the things the pet says.
 *
 * Lines are pooled and picked at random, never twice in a row, because
 * a desk pet that repeats one string is worse than a silent one. Needs
 * outrank small talk, and small talk only happens when nothing is
 * actually wrong.
 *
 * Nothing here posts an OS notification — chatter belongs in the speech
 * bubble only. A Notification Centre entry for "안녕!" is spam.
 * ------------------------------------------------------------------ */

const NEED = {
  hunger: ['배고파요…', '밥 주세요!', '배에서 소리 나요', '뭔가 먹고 싶다…', '밥…?'],
  fun:    ['심심해요', '놀아주세요!', '뭐 재밌는 거 없나', '공 던져줘요', '같이 놀아요!'],
  energy: ['졸려요…', '눈이 자꾸 감겨요', '조금만 잘래요', '하암…', '피곤해요'],
  clean:  ['치워주세요…', '여기 좀 지저분해요', '으… 냄새', '청소해 주실래요?']
};

const GREET = {
  morning:   ['좋은 아침!', '잘 잤어요?', '오늘도 잘 부탁해요', '아침이다!'],
  afternoon: ['안녕!', '점심 먹었어요?', '오후도 화이팅', '뭐 하고 있어요?'],
  evening:   ['오늘 하루 어땠어요?', '슬슬 저녁이네요', '수고했어요!'],
  night:     ['아직 안 자요?', '밤이 깊었어요', '너무 무리하지 마요']
};

/* The egg cannot be fed or played with; the only thing that helps is a
   touch, and the cooldown on that is invisible. So it asks. */
const EGG = [
  '쓰다듬어 주세요', '따뜻하게 해줄래요?', '조금만 더 품어주세요',
  '만져주면 빨리 나올 수 있어요'
];

const SMALL = [
  '히히', '여기 있어요', '보고 있어요', '오늘 기분 좋아요',
  '같이 있어서 좋아요', '음… 뭐 하지', '창밖 보는 중', '기지개 쭉—',
  '나 잘하고 있죠?', '쓰다듬어 주세요'
];

const REACT = {
  feed:  ['잘 먹었어요!', '맛있다!', '고마워요!', '배부르다~'],
  play:  ['재밌었어요!', '더 놀아요!', '신난다!', '한 번 더!'],
  sleep: ['잘 자요…', '조금만 잘게요', '쿨…'],
  wake:  ['잘 잤다!', '개운해요!', '일어났어요'],
  clean: ['개운해요!', '고마워요!', '깨끗해졌다'],
  pat:   ['헤헤', '좋아요~', '더 해주세요', '기분 좋다'],
  warm:  ['따뜻해요…', '포근하다', '조금 더 있으면 나갈게요', '고마워요…'],
  snack: ['이거 좋아해요!', '한 입 더…', '달다!', '맛있는 냄새'],
  trickWin:  ['해냈어요!', '봤어요? 봤어요?', '나 잘하죠', '어때요!'],
  trickMiss: ['어렵다…', '다시 해볼래요', '음… 이게 아닌가', '조금만 더 연습'],
  walk:      ['바람 좋다', '여기 냄새 좋아요', '조금 더 걸을까요?', '다리가 튼튼해졌어요'],
  walkFind:  ['이거 주웠어요!', '보물 발견', '길에서 뭔가 찾았어요!'],
  gameWin:   ['내가 이겼다!', '또 해요 또!', '헤헤 맞췄죠?', '재밌다!'],
  gameLose:  ['아깝다…', '다음엔 이길 거예요', '한 번만 더!', '으으 졌다'],
  back:      ['다녀오셨어요?', '기다렸어요!', '어디 갔었어요?', '왔다!']
};

/* The same kindness lands differently depending on how the pet is doing.
   A hungry, bored, tired pet does not say "신난다!" — it says it managed. */
const LOW = {
  feed:  ['겨우 먹었어요…', '배고팠어요…', '살 것 같아요'],
  snack: ['조금 낫네요…', '고마워요…'],
  play:  ['조금만요…', '기운이 없어요', '음… 나중에 더'],
  walk:  ['천천히 걸을게요…', '조금 힘드네요'],
  pat:   ['음…', '기운이 없어요', '가만히 있을래요'],
  clean: ['이제 좀 낫네요'],
  trickWin:  ['됐다…', '겨우 했어요'],
  trickMiss: ['못 하겠어요…', '오늘은 안 되나 봐요']
};

/* What it chats about when nothing is wrong depends on what it was
   raised on. A pet that spent its life playing talks about playing. */
/* 성격마다 한 벌씩. 이름만 늘리고 대사를 안 채우면 열일곱 가지가 조용히
   기본 대사로 떨어져서, 성격을 늘린 티가 하나도 안 난다.
   care.js 의 PERSONALITY · PERSONALITY_PAIR 와 이름이 하나라도 어긋나면
   그 성격은 영영 말이 없다 — 검사가 두 표를 맞대어 본다. */
const BY_NATURE = {
  활발:   ['뛰고 싶다!', '공 어디 갔지', '한 판 더 어때요?', '몸이 근질근질'],
  다정:   ['옆에 있을게요', '오늘도 고마워요', '같이 있으니 좋다', '보고 싶었어요'],
  먹보:   ['배고픈가…', '간식 냄새 나는데', '뭐 먹을 거 없나요?', '아까 그거 맛있었어요'],
  느긋:   ['하암…', '느긋하게 갑시다', '햇볕 좋다', '조금만 더 쉴래요'],
  깔끔:   ['여기 좀 치울까요', '자리가 반듯해야 해요', '먼지 하나 없네', '정리하니 개운하다'],
  똑똑:   ['그건 왜 그래요?', '하나 더 배우고 싶어요', '아, 알 것 같아', '이번엔 잘할 수 있어요'],

  개구쟁이: ['놀아 줘요 놀아 줘요', '심심한 건 못 참아', '같이 뛰자!', '오늘 뭐 하고 놀까요'],
  튼튼이:  ['많이 먹고 많이 뛰자', '아직 더 갈 수 있어요', '밥심이죠', '기운이 남아돌아'],
  변덕쟁이: ['놀까… 잘까…', '갑자기 신나네', '아니다, 좀 쉴래요', '마음이 왔다 갔다 해요'],
  부지런이: ['할 일부터 끝내죠', '벌써 다 해 뒀어요', '가만있질 못하겠어', '오늘도 바쁘다'],
  재간둥이: ['이거 봐요, 봐요!', '새 거 하나 배웠어요', '한 번 더 보여 줄까요', '나 잘하죠?'],
  응석받이: ['안아 주세요', '이것도 주면 안 돼요?', '나만 봐 줘요', '조금만 더요…'],
  포근이:  ['같이 낮잠 자요', '옆이 따뜻하다', '이대로 조금만 더', '포근한 게 좋아요'],
  살림꾼:  ['자리 정리해 뒀어요', '깔끔한 게 마음이 편해요', '여기 놓을게요', '오늘도 말끔하다'],
  눈치백단: ['오늘 좀 피곤해 보여요', '무슨 일 있었어요?', '말 안 해도 알아요', '괜찮아요, 옆에 있을게요'],
  잠꾸러기: ['먹고 자는 게 최고', '조금만 더 잘래요…', '배부르니 졸리다', '이따 일어나서 먹을래요'],
  미식가:  ['이건 좀 다르네요', '아까 그게 더 맛있었어요', '천천히 음미하는 거예요', '오늘은 뭘 먹을까'],
  꾀돌이:  ['이러면 간식 주죠?', '다 계획이 있어요', '그거 어디 뒀는지 알아요', '헤헤, 걸렸다'],
  새침이:  ['…딱히 기다린 건 아니에요', '조용한 게 좋아요', '만지지 마세요, 지금은', '알아서 할게요'],
  사색가:  ['가만히 생각 중이에요', '왜 그런 걸까요', '조용히 있고 싶어요', '답이 곧 나올 것 같은데'],
  모범생:  ['오늘 할 일 다 했어요', '복습이 중요하죠', '정리하고 배우고', '차근차근 하면 돼요']
};

const last = {};   // pool name -> last line, so nothing repeats back to back

function pick(name, pool) {
  if (!pool || !pool.length) return null;
  if (pool.length === 1) return pool[0];
  let line;
  do { line = pool[Math.floor(Math.random() * pool.length)]; }
  while (line === last[name]);
  last[name] = line;
  return line;
}

function partOfDay(d) {
  const h = (d || new Date()).getHours();
  if (h < 11) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

/* What it says while doing a trick — the trick's own line if it has one,
   otherwise a general "look at me". */
const TRICK_SAY = {
  '앉아':     ['앉았어요!', '이렇게요?'],
  '손':       ['손!', '여기요'],
  '엎드려':   ['엎드렸어요', '바닥이 시원해요'],
  '빙글':     ['빙그르르~', '어지러워요'],
  '점프':     ['얍!', '높죠?'],
  '인사':     ['안녕하세요!', '꾸벅'],
  '기다려':   ['…', '아직이요?', '기다리는 중'],
  '하이파이브': ['짝!', '하이파이브!'],
  '구르기':   ['데굴데굴', '굴렀어요!'],
  '노래':     ['라라라~', '음~ 음~']
};
const TRICK_ANY = ['봐요 봐요!', '어때요?', '잘하죠?'];

function trickLine(trick) {
  const pool = TRICK_SAY[trick];
  return pool ? pick('trick:' + trick, pool) : pick('trickAny', TRICK_ANY);
}

function needLine(key) { return pick('need:' + key, NEED[key]); }
function eggLine() { return pick('egg', EGG); }
/* ctx: { mood, personality } — both optional. */
function reactLine(key, ctx) {
  if (ctx && ctx.mood === 'low' && LOW[key]) return pick('low:' + key, LOW[key]);
  return pick('react:' + key, REACT[key]);
}

/* Small talk is a greeting or an aside; greetings win early in the day
   so the first thing it says in the morning is a hello. */
function idleLine(seenGreetingToday, personality) {
  if (!seenGreetingToday) return pick('greet', GREET[partOfDay()]);
  if (Math.random() < 0.35) return pick('greet', GREET[partOfDay()]);
  // half the small talk comes from the pet's own character, when it has one
  const nature = BY_NATURE[personality];
  if (nature && Math.random() < 0.5) return pick('nature', nature);
  return pick('small', SMALL);
}

module.exports = { needLine, reactLine, idleLine, eggLine, trickLine, partOfDay,
                   natures: () => Object.keys(BY_NATURE) };
