/* ------------------------------------------------------------------
 * room.js — the place the pet lives, when you give it one.
 *
 * Four slots, none of them worn:
 *
 *   back    on the wall behind      floor   the ground it stands on
 *   left    beside it, left         right   beside it, right
 *
 * The pet's own art is 48 dots wide and stands on y44. A room widens the
 * stage to 96 dots — 24 spare on each side — so the sides have somewhere
 * to be. Everything here is drawn in that wider space, in dots, and the
 * pet keeps the middle.
 *
 * Colours are fixed rather than tinted: a room should not change hue
 * when you switch pets. Only the pet is the pet.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var P = root.PIXEL;

  /* the room's coordinate space, in dots */
  var ROOM_W = 96;          // stage width when a room is shown
  var LEFT = -24;           // where the pet's own 48-wide art begins
  var FLOOR_Y = 44;         // the line the pet stands on

  function box(w, h, fill, line) {
    var rows = [];
    for (var y = 0; y < h; y++) {
      var r = '';
      for (var x = 0; x < w; x++) {
        var edge = (x === 0 || y === 0 || x === w - 1 || y === h - 1);
        r += edge ? (line || 'K') : fill;
      }
      rows.push(r);
    }
    return rows;
  }

  function fill(w, h, ch) {
    var rows = [];
    for (var y = 0; y < h; y++) rows.push(new Array(w + 1).join(ch));
    return rows;
  }

  /* ---------- back: on the wall ---------- */
  var BACK = {
    frame: {
      label: '가족 액자', at: [8, 4],
      art: (function () {
        var g = box(20, 16, 'W', 'S');
        g = P.stamp(g, box(16, 12, 'W', 'K'), 2, 2);
        // a heart, big enough to read at this size
        g = P.stamp(g, ['..RR..RR..',
                        '.RRRRRRRR.',
                        'RRRRRRRRRR',
                        'RRRRRRRRRR',
                        '.RRRRRRRR.',
                        '..RRRRRR..',
                        '...RRRR...',
                        '....RR....'], 5, 4);
        return g;
      })()
    },
    house: {
      label: '강아지집', at: [4, 12],
      art: (function () {
        var g = fill(28, 24, '.');
        // gable
        for (var y = 0; y < 8; y++) {
          var w = 12 + y * 2, x = 14 - w / 2;
          g = P.stamp(g, fill(w, 1, 'R'), x, y);
        }
        g = P.stamp(g, box(26, 16, 'S', 'K'), 1, 8);
        g = P.stamp(g, fill(28, 1, 'K'), 0, 7);
        // the doorway, dark so it reads as an opening
        g = P.stamp(g, box(12, 13, 'K', 'K'), 8, 11);
        return g;
      })()
    },
    shelf: {
      /* Two boards on brackets with a few things on them. What makes it
         read as a shelf rather than a ladder is that the boards run past
         the brackets on both sides. */
      label: '선반', at: [6, 6],
      art: (function () {
        var g = fill(24, 22, '.');
        [0, 11].forEach(function (y) {
          g = P.stamp(g, fill(24, 2, 'S'), 0, y + 6);
          g = P.stamp(g, fill(24, 1, 'K'), 0, y + 8);
          g = P.stamp(g, fill(2, 4, 'S'), 3, y + 9);      // brackets under
          g = P.stamp(g, fill(2, 4, 'S'), 19, y + 9);
        });
        // things on the boards
        g = P.stamp(g, box(4, 6, 'R', 'K'), 3, 0);        // a book
        g = P.stamp(g, box(3, 6, 'C', 'K'), 7, 0);
        g = P.stamp(g, box(4, 5, 'G', 'K'), 15, 1);       // a pot
        g = P.stamp(g, box(6, 4, 'Y', 'K'), 5, 13);       // a box
        g = P.stamp(g, ['.KK.', 'KWWK', 'KWWK', '.KK.'], 15, 13);   // a ball
        return g;
      })()
    },
    wall9: {
      /* Nine little frames for nine little animals. Reward for meeting them
         all, and the only thing here that says how many there are. */
      label: '사진 벽', at: [4, 4],
      art: (function () {
        var g = fill(28, 20, '.');
        var tint = ['R', 'Y', 'C', 'G', 'P', 'S', 'R', 'C', 'Y'];
        for (var i = 0; i < 9; i++) {
          var cx = (i % 3) * 10, cy = Math.floor(i / 3) * 7;
          g = P.stamp(g, box(8, 6, 'W', 'S'), cx, cy);
          g = P.stamp(g, fill(4, 2, tint[i]), cx + 2, cy + 2);
        }
        return g;
      })()
    },
    window: {
      label: '창문', at: [8, 3],
      art: (function () {
        var g = box(20, 18, 'C', 'S');
        g = P.stamp(g, fill(18, 1, 'S'), 1, 8);      // sash
        g = P.stamp(g, fill(1, 16, 'S'), 10, 1);
        g = P.stamp(g, ['.HH.', 'HHHH', '.HH.'], 3, 3);   // a cloud outside
        g = P.stamp(g, ['YY', 'YY'], 14, 3);              // and the sun
        return g;
      })()
    }
  };

  /* ---------- floor: the ground ---------- */
  var FLOOR = {
    cushion: {
      // Wider than the pet, or its feet hide the whole thing.
      label: '방석', at: [28, 38],
      art: (function () {
        var g = P.outline(P.blob([26, 34, 38, 40, 40, 38, 34, 26]));
        g = g.map(function (r) {
          return r.split('').map(function (c) {
            return c === 'O' ? 'K' : (c === 'F' ? 'R' : '.');
          }).join('');
        });
        g = P.stamp(g, fill(30, 1, 'P'), 5, 2);       // a seam across it
        return g;
      })()
    },
    carpet: {
      /* For a legend. Full width like the tiles, but unmistakably laid
         down for somebody: deep red with a gold runner. */
      label: '레드카펫', at: [0, 45],
      art: (function () {
        var g = fill(96, 8, 'R');
        g = P.stamp(g, fill(96, 1, 'K'), 0, 0);
        g = P.stamp(g, fill(96, 1, 'Y'), 0, 2);
        g = P.stamp(g, fill(96, 1, 'Y'), 0, 6);
        for (var x = 2; x < 94; x += 8) g = P.stamp(g, ['y'], x, 4);
        return g;
      })()
    },
    tiles: {
      label: '타일 바닥', at: [0, 45],
      art: (function () {
        var g = fill(96, 8, 'A');
        for (var x = 0; x < 96; x += 8) g = P.stamp(g, fill(1, 8, 'W'), x, 0);
        g = P.stamp(g, fill(96, 1, 'W'), 0, 4);
        g = P.stamp(g, fill(96, 1, 'K'), 0, 0);       // the line it stands on
        return g;
      })()
    },
    grass: {
      /* Outdoors, for the pet that walks. Tufts along the top edge are
         what separate it from a plain green rug. */
      label: '잔디 바닥', at: [0, 45],
      art: (function () {
        var g = fill(96, 8, 'G');
        g = P.stamp(g, fill(96, 1, 'g'), 0, 0);
        for (var x = 1; x < 95; x += 5) {
          g = P.stamp(g, ['g'], x, 1);              // blades poking up
          g = P.stamp(g, ['g'], x + 2, 2);
        }
        for (var d = 3; d < 93; d += 11) g = P.stamp(g, ['Y'], d, 5);   // little flowers
        return g;
      })()
    },
    rug: {
      /* Three floors have to stay apart at a glance: grass is green, the
         red carpet is red, so the rug is blue. It was green (a shade off
         the grass), then red (a shade off the carpet) — third time. */
      label: '러그', at: [8, 43],
      art: (function () {
        var g = box(80, 7, 'C', 'K');
        g = P.stamp(g, fill(76, 1, 'W'), 2, 2);        // woven border
        g = P.stamp(g, fill(76, 1, 'W'), 2, 4);
        for (var x = 4; x < 78; x += 6) g = P.stamp(g, ['K'], x, 3);
        // fringe at both ends, the thing that says rug and not floor
        for (var f = 1; f < 6; f += 2) { g = P.stamp(g, ['K'], f, 6); g = P.stamp(g, ['K'], 79 - f, 6); }
        return g;
      })()
    }
  };

  /* ---------- sides: things on the ground beside it ---------- */
  var SIDE = {
    bowl: {
      label: '밥그릇',
      // Tapered, so it reads as a bowl rather than a box.
      art: ['....YYYYYY....',
            '..YYYYYYYYYY..',
            'KKKKKKKKKKKKKK',
            'KWWWWWWWWWWWWK',
            '.KWWWWWWWWWWK.',
            '..KWWWWWWWWK..',
            '...KKKKKKKK...']
    },
    bone: {
      label: '뼈다귀',
      art: ['.KK......KK.',
            'KWWK....KWWK',
            'KWWWKKKKWWWK',
            'KWWWWWWWWWWK',
            'KWWWKKKKWWWK',
            'KWWK....KWWK',
            '.KK......KK.']
    },
    trophy: {
      /* A cup with two handles. The handles are what stop it reading as a
         goblet or a lamp. */
      label: '트로피',
      art: ['.KKKKKK.',
            'KYYYYYYK',
            'KYyyyyYK',
            'KYyyyyYK',
            'KKYYYYKK',
            '.KYYYYK.',
            '..KYYK..',
            '..KYYK..',
            '.KKYYKK.',
            'KYYYYYYK',
            'KKKKKKKK']
    },
    jar: {
      /* Treats in a jar: a lid, a body, and lumps you can see through it. */
      label: '간식 통',
      art: ['.KKKKKK.',
            'KSSSSSSK',
            'KKKKKKKK',
            'KWyyyyWK',
            'KWySSyWK',
            'KWSSySWK',
            'KWySSyWK',
            'KWyyyyWK',
            'KKKKKKKK']
    },
    water: {
      /* The food bowl's twin. Blue instead of yellow, and a lighter line
         across the top so it reads as a surface, not a solid. */
      label: '물그릇',
      art: ['..............',
            '..CCCCCCCCCC..',
            'KKKKKKKKKKKKKK',
            'KWWCCCCCCCCWWK',
            '.KWWWWWWWWWWK.',
            '..KWWWWWWWWK..',
            '...KKKKKKKK...']
    },
    plush: {
      /* A small sitting toy — two ears, two eyes, and a belly. Deliberately
         cruder than the pet so it reads as a doll of one. */
      label: '인형',
      art: ['.KK....KK.',
            'KSSK..KSSK',
            'KSSSKKSSSK',
            'KSSSSSSSSK',
            'KSKSSSSKSK',
            'KSSSSSSSSK',
            '.KSWWWWSK.',
            '.KSWWWWSK.',
            '.KSSSSSSK.',
            '..KKKKKK..']
    },
    disc: {
      /* Lying flat, so it is drawn as an ellipse rather than a circle. */
      label: '원반',
      art: ['..KKKKKK..',
            '.KCCCCCCK.',
            'KCCWWWWCCK',
            'KCWWCCWWCK',
            'KCCWWWWCCK',
            '.KCCCCCCK.',
            '..KKKKKK..']
    },
    bucket: {
      /* Tapered, with a handle arching over — a straight-sided box with a
         bar on top looked like a toaster. */
      label: '양동이',
      art: ['..KKKKKK..',
            '.K......K.',
            'K..KKKK..K',
            'KKKAAAAKKK',
            'KAAAAAAAAK',
            'KAAWWWWAAK',
            '.KAAAAAAK.',
            '.KAAAAAAK.',
            '..KAAAAK..',
            '..KKKKKK..']
    },
    speaker: {
      /* Two cones and a little grille: the big-over-small pairing is what
         makes it a speaker and not a filing cabinet. */
      label: '스피커',
      art: ['KKKKKKKK',
            'KAAAAAAK',
            'KAKKKKAK',
            'KAKWWKAK',
            'KAKKKKAK',
            'KAAAAAAK',
            'KAKKKKAK',
            'KAKWWKAK',
            'KAKKKKAK',
            'KKKKKKKK']
    },
    plant: {
      label: '화분',
      art: (function () {
        var g = fill(14, 18, '.');
        g = P.stamp(g, ['..GG..', '.GGGG.', 'GGgGGG', '.GGGG.'], 4, 0);
        g = P.stamp(g, ['.GG.', 'GGGG', '.GG.'], 1, 3);
        g = P.stamp(g, ['.GG.', 'GGGG', '.GG.'], 9, 4);
        g = P.stamp(g, fill(2, 5, 'S'), 6, 6);        // stem
        g = P.stamp(g, box(12, 7, 'R', 'K'), 1, 11);  // pot
        g = P.stamp(g, fill(12, 1, 'K'), 1, 13);
        return g;
      })()
    },
    ball: {
      label: '공',
      art: ['..KKKK..',
            '.KWWWWK.',
            'KWWKKWWK',
            'KWKKKKWK',
            'KWKKKKWK',
            'KWWKKWWK',
            '.KWWWWK.',
            '..KKKK..']
    }
  };

  root.ROOM = {
    W: ROOM_W,
    left: LEFT,
    floorY: FLOOR_Y,
    slots: ['back', 'floor', 'left', 'right'],
    labels: { back: '배경', floor: '바닥', left: '왼쪽', right: '오른쪽' },
    items: { back: BACK, floor: FLOOR, left: SIDE, right: SIDE },

    /* Sides share one pool but sit at opposite ends of the room. */
    sideAt: function (which, art) {
      var w = Math.max.apply(null, art.map(function (r) { return r.length; }));
      var h = art.length;
      var y = FLOOR_Y - h + 1;            // resting on the line, not hovering
      return which === 'left'
        ? [LEFT + 2, y]
        : [LEFT + ROOM_W - w - 2, y];
    },

    /* Everything chosen, as one blob of SVG, drawn behind the pet. */
    markup: function (choice) {
      choice = choice || {};
      // Something to stand on. Without it the bowl and the bone hang in
      // mid-air whenever no floor is chosen.
      var out = P.encode([new Array(ROOM_W + 1).join('A')], LEFT, FLOOR_Y + 1);
      ['back', 'floor'].forEach(function (slot) {
        var item = ROOM_ITEMS(slot)[choice[slot]];
        if (!item) return;
        out += P.encode(item.art, LEFT + item.at[0], item.at[1]);
      });
      ['left', 'right'].forEach(function (slot) {
        var item = SIDE[choice[slot]];
        if (!item) return;
        var at = root.ROOM.sideAt(slot, item.art);
        out += P.encode(item.art, at[0], at[1]);
      });
      return '<g shape-rendering="crispEdges" stroke="none">' + out + '</g>';
    }
  };

  function ROOM_ITEMS(slot) { return slot === 'back' ? BACK : FLOOR; }
})(window);
