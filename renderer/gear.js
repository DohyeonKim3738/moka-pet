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
      label: '유자', at: [20, -2], fromHead: -6,
      art: ['...SS...', '..GSSG..', '.GGSSGG.', '.OYYYYO.',
            'OYyyYYYO', 'OYyYYYYO', 'OYYYYYYO', '.OYYYYO.', '..OOOO..']
    },
    leaf: {
      label: '나뭇잎', at: [20, -2], fromHead: -6,
      art: ['.....GG.', '...GGGG.', '..GGGGG.', '.GGgGGG.',
            '.GGGGG..', 'SGGGG...', 'SG......', 'S.......']
    },
    star: {
      label: '별', at: [20, -2], fromHead: -6,
      art: ['...YY...', '...YY...', 'YYYYYYYY', '.YYYYYY.',
            '..YYYY..', '.YY..YY.', '.Y....Y.', '........']
    },

    /* ---- earned, not given ----
       `lock` names the milestone that hands it over. Until then the item
       is not offered anywhere. */
    cap: {
      /* Nine rows at the same anchor the yuzu uses: the lower rows have to
         sink into the skull or the hat floats above the head. */
      label: '졸업 모자', at: [20, -2], fromHead: -6, lock: 'adult',
      art: ['........',
            '........',
            '.......Y',      // tassel button
            'KKKKKKKK',      // the board
            'KKKKKKKK',
            '..KKKK.Y',      // crown, with the tassel down the side
            '..KKKK.Y',
            '..KKKK.y',
            '..KKKK..']
    },
    beret: {
      /* A soft cap pulled down over the skull, with a brim on one side.
         Flat colour would read as a helmet, so the crown is two tones. */
      label: '탐험 모자', at: [20, -1], fromHead: -5, lock: 'walk100',
      art: ['........',
            '..GGGG..',
            '.GGGGGG.',
            'GGgggGGG',
            'GGGGGGGG',
            'KKKKKKKK',      // band
            '..KKKKKK',      // brim, off to one side
            '........',
            '........']
    },
    ribbon: {
      /* Two loops and a knot. The knot has to be dark or the whole thing
         flattens into one pink blob. */
      label: '리본', at: [21, 0], fromHead: -4, lock: 'three',
      art: ['........',
            '........',
            '.PP..PP.',
            'PPPPPPPP',
            'PPpKKpPP',
            'PPPPPPPP',
            '.PP..PP.',
            '..P..P..',
            '........']
    },
    halo: {
      /* 머리에 얹는 것이 아니라 위에 떠 있는 고리. 옆에서 본 타원이라
         세 줄이면 충분하고, 두껍게 그리면 도넛이 된다. */
      /* 머리 '위'에 고리를 띄우면 천사 링이 된다 — 죽은 것처럼 보인다.
         후광은 머리 '뒤'에서 머리를 감싸는 빛이므로, 머리보다 큰 타원을
         머리 중심에 맞춰 두르고 바깥으로 빛살을 낸다. 아래쪽 절반은
         몸에 파묻히니 그리지 않는다. */
      /* fromHead: 머리 윗줄을 기준으로 놓는다. 슬롯 오프셋으로 놓으면
         머리가 낮은 게에서 후광만 허공에 남는다. -4 는 타원 중심(캔버스
         15째 줄)이 머리 한가운데에 오게 하는 값이다. */
      label: '후광', at: [6, 0], fromHead: -4, lock: 'spirit',
      art: (function () {
        var W = 36, H = 26, g = P.blank(W, H);
        var cx = 17, cy = 15, rx = 17, ry = 16;   // 머리(26x22)보다 한 바퀴 크게
        function ring(r1, r2, ch, from, to, step) {
          for (var a = from; a <= to; a += step) {
            var t = a * Math.PI / 180;
            var x = Math.round(cx + r1 * Math.cos(t));
            var y = Math.round(cy - r2 * Math.sin(t));
            if (y > cy + 2 || x < 0 || x >= W || y < 0 || y >= H) continue;
            g = P.dot(g, x, y, ch);
          }
        }
        ring(rx, ry, 'Y', -12, 192, 1);           // 테두리
        // 안쪽 옅은 겹은 위쪽만. 옆까지 두 겹으로 두르면 귀를 타고 내려와
        // 머리에 씌운 테처럼 보인다.
        ring(rx - 2, ry - 2, 'y', 25, 155, 1);
        // 빛살 — 바깥으로 두 칸씩. 테두리만 있으면 접시로 읽힌다.
        [15, 45, 75, 105, 135, 165].forEach(function (a) {
          var t = a * Math.PI / 180;
          for (var k = 2; k <= 3; k++) {
            var x = Math.round(cx + (rx + k) * Math.cos(t));
            var y = Math.round(cy - (ry + k) * Math.sin(t));
            if (x < 0 || x >= W || y < 0 || y >= H) continue;
            g = P.dot(g, x, y, 'Y');
          }
        });
        return g;
      })()
    },
    crown: {
      label: '황금 왕관', at: [20, -3], fromHead: -7, lock: 'all9',
      art: ['.Y....Y.',      // points
            '.Y.YY.Y.',
            '.YYYYYY.',
            '.YyYYyY.',
            '.YYYYYY.',
            '.YRYRYY.',      // set stones
            '.YYYYYY.',
            '.OOOOOO.']      // band, sitting on the head
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
    },

    /* ---- earned, not given ---- */
    bone: {
      /* Was a whistle. At twelve dots a whistle is a grey lump with a
         spout — it read as a stapler. A bone is two circles and a bar:
         the silhouette carries it, and it says "training treat" without
         needing any detail at all. */
      // centred on the paw (y33..35), not floating above it
      label: '뼈다귀', at: [33, 31], lock: 'trick5',
      /* The shaft has to be thin and long. A short one whose middle is as
         thick as its ends is a bow tie, which is exactly what the first
         attempt looked like. */
      art: ['.KK......KK.',
            'KWWK....KWWK',
            'KWWWKKKKWWWK',
            'KWWWWWWWWWWK',
            'KWWWKKKKWWWK',
            'KWWK....KWWK',
            '.KK......KK.']
    },
    broom: {
      /* The paw is at y33..35, so the SHAFT has to run through those rows
         and the bristles hang below it, near the floor. The first version
         put the whole broom above the paw, which left the pet cupping the
         underside of the brush instead of gripping the handle. */
      label: '빗자루', at: [35, 24], lock: 'tidy',
      art: ['..KK..',      // 24  top of the handle
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',      // 33  the paw closes here
            '..KS..',      // 34
            '..KS..',      // 35
            '.KKKK.',      // 36  ferrule
            'KYYYYK',
            'KYyyYK',
            'KYyyYK',
            'KYyyYK',
            'KY.Y.K',
            'K.K.K.']      // 42  bristles, just off the floor
    },
    cane: {
      /* 빗자루와 같은 규칙: 자루가 앞발 줄(y33..35)을 지나야 손잡이를
         쥔 것으로 보인다. 위쪽 손잡이 머리는 금색이라 나무 막대가 아니라
         '짚는 지팡이'로 읽힌다. */
      label: '지팡이', at: [35, 22], lock: 'sage',
      art: ['..KK..',      // 22  손잡이 머리
            '.KYYK.',
            'KYyyYK',
            '.KYYK.',
            '..KS..',      // 26  자루
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',      // 33  앞발이 여기서 감긴다
            '..KS..',      // 34
            '..KS..',      // 35
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',
            '..KS..',
            '..KK..']      // 41  바닥에 닿는 끝
    },
    mic: {
      /* Ball on a stick. Keeping the ball two dots wider than the shaft
         is what stops it reading as a hammer. */
      label: '마이크', at: [34, 25], lock: 'showoff',   // grip near the base
      art: ['.KKKK.',
            'KWAAWK',
            'KAWWAK',
            'KWAAWK',
            'KAWWAK',
            '.KKKK.',
            '..KK..',
            '..KK..',
            '..KK..',
            '..KK..',
            '.KKKK.']
    },
    suitcase: {
      /* The handle has to land on the paw (y33..35) and the case hang
         below it. Drawn at y24 the handle sat up by the shoulder and the
         paw closed around the bottom corner of the case instead. */
      label: '여행 가방', at: [34, 30], lock: 'walk20',
      art: held(function (g) {
        g = P.box(g, 1, 5, 9, 7, 'K', 'S');    // case
        g = P.hline(g, 2, 8, 7, 'K');          // seam
        g = P.box(g, 4, 3, 3, 3, 'K');         // handle
        g = P.dot(g, 3, 6, 'Y');               // clasps
        g = P.dot(g, 7, 6, 'Y');
        return g;
      })
    },
  };

  /* ---------- body ----------
     Torso is x13..34, y26..40. Clothing built from width profiles rather
     than plain rectangles — a square slab across the belly reads as a
     sticker, not a garment. */
  function worn(build) { return build(P.blank(26, 20)); }

  var BODY = {
    scarf: {
      /* 목에 걸린다 — 머리 아래끝 기준. 몸 소품의 어린 단계 보정을
         그대로 받으면 머리 속으로 들어간다. */
      label: '목도리', at: [11, 22], belowHead: -4,
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
      // 목에 걸린다 — 머리 아래끝 기준
      label: '나비넥타이', at: [11, 22], belowHead: -4,
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
    },

    /* ---- earned, not given ---- */
    /* A cape hangs behind, and the body slot draws in front — so it is
       drawn as what you would actually see from the front: a collar, and
       the cloth flaring out past both shoulders. Covering the chest made
       it an apron. */
    apron: {
      /* The body slot draws in FRONT, which made the cape read as an
         apron — so an actual apron is the one thing this slot is good at.
         A bib, a waist tie, and a pocket. */
      // 목끈과 가슴받이가 정체다 — 어린 단계에서 그게 머리에 먹혔다
      label: '앞치마', at: [11, 22], belowHead: -4, lock: 'chef',
      art: worn(function (g) {
        g = P.stamp(g, garment([12, 14, 14, 16, 18, 18, 18, 16], 'W'), 4, 4);
        g = P.hline(g, 8, 2, 10, 'R');          // neck strap
        g = P.hline(g, 8, 3, 10, 'K');
        g = P.hline(g, 2, 9, 22, 'R');          // waist tie, running off both sides
        g = P.hline(g, 2, 10, 22, 'K');
        // the pocket needs its own colour or it vanishes into the cloth
        g = P.box(g, 9, 12, 8, 5, 'Y', 'K');
        g = P.vline(g, 13, 13, 3, 'K');
        return g;
      })
    },
    medal: {
      /* A ribbon round the neck and a disc on the chest. The disc has to
         sit low, or it disappears under the chin. */
      // 목줄이 목에서 시작한다 — 머리 아래끝 기준
      label: '금메달', at: [11, 22], belowHead: -4, lock: 'alltricks', stretch: false,
      /* It does not stretch with the body, so it has to fit the SLIMMEST
         one: the ribbon stays inside dots 17..30, which is where a slim
         pet's chest is. Any wider and it hangs off the side. */
      art: worn(function (g) {
        // the neck is the narrowest part — the top of the V starts inside it
        g = P.hline(g, 8, 2, 2, 'R');  g = P.hline(g, 16, 2, 2, 'R');
        g = P.hline(g, 9, 3, 2, 'R');  g = P.hline(g, 15, 3, 2, 'R');
        g = P.hline(g, 10, 4, 2, 'R'); g = P.hline(g, 14, 4, 2, 'R');
        g = P.hline(g, 11, 5, 2, 'R'); g = P.hline(g, 13, 5, 2, 'R');
        g = P.hline(g, 11, 6, 4, 'R');
        // A square plate reads as a small picture frame — the disc has to
        // be round, and lit from one side so it looks like metal.
        g = P.stamp(g, ['..KKKK..',
                        '.KYYYYK.',
                        'KYyyyYYK',
                        'KYyWyYYK',
                        'KYyyyYYK',
                        'KYYYYYYK',
                        '.KYYYYK.',
                        '..KKKK..'], 9, 7);
        return g;
      })
    },
    robe: {
      /* 몸 슬롯은 펫 '앞'에 그려지므로 가슴을 덮으면 앞치마로 읽힌다.
         앞치마와 갈리는 것은 허리의 띠와 가운데 여밈선이다. */
      label: '도포', at: [11, 22], lock: 'wise',
      art: worn(function (g) {
        /* 몸통 끝까지 채우면 팔과 앞발을 덮어, 지팡이를 같이 들었을 때
           손이 없이 막대만 떠 있는 것처럼 보였다. 양옆을 비워 둔다. */
        g = P.stamp(g, garment([12, 16, 18, 18, 18, 18, 18, 18, 18, 18, 16, 12], 'C'), 4, 3);
        g = P.vline(g, 13, 4, 6, 'K');          // 앞섶 여밈선, 허리띠 위까지
        g = P.hline(g, 5, 10, 16, 'Y');         // 허리띠
        g = P.hline(g, 5, 11, 16, 'K');
        return g;
      })
    },
    cape: {
      /* A shoulder cape, not a full one. The body slot draws in front of
         the pet, so anything that covers the chest reads as an apron —
         two side panels read as pom-poms. Cloth over the shoulders,
         belly left showing, is what says "cape" from the front. */
      /* 어깨에 걸치는 것이라 윗부분이 곧 정체다 — 아기에서는 그 윗부분이
         통째로 머리에 먹혀 망토가 아예 보이지 않았다. */
      label: '별 망토', at: [11, 22], belowHead: -4, lock: 'legend',
      art: worn(function (g) {
        g = P.stamp(g, garment([14, 18, 22, 24, 24, 24, 22], 'G'), 0, 3);
        g = P.hline(g, 8, 2, 8, 'Y');           // gold clasp at the throat
        g = P.hline(g, 9, 3, 6, 'y');
        g = P.dot(g, 4, 6, 'Y');                // stars scattered in it
        g = P.dot(g, 19, 5, 'Y');
        g = P.dot(g, 8, 8, 'y');
        g = P.dot(g, 15, 8, 'Y');
        g = P.dot(g, 11, 6, 'y');
        return g;
      })
    }
  };

  /* ---------- 옆모습 ----------
     자는 그림과 엎드려는 서 있는 rig 를 쓰지 않는 별개의 그림이고, 옆을
     본다. 정면으로 그린 소품을 그대로 얹으면 안경알 두 개가 옆얼굴에
     나란히 붙는 꼴이 된다. 그래서 소품마다 옆모습 그림을 따로 둔다.

     `at` 은 자세가 알려 준 기준점에서의 상대 좌표다(species.js 의 gearAt).
     머리 소품은 좌우를 뒤집기만 하면 된다 — 누운 아이는 왼쪽을 보고,
     서 있는 아이는 이쪽을 본다. 모자챙도 같이 돌아야 한다. 대칭인 것들은
     뒤집어도 그대로라 전부에 걸어도 안전하다. */

  /* 그림의 여백은 물건마다 다르다 — 눈대중으로 at 을 적으면 어떤 것은 뜨고
     어떤 것은 파묻힌다. 그러니 **실제로 칠해진 부분의 경계를 재서** 가운데를
     기준점에 맞추고, 아랫변을 머리 꼭대기에 앉힌다. `sink` 는 머리에 눌러
     쓰는 정도다 — 모자는 파고들고, 얹어 두는 것(유자·별)은 0 이다. */
  function inkBox(art) {
    var x0 = 1e9, x1 = -1e9, y1 = -1;
    art.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        if (row[x] === '.') continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    });
    return { x0: x0, x1: x1, y1: y1 };
  }

  function seat(art, sink, nudge) {
    var b = inkBox(art);
    return { art: art,
             at: [-Math.round((b.x0 + b.x1) / 2) + (nudge || 0), -(b.y1 + 1) + sink] };
  }

  function sideHead(key, sink, nudge) {
    var art = HEAD[key].art;
    HEAD[key].side = seat(P.flip(art), sink, nudge);
    // 게는 정면으로 눕는다 — 뒤집으면 챙이 반대로 간다
    HEAD[key].side.poses = { crab: seat(art, sink, nudge) };
  }

  sideHead('yuzu',   0);
  sideHead('leaf',   0);
  sideHead('star',   0);
  sideHead('cap',    2);
  sideHead('beret',  2);
  sideHead('ribbon', 1);
  sideHead('crown',  1);
  /* 후광은 정면용이 36 폭짜리 큰 원이라 옆에서는 머리를 한참 넘어선다.
     옆모습용을 따로 그리되 **머리 위에 뜬 고리로 그리면 안 된다** — 그러면
     천사링이 되어 죽은 것처럼 보인다. 머리를 감싸고 내려오는 빛무리라야 한다. */
  HEAD.halo.side = { at: [-8, -8], art: ['......yyyy......',
                                         '....yyYYYYyy....',
                                         '..yyY......Yyy..',
                                         '.yY..........Yy.',
                                         'yY............Yy',
                                         'y..............y',
                                         'y..............y',
                                         'y..............y',
                                         'y..............y',
                                         'y..............y',
                                         '.y............y.',
                                         '.y............y.',
                                         '..y..........y..',
                                         '..y..........y..',
                                         '...y........y...'] };
  HEAD.halo.side.poses = { crab: { at: [-10, -11], art: HEAD.halo.side.art } };

  /* 안경은 옆에서 보면 알 하나와 뒤로 뻗은 다리다. 아이가 왼쪽을 보므로
     알이 왼쪽, 다리가 오른쪽으로 간다. */
  /* 안경은 옆에서 보면 알 하나와 뒤로 뻗은 다리다. 아이가 왼쪽을 보므로
     알이 왼쪽, 다리가 오른쪽(귀 쪽)으로 간다.

     ★알 속은 비워 둔다. 처음에 위 테를 두 줄로 두껍게 그렸더니 눈이 통째로
     가려져 얼굴에 검은 막대가 붙은 꼴이 됐다 — 안경은 눈이 보여야 안경이다.
     선글라스만은 가리는 것이 본래 구실이라 채운다. */
  EYES.horn.side    = { at: [-1, -1], art: ['KKKK.....',
                                            'K..KKKKKK',
                                            'K..K.....',
                                            'KKKK.....'] };
  EYES.rimless.side = { at: [-1, -1], art: ['A..A.....',
                                            'A..AAAAAA',
                                            'A..A.....',
                                            'AAAA.....'] };
  EYES.half.side    = { at: [-1, -1], art: ['KKKK.....',
                                            'K..KKKKKK',
                                            'K..K.....',
                                            '.........'] };
  EYES.sun.side     = { at: [-1, -1], art: ['KKKK.....',
                                            'KHKKKKKKK',
                                            'KKKK.....',
                                            'KKKK.....'] };

  /* 게가 눕는 그림은 정면이다 — 접힌 눈자루 두 개가 나란히 보인다.
     옆모습 안경알 하나를 얹으면 등딱지에 붙인 스티커처럼 보인다. */
  function crabEyes(key, art) { EYES[key].side.poses = { crab: { at: [-5, -1], art: art } }; }

  crabEyes('horn',    ['KKKK.KKKK.', 'KKKK.KKKK.', 'K..KKK..K.', 'KKKK.KKKK.']);
  crabEyes('rimless', ['AAA...AAA.', 'A.A.A.A.A.', 'AAA...AAA.', '..........']);
  crabEyes('half',    ['KKKK.KKKK.', 'K..KKK..K.', 'K..K.K..K.', '..........']);
  crabEyes('sun',     ['KKKK.KKKK.', 'KHKK.KHKK.', 'KKKKKKKKK.', 'KKKK.KKKK.']);

  /* 옆으로 누우면 목은 **세로로** 지나간다 — 머리가 왼쪽, 몸이 오른쪽이니
     목을 감는 것은 세로 띠로 보인다. 정면용 26 폭 그림을 눕혀 얹으면 몸
     밖으로 삐져나가고 귀 위에 걸린다.

     ★띠 길이를 그림으로 못 박으면 안 된다. 자세마다 목의 두께가 다르다 —
     자기는 여덟 줄, 엎드려는 일곱 줄, 게는 열세 줄이다. 아홉 줄짜리 그림
     하나로 셋을 덮으려 했더니 엎드려에서는 몸 밖으로 흘러내리고, 자기에서는
     등 위 허공에서 시작했다. 그래서 **길이를 받아 그때그때 짜낸다.** */
  function bandOf(h, fill, o) {
    o = o || {};
    var rows = ['.KKKK.'];
    for (var i = 0; i < h - 2; i++) rows.push('K' + fill + fill + fill + fill + 'K');
    rows.push('.KKKK.');
    (o.top || []).forEach(function (r, i) { if (1 + i < h - 1) rows[1 + i] = r; });
    (o.bottom || []).forEach(function (r, i) {
      var y = h - 1 - (o.bottom.length - i);
      if (y > 0) rows[y] = r;
    });
    if (o.mid) {
      var y0 = Math.max(1, Math.round((h - o.mid.length) / 2));
      o.mid.forEach(function (r, i) { if (y0 + i < h - 1) rows[y0 + i] = r; });
    }
    return rows;
  }

  function sideBody(key, fill, o) {
    BODY[key].side = { at: [0, 0], build: function (h) { return bandOf(h, fill, o); } };
  }

  sideBody('scarf', 'R', { bottom: ['.KRRK.', '.KRRK.', '.KKKK.'] });
  /* 나비넥타이는 띠를 통째로 검게 칠하면 목에 검은 덩어리가 걸린 꼴이 된다.
     가는 끈에 나비를 매단 모양이라야 나비넥타이로 읽힌다. */
  BODY.bowtie.side = { at: [0, 0], build: function (h) {
    var rows = [];
    for (var i = 0; i < h; i++) rows.push('..KK..');
    var y0 = Math.max(0, Math.round((h - 5) / 2));
    ['.KKKK.', 'KRRRRK', 'KRHHRK', 'KRRRRK', '.KKKK.'].forEach(function (r, i) {
      if (y0 + i < h) rows[y0 + i] = r;
    });
    return rows;
  } };
  sideBody('medal',    'R', { bottom: ['.KKKK.', 'KYYYYK', 'KYyWYK', '.KKKK.'] });
  sideBody('hoodie',   'C');
  sideBody('overalls', 'C', { mid: ['KYCCYK'] });
  sideBody('apron',    'W', { top: ['KRRRRK'] });
  sideBody('robe',     'C', { mid: ['KYYYYK'] });
  sideBody('cape',     'G', { top: ['.YYYY.'] });

  /* 손에 든 것은 누우면 내려놓는다 — 코앞 바닥에 둔다. 서 있을 때 쓰던
     그림을 그대로 쓴다(물건은 어느 쪽에서 봐도 물건이다). 다만 빗자루와
     지팡이는 세로로 긴 물건이라 눕혀 그린다. */
  function sideHand(key, dx, art) {
    // 바닥에 놓는 것이라 **칠해진 아랫변**이 바닥 줄에 닿아야 한다.
    // 그림마다 아래 여백이 달라서 at 을 손으로 적으면 어떤 건 뜨고 어떤 건 파묻힌다.
    var a = art || HAND[key].art;
    HAND[key].side = { art: a, at: [dx, -(inkBox(a).y1 + 1)] };
  }
  sideHand('coffee',   0);
  sideHand('balloon',  0);
  sideHand('flowers',  0);
  sideHand('notebook', 0);
  sideHand('suitcase', 0);
  sideHand('bone',     0);
  sideHand('mic',      1);
  sideHand('broom', -2, ['.KKKKKKKKKKK..',
                         'KKSSSSSSSSSSK.',
                         'KYYYYKSSSSSSSK',
                         'KYYYYKSSSSSSSK',
                         'KYYYYKSSSSSSSK',
                         '.KKKKKKKKKKKK.']);
  sideHand('cane',  -2, ['....KKKKKKKKKK',
                         '.KKKSSSSSSSSSK',
                         'KYYKSSSSSSSSSK',
                         'KYyK..........',
                         '.KK...........']);


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
