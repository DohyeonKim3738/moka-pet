/* ------------------------------------------------------------------
 * gear.js — accessories, in four independent slots.
 *
 *   head   on top of the skull      eyes   spectacles
 *   hand   held in the right paw    body   clothing
 *
 * One set fits every species: the roster shares its eye, body and arm
 * landmarks (see species.js), so an accessory drawn once lands correctly
 * on all nine. The crab has its own skeleton and overrides the anchors.
 *
 * Hand gear is emitted INSIDE the #armR group so it swings with the arm.
 * Anything else would leave a coffee cup hanging in mid-air the moment
 * the pet waves.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var P = root.PIXEL;

  /* ---------- eyes ----------
     Eyes are 4x5 at x16..19 and x28..31, y13..17. A lens whose interior
     is exactly the eye looks like a rim resting on the eyeball, so each
     lens is 8x9 with its interior one dot clear on every side:
     x15..20 / x27..32, y12..18. */
  var LENS_L = 2, LENS_R = 14, LENS_W = 8, LENS_H = 9;   // canvas-local
  function specs(build) { return build(P.blank(24, 9)); }

  var EYES = {
    horn: {
      label: '뿔테 안경', at: [12, 11],
      art: specs(function (g) {
        g = P.box(g, LENS_L, 0, LENS_W, LENS_H, 'K');
        g = P.box(g, LENS_R, 0, LENS_W, LENS_H, 'K');
        g = P.hline(g, LENS_L, 0, 20, 'K');    // the heavy brow that names it
        g = P.hline(g, LENS_L, 1, 20, 'K');
        g = P.hline(g, 10, 3, 4, 'K');         // bridge
        g = P.hline(g, 0, 3, 2, 'K');          // temples
        g = P.hline(g, 22, 3, 2, 'K');
        return g;
      })
    },
    rimless: {
      label: '무테 안경', at: [12, 11],
      art: specs(function (g) {
        g = P.hline(g, 10, 4, 4, 'A');         // bridge
        g = P.hline(g, 0, 4, 2, 'A');          // temples
        g = P.hline(g, 22, 4, 2, 'A');
        g = P.vline(g, LENS_L, 2, 5, 'A');     // only the outer edges hinted
        g = P.vline(g, LENS_L + LENS_W - 1, 2, 5, 'A');
        g = P.vline(g, LENS_R, 2, 5, 'A');
        g = P.vline(g, LENS_R + LENS_W - 1, 2, 5, 'A');
        return g;
      })
    },
    half: {
      label: '반무테 안경', at: [12, 11],
      art: specs(function (g) {
        g = P.hline(g, LENS_L, 0, 20, 'K');    // brow bar carries the whole rim
        g = P.vline(g, LENS_L, 0, 4, 'K');
        g = P.vline(g, LENS_L + LENS_W - 1, 0, 4, 'K');
        g = P.vline(g, LENS_R, 0, 4, 'K');
        g = P.vline(g, LENS_R + LENS_W - 1, 0, 4, 'K');
        g = P.hline(g, 10, 3, 4, 'K');
        g = P.hline(g, 0, 3, 2, 'K');
        g = P.hline(g, 22, 3, 2, 'K');
        return g;
      })
    },
    sun: {
      label: '선글라스', at: [12, 11],
      art: specs(function (g) {
        g = P.box(g, LENS_L, 0, LENS_W, LENS_H, 'K', 'K');
        g = P.box(g, LENS_R, 0, LENS_W, LENS_H, 'K', 'K');
        g = P.hline(g, 10, 3, 4, 'K');
        g = P.hline(g, 0, 3, 2, 'K');
        g = P.hline(g, 22, 3, 2, 'K');
        g = P.hline(g, 3, 2, 2, 'H');          // a glint, or it reads as a hole
        g = P.dot(g, 5, 3, 'H');
        g = P.hline(g, 15, 2, 2, 'H');
        g = P.dot(g, 17, 3, 'H');
        return g;
      })
    }
  };

  /* ---------- head ---------- */
  var HEAD = {
    yuzu: {
      label: '유자', at: [20, -2],
      art: ['...SS...', '..GSSG..', '.GGSSGG.', '.OYYYYO.',
            'OYyyYYYO', 'OYyYYYYO', 'OYYYYYYO', '.OYYYYO.', '..OOOO..']
    },
    leaf: {
      label: '나뭇잎', at: [20, -2],
      art: ['.....GG.', '...GGGG.', '..GGGGG.', '.GGgGGG.',
            '.GGGGG..', 'SGGGG...', 'SG......', 'S.......']
    },
    star: {
      label: '별', at: [20, -2],
      art: ['...YY...', '...YY...', 'YYYYYYYY', '.YYYYYY.',
            '..YYYY..', '.YY..YY.', '.Y....Y.', '........']
    }
  };

  /* ---------- hand ----------
     The right paw is around x36..38, y33..35. Items sit just outside it
     so the paw still reads as a paw; the first pass tucked them behind
     the arm and they looked dropped rather than held. */
  function held(build) { return build(P.blank(12, 14)); }

  /* a rounded solid from a width profile — square blobs read as boxes */
  function garment(widths, fill) {
    return P.outline(P.blob(widths)).map(function (row) {
      return row.split('').map(function (c) {
        return c === 'O' ? 'K' : (c === 'F' ? fill : '.');
      }).join('');
    });
  }

  var HAND = {
    coffee: {
      label: '커피잔', at: [34, 24],
      art: held(function (g) {
        g = P.box(g, 2, 6, 6, 6, 'K', 'W');    // cup
        g = P.hline(g, 3, 8, 4, 'K');          // sleeve band
        g = P.hline(g, 3, 9, 4, 'K');
        g = P.box(g, 8, 8, 2, 3, 'K');         // handle
        g = P.vline(g, 4, 3, 3, 'A');          // steam
        g = P.vline(g, 6, 2, 3, 'A');
        return g;
      })
    },
    balloon: {
      label: '풍선', at: [34, 24],
      art: held(function (g) {
        g = P.stamp(g, garment([3, 5, 7, 7, 7, 5, 3], 'R'), 2, 0);   // balloon
        g = P.hline(g, 4, 2, 2, 'H');          // highlight
        g = P.dot(g, 5, 7, 'K');               // knot
        g = P.vline(g, 5, 8, 5, 'K');          // string, down to the paw
        return g;
      })
    },
    flowers: {
      label: '꽃다발', at: [34, 24],
      art: held(function (g) {
        g = P.box(g, 1, 2, 3, 3, 'P', 'P');    // blooms
        g = P.box(g, 5, 1, 3, 3, 'Y', 'Y');
        g = P.box(g, 7, 4, 3, 3, 'P', 'P');
        g = P.dot(g, 2, 3, 'H');
        g = P.dot(g, 6, 2, 'H');
        g = P.vline(g, 4, 4, 7, 'G');          // stems
        g = P.vline(g, 5, 5, 6, 'G');
        g = P.vline(g, 6, 6, 5, 'G');
        g = P.hline(g, 3, 11, 5, 'S');         // wrap
        return g;
      })
    },
    notebook: {
      label: '노트북', at: [34, 24],
      art: held(function (g) {
        g = P.box(g, 1, 6, 9, 7, 'K', 'W');    // open pages
        g = P.vline(g, 5, 6, 7, 'K');          // spine
        g = P.hline(g, 2, 8, 3, 'A');          // ruled lines
        g = P.hline(g, 2, 10, 3, 'A');
        g = P.hline(g, 6, 8, 3, 'A');
        g = P.hline(g, 6, 10, 3, 'A');
        g = P.vline(g, 10, 2, 4, 'Y');         // pencil
        g = P.dot(g, 10, 6, 'K');
        return g;
      })
    }
  };

  /* ---------- body ----------
     Torso is x13..34, y26..40. Clothing built from width profiles rather
     than plain rectangles — a square slab across the belly reads as a
     sticker, not a garment. */
  function worn(build) { return build(P.blank(26, 20)); }

  var BODY = {
    scarf: {
      label: '목도리', at: [11, 22],
      art: worn(function (g) {
        g = P.stamp(g, garment([16, 20, 20, 18], 'R'), 3, 2);   // wrap at the neck
        g = P.box(g, 16, 5, 5, 9, 'K', 'R');                    // hanging end
        g = P.hline(g, 17, 7, 3, 'K');                          // knit stripes
        g = P.hline(g, 17, 10, 3, 'K');
        return g;
      })
    },
    hoodie: {
      label: '후드티', at: [11, 22],
      art: worn(function (g) {
        g = P.stamp(g, garment([10, 14, 16, 16], 'C'), 5, 1);   // hood behind the head
        g = P.stamp(g, garment([18, 22, 24, 24, 24, 24, 24, 24, 24, 24, 22, 20, 16], 'C'), 1, 5);
        g = P.vline(g, 11, 7, 4, 'K');                          // drawstrings
        g = P.vline(g, 14, 7, 4, 'K');
        g = P.box(g, 8, 12, 10, 4, 'K');                        // pocket
        return g;
      })
    },
    bowtie: {
      label: '나비넥타이', at: [11, 22],
      art: worn(function (g) {
        g = P.box(g, 6, 3, 5, 5, 'K', 'R');
        g = P.box(g, 15, 3, 5, 5, 'K', 'R');
        g = P.box(g, 11, 4, 4, 3, 'K', 'R');   // knot
        g = P.dot(g, 8, 4, 'H');
        return g;
      })
    },
    overalls: {
      label: '멜빵반바지', at: [11, 22],
      art: worn(function (g) {
        g = P.stamp(g, garment([20, 22, 22, 22, 22, 22, 20, 18, 14], 'C'), 2, 10);  // shorts
        g = P.stamp(g, garment([10, 12, 12, 12, 12], 'C'), 7, 5);                   // bib
        g = P.vline(g, 8, 2, 4, 'C');                                               // straps
        g = P.vline(g, 9, 2, 4, 'K');
        g = P.vline(g, 16, 2, 4, 'K');
        g = P.vline(g, 17, 2, 4, 'C');
        g = P.dot(g, 9, 6, 'Y');                                                    // buttons
        g = P.dot(g, 16, 6, 'Y');
        g = P.vline(g, 13, 12, 6, 'K');                                             // leg seam
        return g;
      })
    }
  };

  /* ---------- droppings ----------
     Fixed browns, not the species palette: it should read as the same
     thing whatever colour the pet is. */
  var POOP = ['..KKK..', '.KSSSK.', '.KSSSK.', 'KSSSSSK', 'KSSSSSK', '.KKKKK.'];

  root.GEAR = {
    poop: POOP,
    slots: ['head', 'eyes', 'hand', 'body'],
    labels: { head: '머리', eyes: '눈', hand: '손', body: '옷' },
    items: { head: HEAD, eyes: EYES, hand: HAND, body: BODY }
  };
})(window);
