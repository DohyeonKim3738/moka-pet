/* ------------------------------------------------------------------
 * family.js — who is related to whom, and who is spoken for.
 *
 * Pure functions over the pets map. Nothing here reads global state or
 * touches a window, which is the point: these are the rules that decide
 * whether two animals may have a child together, and they are the kind
 * of rule that is easy to get subtly wrong. The uncle-and-niece hole
 * lived in this logic for a day precisely because it could not be
 * tested without launching the app.
 *
 * `pets` is the same shape main.js keeps: { id: { name, parents: [id, id],
 * mate: id } }.
 * ------------------------------------------------------------------ */
'use strict';

const MAX_GENERATIONS = 6;

/* Everyone this one descends from, and how far back. 1 = parent,
   2 = grandparent, and so on. */
function ancestorDepths(pets, id, depth, out) {
  out = out || new Map();
  if (depth === undefined) depth = MAX_GENERATIONS;
  if (depth <= 0) return out;
  const p = (pets[id] && pets[id].parents) || [];
  p.forEach((k) => {
    if (!pets[k]) return;
    const step = MAX_GENERATIONS + 1 - depth;
    if (!out.has(k) || out.get(k) > step) out.set(k, step);
    ancestorDepths(pets, k, depth - 1, out);
  });
  return out;
}

/* Close family, and what kind — null when there is no tie.
 *
 * The rule is any shared ancestor, which covers siblings, uncle and
 * niece, and cousins in one stroke. Two separate lines can still be
 * crossed: the children of one pair and the children of another share
 * nobody. The family keeps going, it just has to go outward. */
function kinship(pets, aId, bId) {
  if (aId === bId) return '자기 자신';
  if (!pets[aId] || !pets[bId]) return null;
  const A = ancestorDepths(pets, aId), B = ancestorDepths(pets, bId);

  if (A.has(bId)) return A.get(bId) === 1 ? '부모예요' : '조상이에요';
  if (B.has(aId)) return B.get(aId) === 1 ? '자식이에요' : '자손이에요';

  let da = 0, db = 0;
  A.forEach((depth, k) => {
    if (!B.has(k)) return;
    if (!da || depth + B.get(k) < da + db) { da = depth; db = B.get(k); }
  });
  if (!da) return null;
  if (da === 1 && db === 1) return '형제예요';
  if (Math.min(da, db) === 1) return '삼촌·조카예요';
  return '한 핏줄이에요';
}

/* A pet keeps one partner: taking a second would make the family tree a
   diagram of something else. If the partner is no longer in the house
   the tie lapses. */
function mateOf(pets, id) {
  const m = pets[id] && pets[id].mate;
  return (m && pets[m]) ? m : null;
}

/* Why `aId` — the pet you are looking at — cannot pair with `bId`.
 *
 * The wording has to keep the two sides apart: "아빠의 짝이에요" under
 * someone else's name reads as though THEY were taken, when in fact it
 * is the pet in front of you that is. The caller says that part once,
 * above the list. */
function pairProblem(pets, aId, bId) {
  const kin = kinship(pets, aId, bId);
  if (kin) return kin;
  const mb = mateOf(pets, bId);
  if (mb && mb !== aId) return pets[mb].name + '의 짝이에요';
  const ma = mateOf(pets, aId);
  if (ma && ma !== bId) return '짝이 있어요';
  return null;
}

module.exports = { ancestorDepths, kinship, mateOf, pairProblem, MAX_GENERATIONS };
