/* ------------------------------------------------------------------
 * species.js — the pet roster, drawn as pixel art.
 *
 * Shapes are declared as per-row width profiles and handed to
 * PIXEL.shaped(), which derives the 1-dot outline and the light ramp.
 * Hand-typed silhouettes came out chiselled; profiles round cleanly.
 * Only faces are hand-placed, because that is where character lives.
 *
 * The art grid is 48x48 dots (PIXEL.DOT = 5 units each). Landmarks —
 * stay on these and a new species needs no origin tuning:
 *
 *   centre line   x = 24
 *   head 26w      x11, y4      eyes 4x5  x16 / x28, y13
 *   body 22w      x13, y26     arms 6x8  x7  / x35, y29
 *   feet 8x4      x14 / x26, y39
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var P = root.PIXEL;
  var BY_KEY_SLEEP;
  var rep = P.rep;

  /* ---------- shape profiles ---------- */
  var HEAD  = [14, 18, 20, 22, 24, 24, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 24, 24, 22, 20, 16, 12];
  /* The first four rows are a neck: they live under the head and are never
   seen, but they mean the head can bob or follow the cursor without
   tearing a gap open at the shoulders. */
var BODY  = [12, 12, 12, 12, 12, 16, 18, 20, 22, 22, 22, 22, 22, 22, 22, 20, 18, 16, 12];
  var LIMB  = [4, 6, 6, 6, 6, 4];
  var FOOT  = [6, 8, 8, 6];

  var EAR_NUB   = [4, 6, 6, 6, 4];
  var EAR_POINT = [2, 4, 6, 8, 10, 10];
  var EAR_FLOP  = [6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 6, 6, 4];
  var EAR_FOLD  = [8, 8, 6, 6, 4, 2];

  var TAIL_NUB   = [4, 6, 6, 4];
  var TAIL_LONG  = [4, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 4];
  var TAIL_THICK = [8, 10, 10, 10, 10, 8];
  var TAIL_PLUME = [6, 10, 12, 12, 10, 6];
  var TAIL_POM   = [6, 8, 8, 8, 6];

  /* a flat colour patch — no outline, so it reads as marking not mass */
  function patch(widths, ch, floorCh) {
    var w = 0;
    widths.forEach(function (f) { if (f > w) w = f; });
    return widths.map(function (fw, i) {
      var pad = (w - fw) / 2;
      var c = (floorCh && i === widths.length - 1) ? floorCh : ch;
      return rep('.', pad) + rep(c, fw) + rep('.', pad);
    });
  }

  var MUZZLE  = [10, 14, 16, 16, 16, 14, 10];
  var SNOUT   = [12, 16, 18, 18, 18, 16, 12];
  var BELLY   = [10, 14, 16, 16, 14, 10];
  var NOSE_W  = [4, 6, 6, 4];
  var NOSE_N  = [2, 4, 4, 2];
  var BLUSH   = [4, 4];
  var MOUTH   = ['N..N', '.NN.'];

  /* ---------- assembled parts ---------- */
  function head(opts) {
    opts = opts || {};
    var prof = opts.profile || HEAD;
    if (opts.curly) prof = P.fluffy(prof);
    var w = Math.max.apply(null, prof);
    var rows = P.shaped(prof, { top: 2, bottom: 2, right: 2 });
    if (opts.curly) rows = P.fleece(rows, { period: opts.curlPeriod || 7, offset: opts.curlOffset || 0 });

    function centred(art) { return (w - Math.max.apply(null, art.map(function (r) { return r.length; }))) / 2; }

    if (opts.muzzle) {
      var mz = patch(opts.muzzle, 'B', 'b');
      rows = P.stamp(rows, mz, centred(mz), opts.muzzleY || 12);
    }
    if (opts.preStamps) opts.preStamps.forEach(function (s) { rows = P.stamp(rows, s[0], s[1], s[2]); });
    if (opts.blush) {
      rows = P.stamp(rows, patch(BLUSH, 'p'), 2, opts.blushY || 15);
      rows = P.stamp(rows, patch(BLUSH, 'p'), w - 6, opts.blushY || 15);
    }
    if (opts.nose) {
      var ns = patch(opts.nose, opts.noseCh || 'K');
      rows = P.stamp(rows, ns, centred(ns), opts.noseY || 15);
    }
    if (opts.mouth !== false) {
      rows = P.stamp(rows, MOUTH, centred(MOUTH), opts.mouthY || 18);
    }
    if (opts.tongue) {
      var tg = opts.tongueArt || patch([4, 4, 2], 'P');
      rows = P.stamp(rows, tg, centred(tg), opts.tongueY || 19);
    }
    if (opts.stamps) opts.stamps.forEach(function (s) { rows = P.stamp(rows, s[0], s[1], s[2]); });
    return { x: 24 - w / 2, y: 4, rows: rows };
  }

  /* `trim` shortens the torso from the bottom, which is what makes a
     young pet young: the head is unchanged, so the head-to-body ratio
     does the work. Everything that hangs off the bottom — feet, tail,
     clothes — is moved up by the same amount in variant(). */
  /* Shorten the waist, not the end. Cutting rows off the bottom threw
     away the taper that rounds the rump, leaving a blunt slab wider than
     the shoulders — a puppy shaped like a doorstop. The rows to lose are
     the repeated widest ones in the middle. */
  function shorten(prof, trim) {
    if (!trim) return prof;
    var w = Math.max.apply(null, prof);
    var first = prof.indexOf(w);
    var last = prof.lastIndexOf(w);
    var room = last - first;                 // keep at least one widest row
    var cut = Math.min(trim, room);
    return prof.slice(0, first).concat(prof.slice(first + cut));
  }

  /* Weight shows up as width. Only the rows below the hidden neck change,
     so the shoulders — where the arms meet the body — stay put. */
  /* Weight is added in proportion to how wide a row already is, so the
     shoulders ramp out with the belly instead of stepping straight from
     a twelve dot neck to a thirty dot waist — that read as a mushroom.
     Every addition stays even: blob() centres rows and a half dot throws. */
  function fatten(prof, fat) {
    fat = Math.round((fat || 0) / 2) * 2;      // keep the parity blob() needs
    if (!fat) return prof;
    var neck = prof[0];
    var max = Math.max.apply(null, prof);
    if (max <= neck) return prof;
    return prof.map(function (w) {
      if (w <= neck) return w;
      var t = (w - neck) / (max - neck);
      return Math.max(neck, w + Math.round(fat * t / 2) * 2);
    });
  }

  /* Lengthen the waist by repeating its widest row. Together with
     fatten() this is what separates the builds: a slim pet is taller and
     narrower, a heavy one is lower and wider. Width alone was invisible
     — two dots on a twenty-two dot body is nothing at desk size. */
  function stretch(prof, rows) {
    if (!rows || rows < 0) return prof;
    var w = Math.max.apply(null, prof);
    var at = prof.indexOf(w);
    var add = [];
    for (var n = 0; n < rows; n++) add.push(w);
    return prof.slice(0, at).concat(add, prof.slice(at));
  }

  function shiftX(part, dx) {
    if (!part || !dx) return part;
    var out = {};
    Object.keys(part).forEach(function (k) { out[k] = part[k]; });
    out.x = part.x + dx;
    return out;
  }

  function bodyFor(curly, trim, fat, grow) {
    grow = grow || 0;
    // a negative grow is just more trim: the same waist rows, taken away
    var prof = shorten(BODY, (trim || 0) + Math.max(0, -grow));
    prof = fatten(stretch(prof, Math.max(0, grow)), fat || 0);
    var rows = P.shaped(curly ? P.fluffy(prof) : prof, { top: 2, bottom: 2, right: 2 });
    if (curly) rows = P.fleece(rows, { period: 7, offset: 2 });
    rows = P.stamp(rows, patch(BELLY, 'B', 'b'), 3 + Math.round((fat || 0) / 2), 9);
    // blob() centres the profile, so a wider body has to start further left
    return { x: 13 - Math.round((fat || 0) / 2), y: 22, rows: rows, curly: !!curly, fat: fat || 0 };
  }
  function bodyPart(curly) { return bodyFor(curly, 0, 0, 0); }

  function limb(x, flip) {
    return { x: x, y: 30, rows: P.shaped(LIMB, { top: 1, bottom: 1, right: flip ? 0 : 1 }), pivot: [3, 1] };
  }
  function foot(x) {
    return { x: x, y: 39, rows: P.shaped(FOOT, { top: 1, bottom: 1, right: 2 }), pivot: [4, 1] };
  }

  function ear(profile, x, y, pivot, curly) {
    var rows = P.shaped(profile, { top: 1, bottom: 0, right: 1 });
    if (curly) rows = P.fleece(rows, { period: 5, offset: 1 });
    return { x: x, y: y, rows: rows, pivot: pivot };
  }
  function tail(profile, x, y, pivot, curly, drift) {
    var rows = drift ? P.arced(profile, drift, { top: 1, bottom: 1, right: 1 })
                     : P.shaped(profile, { top: 1, bottom: 1, right: 1 });
    if (curly) rows = P.fleece(rows, { period: 5 });
    return { x: x, y: y, rows: rows, pivot: pivot };
  }

  function base(curly) {
    return {
      body: bodyPart(curly),
      armL: limb(8, false), armR: limb(34, true),
      pawL: foot(14), pawR: foot(26)
    };
  }

  var EYES = { size: [4, 5], l: [16, 13], r: [28, 13], glint: [1, 1] };

  /* ================================================================
   * growth stages
   *
   * One drawing per species, adjusted per stage, rather than nine
   * species times six hand-drawn sprites. A young pet is shorter in the
   * body with bigger eyes; an old one goes grey above the eyes. Overall
   * size is handled by the window, the same mechanism the size slider
   * already uses, so nothing here has to scale a pixel.
   * ================================================================ */

  /* Every step has to announce itself — one shared silhouette that only
     shrinks reads as the same pet at a different zoom. So each stage
     changes something you can name: the tail appears, the eyes shrink,
     the body lengthens, the brows go grey, the crown arrives. */
  /* how much wider the torso is drawn per weight band */
  /* Width in even numbers only: blob() centres each row, so a profile
     whose rows do not all share the max width's parity lands on a half
     dot and throws. `grow` is extra waist rows — height, which reads far
     better than width on its own. */
  var BUILD = {
    slim:   { fat: -4, grow: 2 },
    normal: { fat: 0,  grow: 0 },
    plump:  { fat: 4,  grow: -1 },
    heavy:  { fat: 8,  grow: -2 }
  };

  var STAGE_OPTS = {
    baby:   { trim: 6, headDrop: 1, noTail: true,
              eyes: { size: [5, 6], l: [15, 12], r: [28, 12], glint: [1, 1] } },
    child:  { trim: 4,
              eyes: { size: [5, 5], l: [15, 13], r: [28, 13], glint: [1, 1] } },
    teen:   { trim: 2 },
    adult:  { trim: 0 },
    elder:  { trim: 0, brows: true, headDrop: 1 },
    legend: { trim: 0, brows: true, spark: true, crown: true, headDrop: 1 }
  };

  /* Overall size per stage lives in care.js, because the window is what
     scales — nothing here needs it. */

  function shiftY(part, dy) {
    if (!part || !dy) return part;
    var out = {};
    Object.keys(part).forEach(function (k) { out[k] = part[k]; });
    out.y = part.y + dy;
    return out;
  }

  /* Grey above the eyes reads as age without touching the muzzle, which
     every species draws differently. */
  /* Grey reads as old on a light coat and disappears on a dark one, so
     the brows are picked against the fur: white on black, grey on white. */
  function browChar(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#888888');
    if (!m) return 'A';
    var lum = 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16);
    return lum < 140 ? 'H' : 'A';
  }

  function aged(head, eyes, o, fur) {
    var rows = head.rows.slice();
    // stamp() works in head-local rows; eye coordinates are absolute, so
    // the head's own y has to come off or the brow lands under the eye
    // and the eye, drawn later, hides it.
    var browY = eyes.l[1] - head.y - 3;
    var ch = browChar(fur);
    var brow = ['.' + ch + ch + ch + ch + '.', ch + ch + ch + ch + ch + ch];
    [eyes.l[0], eyes.r[0]].forEach(function (ex) {
      rows = P.stamp(rows, brow, ex - head.x - 1, browY);
    });
    var w = 0;
    rows.forEach(function (r) { if (r.length > w) w = r.length; });
    if (o.crown) {
      rows = P.stamp(rows, ['Y.Y.Y', 'YYYYY', 'yYYYy'], Math.round(w / 2) - 3, 0);
    }
    if (o.spark) rows = P.stamp(rows, ['.y.', 'yYy', '.y.'], 1, 2);
    return { x: head.x, y: head.y, rows: rows };
  }

  function variant(sp, stage, build) {
    var o = STAGE_OPTS[stage];
    var b = BUILD[build] || BUILD.normal;
    var fat = b.fat, grow = b.grow;
    if (!o || (!o.trim && !o.brows && !o.noTail && !o.headDrop && !fat && !grow)) return sp;

    var v = Object.create(sp);
    v.stage = stage;
    v.eyes = o.eyes || sp.eyes;

    var p = {};
    Object.keys(sp.parts).forEach(function (k) { p[k] = sp.parts[k]; });

    if (o.trim || fat || grow) {
      if (p.body && p.body.curly !== undefined) {
        p.body = bodyFor(p.body.curly, o.trim, fat, grow);
      }
      // limbs follow the waistline out, or they float beside a thin pet
      var out = Math.round(fat / 2);
      p.armL = shiftX(p.armL, -out);
      p.armR = shiftX(p.armR, out);
      var feet = Math.round(fat / 4);
      p.pawL = shiftX(p.pawL, -feet);
      p.pawR = shiftX(p.pawR, feet);
      // a longer waist pushes the feet down, a shorter one pulls them up
      p.pawL = shiftY(p.pawL, grow);
      p.pawR = shiftY(p.pawR, grow);
      p.tail = shiftY(p.tail, Math.round(grow / 2));
    }
    if (o.trim) {
      p.pawL = shiftY(p.pawL, -o.trim);
      p.pawR = shiftY(p.pawR, -o.trim);
      // Arms stay where they are: the widest row of the torso lands on
      // y30 at every trim, so that is the only height they meet the body
      // at. Raising them opened a gap and left them floating.
      p.tail = shiftY(p.tail, -Math.round(o.trim / 2));
    }
    // a puppy's tail is a stub you cannot see from the front
    if (o.noTail) p.tail = null;
    if (o.headDrop) {
      p.head = shiftY(p.head, o.headDrop);
      p.earL = shiftY(p.earL, o.headDrop);
      p.earR = shiftY(p.earR, o.headDrop);
      p.headBack = shiftY(p.headBack, o.headDrop);
      p.face = shiftY(p.face, o.headDrop);
      v.eyes = {
        size: v.eyes.size,
        l: [v.eyes.l[0], v.eyes.l[1] + o.headDrop],
        r: [v.eyes.r[0], v.eyes.r[1] + o.headDrop],
        glint: v.eyes.glint
      };
    }
    if (o.brows && p.head) p.head = aged(p.head, v.eyes, o, sp.fur);

    v.parts = p;
    // clothes hang from the body, so they ride up with it
    var g = {};
    Object.keys(sp.gearOffset || {}).forEach(function (k) { g[k] = sp.gearOffset[k]; });
    if (o.trim) g.body = [(g.body || [0, 0])[0], (g.body || [0, 0])[1] - o.trim];
    v.gearOffset = g;
    v.gearFat = fat;          // clothes widen with the pet wearing them
    return v;
  }

  /* ---------- the egg ----------
     One shape for every species, tinted with that species' fur so the
     egg already hints at who is inside. */
  /* Taller than it is wide, or it reads as a pebble. Narrow at the top,
     widest just below centre — the shape everyone draws when asked for
     an egg. */
  var EGG = [8, 12, 14, 16, 18, 18, 20, 20, 20, 22, 22, 22, 22, 22, 22, 20, 20, 18, 16, 12];

  /* shaped() paints in fur colours; an egg wants the pale belly tone for
     the shell and the fur colour saved for the speckles. */
  function reshell(rows) {
    return rows.map(function (r) {
      return r.split('').map(function (ch) {
        return ch === 'F' ? 'B' : ch === 'D' ? 'b' : ch === 'L' ? 'H' : ch;
      }).join('');
    });
  }

  function eggRows(cracked) {
    var rows = reshell(P.shaped(EGG, { top: 2, bottom: 3, right: 3 }));
    var w = Math.max.apply(null, EGG);
    // Speckles in a fixed grey rather than the species' fur: half the
    // pets are near-white, and their own colour would leave the shell
    // blank.
    [[5, 5], [14, 4], [9, 9], [16, 11], [6, 14], [13, 16]].forEach(function (d) {
      rows = P.stamp(rows, ['AA', 'AA'], d[0], d[1]);
    });
    if (cracked) {
      rows = P.stamp(rows, ['.O.', 'O..', '.OO', 'O..', '.O.'], Math.round(w / 2) - 2, 4);
    }
    return { x: 24 - w / 2, y: 22, rows: rows };
  }


  /* ================================================================
   * roster
   * ================================================================ */
  var LIST = [];

  function add(sp) {
    sp.eyes = sp.eyes || EYES;
    sp.propAt = sp.propAt || [20, -2];
    sp.tearAt = sp.tearAt || [17, 19];
    LIST.push(sp);
    return sp;
  }

  /* 1. 카피바라 — 모카 */
  add({
    key: 'capybara', label: '카피바라', name: '모카', prop: 'yuzu',
    fur: '#B98052', belly: '#EBD3A9',
    furs: [['모카 브라운', '#B98052'], ['다크 초코', '#8E6237'], ['모래', '#CFA97D'], ['잿빛', '#8B867A'], ['이끼', '#77937F'], ['먹', '#4A463F']],
    ear: { l: '-10deg', r: '10deg' },
    parts: Object.assign(base(), {
      head: head({ muzzle: SNOUT, muzzleY: 12, nose: NOSE_W, noseY: 14, mouthY: 18, blush: true, blushY: 16 }),
      earL: ear(EAR_NUB, 13, 1, [3, 5]), earR: ear(EAR_NUB, 29, 1, [3, 5]),
      tail: tail(TAIL_NUB, 32, 33, [0, 2])
    })
  });

  /* 2. 고양이 — 나비 */
  add({
    key: 'cat', label: '고양이', name: '나비', prop: 'leaf',
    fur: '#8E8A85', belly: '#F3EBE0',
    furs: [['잿빛', '#8E8A85'], ['치즈', '#D79A50'], ['까망', '#4A4642'], ['하양', '#D9D3C9'], ['갈색 태비', '#9B7350'], ['블루', '#7E8C97']],
    ear: { l: '-8deg', r: '8deg' },
    parts: Object.assign(base(), {
      head: head({
        muzzle: MUZZLE, muzzleY: 13, nose: NOSE_N, noseCh: 'P', noseY: 15, mouthY: 18, blush: true, blushY: 15
      }),
      earL: ear(EAR_POINT, 11, 0, [5, 6]), earR: ear(EAR_POINT, 27, 0, [5, 6]),
      tail: tail([4, 6, 6, 6, 6, 6, 6, 6, 6], 30, 21, [3, 8], false, -0.6)
    })
  });

  /* 3. 수달 — 수리 */
  add({
    key: 'otter', label: '수달', name: '수리', prop: 'leaf',
    fur: '#7E5C42', belly: '#E3CCA6',
    furs: [['강물 갈색', '#7E5C42'], ['모래', '#A98460'], ['짙은 밤', '#5C4130'], ['잿빛', '#7C7A72'], ['적갈', '#96543C'], ['크림', '#C3A582']],
    ear: { l: '0deg', r: '0deg' },
    parts: Object.assign(base(), {
      head: head({ muzzle: [14, 18, 20, 20, 20, 18, 14], muzzleY: 11, nose: NOSE_W, noseY: 13, mouthY: 17, blush: true, blushY: 14 }),
      earL: ear([2, 4, 4, 2], 9, 9, [2, 2]), earR: ear([2, 4, 4, 2], 35, 9, [2, 2]),
      tail: tail([6, 10, 12, 12, 10, 8], 31, 24, [2, 5], false, -0.7)
    })
  });

  /* 4. 게 — 집게 (its own skeleton: shell, stalks, claws) */
  var crabShell = P.shaped([16, 22, 26, 28, 28, 28, 28, 28, 28, 26, 22, 16], { top: 2, bottom: 2, right: 2 });
  crabShell = P.stamp(crabShell, patch([12, 16, 18, 16, 12], 'B', 'b'), 5, 5);
  crabShell = P.stamp(crabShell, MOUTH, 12, 7);

  add({
    key: 'crab', label: '게', name: '집게', prop: 'star',
    fur: '#C9492F', belly: '#F3CBAE',
    furs: [['선홍', '#C9492F'], ['주황', '#E07A34'], ['진홍', '#9E2F22'], ['자주', '#8E4468'], ['청록', '#2F7F86'], ['먹장', '#4B403C']],
    ear: { l: '0deg', r: '0deg' },
    eyes: { size: [4, 5], l: [16, 4], r: [28, 4], glint: [1, 1] },
    propAt: [20, -6], tearAt: [17, 20],
    // the shell sits where a torso normally would, and the eyes are on
    // stalks nine dots higher than every other species
    gearOffset: { eyes: [0, -9], head: [0, -4], body: [0, -2], hand: [6, -6] },
    parts: {
      body: { x: 15, y: 22, rows: P.stamp(P.shaped([10, 10, 10, 10, 14, 16, 18, 18, 18, 16, 12], { top: 1, bottom: 2, right: 2 }), patch([8, 12, 12, 10], 'B', 'b'), 3, 6) },
      head: { x: 10, y: 14, rows: crabShell },
      earL: ear([2, 2, 2, 2, 2], 17, 9, [1, 5]), earR: ear([2, 2, 2, 2, 2], 29, 9, [1, 5]),
      armL: { x: 2, y: 18, rows: P.stamp(P.shaped([4, 8, 8, 8, 6, 8, 8, 6], { top: 1, bottom: 1, right: 1 }), ['..', '..', '..'], 3, 3), pivot: [7, 4] },
      armR: { x: 38, y: 18, rows: P.shaped([4, 8, 8, 8, 6, 8, 8, 6], { top: 1, bottom: 1, right: 1 }), pivot: [1, 4] },
      pawL: { x: 15, y: 32, rows: P.shaped(FOOT, { top: 1, bottom: 1, right: 2 }), pivot: [4, 1] },
      pawR: { x: 25, y: 32, rows: P.shaped(FOOT, { top: 1, bottom: 1, right: 2 }), pivot: [4, 1] }
    }
  });

  /* 5. 시바견 — 하루 */
  add({
    key: 'shiba', label: '시바견', name: '하루', prop: 'none',
    fur: '#DB9A4E', belly: '#F8EFE1',
    furs: [['적시바', '#DB9A4E'], ['참깨', '#A8845E'], ['크림', '#E7CFA6'], ['흑시바', '#4E453D'], ['여우', '#C8712F'], ['백시바', '#DED5C6']],
    ear: { l: '-12deg', r: '12deg' },
    parts: Object.assign(base(), {
      head: head({
        muzzle: MUZZLE, muzzleY: 13, nose: NOSE_W, noseY: 15, mouthY: 18, blush: true, blushY: 16,
        stamps: [
          [patch([4, 6, 6], 'B'), 4, 7],
          [patch([4, 6, 6], 'B'), 16, 7]
        ]
      }),
      earL: ear(EAR_POINT, 11, 0, [5, 6]), earR: ear(EAR_POINT, 27, 0, [5, 6]),
      tail: tail([4, 8, 10, 10, 8, 6], 31, 23, [2, 5], false, -0.9)
    })
  });

  /* 6-8. the curly-coat trio — 도담이 / 크림이 / 콩이
     One skull, three coats; the ears and the tongue do the telling. */
  var EAR_PUFF = [6, 8, 10, 10, 10, 8, 6];

  function curly(key, label, name, prop, fur, belly, furs, opts) {
    opts = opts || {};
    var earArt = opts.ears || EAR_FLOP;
    var parts = Object.assign(base(true), {
      head: head({
        curly: true, curlOffset: opts.curlOffset || 0,
        muzzle: opts.muzzle || MUZZLE, muzzleY: 13, nose: NOSE_W, noseY: 15, mouthY: 18,
        blush: true, blushY: 16, tongue: opts.tongue, tongueY: 20
      }),
      earL: ear(earArt, opts.earX[0], opts.earY, [earArt[0] / 2 + 1, 1], true),
      earR: ear(earArt, opts.earX[1], opts.earY, [earArt[0] / 2 + 1, 1], true),
      tail: opts.tail || tail([4, 8, 10, 10, 8], 31, 24, [2, 4], true, -0.9)
    });
    if (opts.topknot) {
      parts.headBack = { x: 20, y: 0, rows: P.fleece(P.shaped([4, 6, 8, 8], { top: 2, bottom: 0, right: 1 }), { period: 4 }) };
    }
    return add({
      key: key, label: label, name: name, prop: prop,
      fur: fur, belly: belly, furs: furs,
      ear: { l: '0deg', r: '0deg' },
      parts: parts
    });
  }

  /* 도담이 — maltipoo.
     The coat is the whole animal: a wide cloud of a head, and side fur
     that falls from the temples past the jaw. Drawn as ears but placed
     BEHIND the head, because in the photos there is no seam between the
     ears and the face — it reads as one mass of curl. */
  var HEAD_MALTIPOO = [14, 18, 22, 24, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 24, 24, 22, 20, 16, 12];
  var EAR_MALTIPOO  = [4, 8, 10, 10, 10, 10, 10, 10, 10, 8, 6, 4];

  add({
    key: 'dodam', label: '말티푸', name: '도담이', prop: 'none',
    fur: '#F7F4ED', belly: '#FFFFFF',
    // a white dog needs a shallow ramp or the shading reads as dirt
    tone: { dk: 0.10, lt: 0.5, bellyDk: 0.07, line: 0.80 },
    furs: [['순백', '#F7F4ED'], ['아이보리', '#E3D6C2'], ['살구', '#F0D9C4'], ['연회색', '#D8D3CC'], ['샴페인', '#E8D6B8'], ['먹', '#4A463F']],
    ear: { l: '0deg', r: '0deg' },
    earsBehind: true,
    parts: Object.assign(base(true), {
      head: head({
        curly: true, curlPeriod: 6, profile: HEAD_MALTIPOO,
        muzzle: [8, 12, 14, 14, 12, 8], muzzleY: 14,
        nose: [4, 6, 6, 4], noseY: 15, mouthY: 18,
        tongue: true, tongueArt: patch([4, 6, 4, 2], 'P'), tongueY: 19,
        blush: true, blushY: 16
      }),
      earL: ear(EAR_MALTIPOO, 6, 11, [5, 2], true),
      earR: ear(EAR_MALTIPOO, 32, 11, [5, 2], true),
      tail: tail([4, 8, 12, 12, 10], 30, 23, [2, 4], true, -0.9)
    })
  });

  /* 크림이 — cream poodle: topknot and longer ears */
  curly('cream', '푸들', '크림이', 'none', '#E5CDA0', '#F8EFE0',
    [['크림', '#E5CDA0'], ['살구', '#E7C39A'], ['베이지', '#D8BE95'], ['카페라떼', '#C0A177'], ['순백', '#EFE7DB'], ['먹', '#4A463F']],
    { topknot: true, ears: EAR_FLOP, earX: [6, 34], earY: 11, curlOffset: 1 });

  /* 콩이 — black poodle: grizzled grey muzzle, shorter ears */
  curly('kong', '흑푸들', '콩이', 'none', '#443E3B', '#8A7F78',
    [['먹빛', '#443E3B'], ['차콜', '#5A524E'], ['잿빛', '#7C7A72'], ['초코', '#5C4130'], ['은빛', '#9A968E'], ['순백', '#EFE7DB']],
    { tongue: true, ears: EAR_FLOP.slice(0, 9), earX: [6, 34], earY: 11, curlOffset: 2, muzzle: [12, 16, 18, 18, 18, 16, 12] });

  /* 9. 단추 — short coat, dark mask, ears folded forward */
  add({
    key: 'danchu', label: '진도믹스', name: '단추', prop: 'none',
    fur: '#A85A2A', belly: '#D9A277',
    furs: [['적갈', '#A85A2A'], ['황토', '#C1793C'], ['밤색', '#8A4820'], ['모래', '#CFA97D'], ['먹', '#4A463F'], ['잿빛', '#8B867A']],
    ear: { l: '-6deg', r: '6deg' },
    parts: Object.assign(base(), {
      head: head({
        muzzle: false, mouth: false,
        preStamps: [[patch([4, 8, 12, 12, 10, 6], 'D'), 7, 13]],
        nose: [4, 6, 6, 4], noseY: 14,
        tongue: true, tongueY: 18,
        blush: true, blushY: 15
      }),
      earL: ear(EAR_FOLD, 9, 4, [4, 0]), earR: ear(EAR_FOLD, 31, 4, [4, 0]),
      tail: tail([4, 6, 6, 6, 6, 6, 6, 6, 6], 31, 19, [3, 8], false, -0.7)
    })
  });

  /* ---------- 도담이, asleep ----------
     Drawn side-on rather than derived from the standing sprite: the belly
     has to face the floor and the body has to squash under its own weight,
     and neither is reachable by rotating a front-on drawing.
     Stamped back-to-front — rear haunch, tail, then ribs, then the near
     foreleg and finally the head — so each piece overlaps the one behind. */
  /* Build a shape from explicit per-row spans, then let outline() find its
     edge. Composing generic blobs did not work here: on a white coat the
     seams between overlapping masses vanish and the whole animal reads as
     one featureless sausage. Spelling out the silhouette row by row is the
     only way to control where the dark edges fall. */
  function fromSpans(w, h, spans) {
    var g = [];
    for (var y = 0; y < h; y++) {
      var row = [];
      for (var x = 0; x < w; x++) row.push('.');
      (spans[y] || []).forEach(function (sp) {
        for (var x = sp[0]; x <= sp[1]; x++) if (x >= 0 && x < w) row[x] = 'F';
      });
      g.push(row.join(''));
    }
    return P.outline(g);
  }

  /* light from above: a lit strip along the top, shadow along the floor */
  function shadeRows(rows, topRows, botRows) {
    var h = rows.length;
    return rows.map(function (row, y) {
      return row.split('').map(function (c) {
        if (c !== 'F') return c;
        if (y < topRows) return 'L';
        if (y >= h - botRows) return 'D';
        return 'F';
      }).join('');
    });
  }

  /* One lying body serves every species: the silhouette of a curled-up
     animal is the same shape whatever is on its head. Only the ear, the
     muzzle and the tail change — which is exactly what tells the nine
     apart when they are standing, too. The crab has its own, below: it has no
     side to lie on, and its stalked eyes and claws make nonsense of the
     shape, so it keeps the crouch built from its standing rig. */
  var LYING_SPANS = [
    [],                                   // 0
    [],                                   // 1
    [[22, 28]],                           // 2  crest of the back
    [[20, 30]],                           // 3
    [[18, 32]],                           // 4
    [[5, 10], [17, 33]],                  // 5  crown of the head
    [[4, 11], [16, 33]],                  // 6
    [[1, 13], [15, 34]],                  // 7
    [[0, 34]],                            // 8  head and ribs meet
    [[0, 34]],                            // 9
    [[0, 34]],                            // 10
    [[0, 34]],                            // 11
    [[1, 34]],                            // 12
    [[2, 33]],                            // 13
    [[3, 33]],                            // 14 floor line
    [[4, 10], [24, 31]],                  // 15 fore and hind paws
    []                                    // 16
  ];

  var EARS_LYING = {
    // long and heavy, falling over the cheek
    flop:  { at: [9, 6], art: ['.OOOO.', 'ODDDDO', 'ODDDDO', 'ODDDDO', '.ODDDO', '..ODDO', '...OO.'] },
    // shorter version for the coats that wear it cropped
    flopS: { at: [9, 6], art: ['.OOOO.', 'ODDDDO', 'ODDDDO', '.ODDDO', '..OOO.'] },
    // upright, still cocked even while asleep
    point: { at: [9, 3], art: ['..O..', '.ODO.', 'ODDDO', 'ODDDO', '.OOO.'] },
    // little round nub, barely there
    nub:   { at: [9, 5], art: ['.OO.', 'ODDO', '.OO.'] },
    // folded forward, tip hanging down
    fold:  { at: [9, 4], art: ['.OOO.', 'ODDDO', 'ODDDO', '.ODDO', '..OO.'] }
  };

  var TAILS_LYING = {
    pom:   { at: [32, 3], art: ['.OO.', 'OFFO', 'OFDO', '.OO.'] },
    nub:   { at: [33, 6], art: ['.OO.', 'OFDO', '.OO.'] },
    plume: { at: [31, 2], art: ['..OO.', '.OFFO', 'OFFDO', 'OFDDO', '.OOO.'] },
    long:  { at: [32, 1], art: ['.OO.', 'OFDO', 'OFDO', 'OFDO', 'OFDO', '.OO.'] },
    flat:  { at: [32, 7], art: ['.OOOO.', 'OFFDDO', '.OOOO.'] }
  };

  function lying(opts) {
    var g = shadeRows(fromSpans(36, 17, LYING_SPANS), 1, 2);

    // muzzle laid along the ground, nose at the very tip
    g = P.stamp(g, patch(opts.muzzle || [6, 8, 8, 6], opts.muzzleCh || 'B', opts.muzzleCh ? null : 'b'), 0, 9);
    g = P.stamp(g, ['KKK', 'KKK'], 0, 10);
    // shut eye and a little colour in the cheek
    g = P.stamp(g, ['.OOO.', 'O...O'], 5, 8);
    g = P.stamp(g, patch([3, 3], 'p'), 5, 11);

    var ear = EARS_LYING[opts.ear || 'flop'];
    g = P.stamp(g, ear.art, ear.at[0], ear.at[1]);
    var tail = TAILS_LYING[opts.tail || 'pom'];
    g = P.stamp(g, tail.art, tail.at[0], tail.at[1]);

    return { x: 6, y: 26, rows: g };
  }

  /* The crab sleeps the way a crab does: it settles. The shell comes down
     over the legs, the stalks fold flat instead of standing up, and the
     claws tuck in against the body. Nothing here is a rotation of the
     standing pose — it is drawn low and wide on purpose. */
  var CRAB_SPANS = [
    [[10, 25]],                                   // 0  crown of the shell
    [[7, 28]],                                    // 1
    [[5, 30]],                                    // 2
    [[4, 31]],                                    // 3
    [[3, 32]],                                    // 4
    [[3, 32]],                                    // 5
    [[2, 33]],                                    // 6
    [[2, 33]],                                    // 7  widest
    [[3, 32]],                                    // 8
    [[0, 5], [7, 28], [30, 35]],                  // 9  claws come alongside
    [[0, 6], [9, 26], [29, 35]],                  // 10
    [[1, 6], [11, 24], [29, 34]],                 // 11
    [[8, 11], [14, 21], [24, 27]]                 // 12  tucked legs
  ];

  function crabLying() {
    var g = shadeRows(fromSpans(36, 13, CRAB_SPANS), 2, 2);
    // stalks folded flat on the shell, both eyes shut
    g = P.stamp(g, ['OO..OO'], 12, 4);
    g = P.stamp(g, ['.OO..OO.'], 11, 5);
    // a little colour where the shell meets the ground
    g = P.stamp(g, patch([3, 3], 'p'), 6, 8);
    g = P.stamp(g, patch([3, 3], 'p'), 27, 8);
    return { x: 6, y: 30, rows: g };
  }

  BY_KEY_SLEEP = {
    capybara: function () { return lying({ ear: 'nub',   tail: 'nub',   muzzle: [8, 10, 10, 8] }); },
    cat:      function () { return lying({ ear: 'point', tail: 'long',  muzzle: [4, 6, 6, 4] }); },
    otter:    function () { return lying({ ear: 'nub',   tail: 'flat',  muzzle: [8, 10, 10, 8] }); },
    shiba:    function () { return lying({ ear: 'point', tail: 'plume', muzzle: [6, 8, 8, 6] }); },
    dodam:    function () { return lying({ ear: 'flop',  tail: 'pom',   muzzle: [6, 8, 8, 6] }); },
    cream:    function () { return lying({ ear: 'flop',  tail: 'pom',   muzzle: [6, 8, 8, 6] }); },
    kong:     function () { return lying({ ear: 'flopS', tail: 'pom',   muzzle: [6, 8, 8, 6] }); },
    // 단추 wears a dark mask, so its muzzle is drawn in the outline colour
    danchu:   function () { return lying({ ear: 'fold',  tail: 'long',  muzzle: [6, 8, 8, 6], muzzleCh: 'K' }); },
    crab:     crabLying
  };

  /* ---------- finish ---------- */
  var BY_KEY = {};
  LIST.forEach(function (sp) {
    var cache = null;
    sp.markup = function () {
      if (cache === null) cache = P.build(sp);
      return cache;
    };
    if (BY_KEY_SLEEP[sp.key]) {
      sp.sleep = BY_KEY_SLEEP[sp.key]();
      var sleepCache = null;
      sp.sleepMarkup = function () {
        if (sleepCache === null) sleepCache = P.buildSleep(sp);
        return sleepCache;
      };
    }
    sp.origins = P.origins(sp);
    BY_KEY[sp.key] = sp;
  });

  /* Stage variants are built the first time they are asked for and then
     kept: nine species times six stages is cheap, but rebuilding one on
     every animation frame would not be. */
  var VARIANTS = {};

  function at(key, stage, build) {
    var sp = BY_KEY[key] || LIST[0];
    if (stage === 'egg') return sp;
    var b = BUILD[build] || BUILD.normal;
    if ((!stage || stage === 'adult') && !b.fat && !b.grow) return sp;
    var id = sp.key + ':' + stage + ':' + (build || 'normal');   // build changes the body
    if (VARIANTS[id]) return VARIANTS[id];

    var v = variant(sp, stage, build);
    if (v !== sp) {
      var cache = null;
      v.markup = function () {
        if (cache === null) cache = P.build(v);
        return cache;
      };
      v.origins = P.origins(v);
      // the lying-down sprite is drawn once, at adult size, for everyone
      v.sleepMarkup = sp.sleepMarkup;
      v.sleep = sp.sleep;
    }
    VARIANTS[id] = v;
    return v;
  }

  var eggCache = {};
  function eggMarkup(cracked) {
    var id = cracked ? 'cracked' : 'whole';
    if (!eggCache[id]) {
      var e = eggRows(cracked);
      eggCache[id] = '<g shape-rendering="crispEdges" stroke="none">' +
                       '<g id="eggBody">' + P.encode(e.rows, e.x, e.y) + '</g>' +
                     '</g>';
    }
    return eggCache[id];
  }

  root.SPECIES = {
    list: LIST,
    get: function (key) { return BY_KEY[key] || LIST[0]; },
    at: at,
    eggMarkup: eggMarkup
  };
})(window);
