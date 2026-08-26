/* ------------------------------------------------------------------
 * pixel.js — dot-map → SVG compiler.
 *
 * Sprites are authored as arrays of strings, one character per dot.
 * A dot is DOT view-box units square; the 48x48 art grid therefore
 * occupies 240x240 view-box units.
 *
 * Runs of the same character on a row collapse into one <rect>, which
 * keeps a full pet around 200-300 nodes instead of ~1600.
 *
 * Palette characters map to the same CSS custom properties the vector
 * pets used, so the six fur colours per species still work:
 *
 *   .  transparent      O  outline (--line)
 *   F  fur (--fur)      D  fur shadow (--fur-dk)   L  fur light (--fur-lt)
 *   B  belly (--belly)  b  belly shadow (--belly-dk)
 *   N  nose/pupil (--nose)
 *
 * Fixed colours (never re-tinted): W eye white, H highlight, P pink,
 * Y/y yuzu, G/g leaf, S stem, C tear, K black, R red, A grey.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var DOT = 5;   // view-box units per dot — 48 dots across = 240 units

  var PALETTE = {
    'O': 'var(--line)',
    'F': 'var(--fur)',
    'D': 'var(--fur-dk)',
    'L': 'var(--fur-lt)',
    'B': 'var(--belly)',
    'b': 'var(--belly-dk)',
    'N': 'var(--nose)',
    'W': '#FFFDF7',
    'H': '#FFFFFF',
    'P': '#E8907F',
    'p': '#F6C3BB',
    'Y': '#E8B02A',
    'y': '#F7D97C',
    'G': '#3F8A6A',
    'g': '#6FBF95',
    'S': '#7A5416',
    'C': '#79B4E0',
    'K': '#2B2622',
    'R': '#C9492F',
    'A': '#9A968E'
  };

  function width(rows) {
    var w = 0;
    for (var i = 0; i < rows.length; i++) if (rows[i].length > w) w = rows[i].length;
    return w;
  }

  /* rows -> <rect> soup, offset by (ox, oy) in dots */
  function encode(rows, ox, oy) {
    var out = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var x = 0;
      while (x < row.length) {
        var c = row.charAt(x);
        if (!PALETTE[c]) { x++; continue; }
        var start = x;
        while (x < row.length && row.charAt(x) === c) x++;
        out.push(
          '<rect x="' + ((ox + start) * DOT) + '" y="' + ((oy + r) * DOT) +
          '" width="' + ((x - start) * DOT) + '" height="' + DOT +
          '" fill="' + PALETTE[c] + '"/>'
        );
      }
    }
    return out.join('');
  }

  /* a rig part: <g id="armL"> … </g>. Missing parts render as an empty
     group so the CSS rig never targets a node that does not exist. */
  function part(id, p, extra) {
    var inner = (p && p.rows) ? encode(p.rows, p.x, p.y) : '';
    return '<g id="' + id + '">' + inner + (extra || '') + '</g>';
  }

  /* transform-origin for a part, in view-box px.
     `pivot` is in dots relative to the part's own top-left; it defaults
     to the centre, which is what body/head/eyes want. Limbs override it
     with their attachment point so they swing instead of spinning. */
  function origin(p) {
    if (!p || !p.rows) return '100px 100px';
    var pv = p.pivot || [width(p.rows) / 2, p.rows.length / 2];
    return ((p.x + pv[0]) * DOT) + 'px ' + ((p.y + pv[1]) * DOT) + 'px';
  }

  function rep(ch, n) { return new Array(n + 1).join(ch); }

  /* ---------- silhouette construction ----------
     Typing rounded shapes by hand is what made the first pass look
     chiselled: the corners came out in three- and four-dot steps. So
     shapes are declared as a per-row width profile instead, and the
     outline and shading fall out of the geometry. */

  function blob(widths) {
    var w = 0;
    widths.forEach(function (f) { if (f > w) w = f; });
    return widths.map(function (fw) {
      var pad = (w - fw) / 2;
      return rep('.', pad) + rep('F', fw) + rep('.', pad);
    });
  }

  /* every filled dot touching empty space becomes the 1-dot outline */
  function outline(rows) {
    var h = rows.length, w = rows[0].length;
    function at(x, y) {
      return (y < 0 || y >= h || x < 0 || x >= w) ? '.' : rows[y].charAt(x);
    }
    return rows.map(function (row, y) {
      return row.split('').map(function (c, x) {
        if (c !== 'F') return c;
        return (at(x - 1, y) === '.' || at(x + 1, y) === '.' ||
                at(x, y - 1) === '.' || at(x, y + 1) === '.') ? 'O' : 'F';
      }).join('');
    });
  }

  /* light from the upper left: a lit cap on top, a shaded floor and a
     shaded right flank. Ramps, not a single hard column. */
  function shade(rows, opt) {
    opt = opt || {};
    var top = opt.top === undefined ? 2 : opt.top;
    var bottom = opt.bottom === undefined ? 2 : opt.bottom;
    var right = opt.right === undefined ? 2 : opt.right;
    var h = rows.length;

    return rows.map(function (row, y) {
      var cells = row.split('');
      var a = cells.indexOf('F');
      if (a < 0) return row;
      var b = cells.lastIndexOf('F');

      for (var x = a; x <= b; x++) {
        if (cells[x] !== 'F') continue;
        if (y < top) cells[x] = 'L';
        else if (y >= h - bottom) cells[x] = 'D';
        else if (x > b - right) cells[x] = 'D';
      }
      return cells.join('');
    });
  }

  function shaped(widths, opt) { return shade(outline(blob(widths)), opt); }

  /* Like blob(), but each row slides sideways by `drift` dots so the
     shape leans. Straight profiles gave tails that stacked into a bar
     right on top of the arm; a leaning one springs clear of it. */
  function arc(widths, drift) {
    var offs = widths.map(function (_, i) { return Math.round(i * drift); });
    var min = Math.min.apply(null, offs);
    var span = 0;
    widths.forEach(function (w, i) { span = Math.max(span, w + offs[i] - min); });
    return widths.map(function (w, i) {
      var left = offs[i] - min;
      return rep('.', left) + rep('F', w) + rep('.', span - left - w);
    });
  }

  function arced(widths, drift, opt) { return shade(outline(arc(widths, drift)), opt); }

  /* ---------- curly coats ----------
     A poodle read as a smooth blob until the edge broke up. `fluffy`
     pulls alternate rows in by a dot so the silhouette scallops, and
     `fleece` lays short dashes through the interior in a brick pattern
     so the coat reads as curl rather than paint. Caps stay smooth —
     scalloping the crown just makes the head look bitten. */
  function fluffy(profile, cap) {
    cap = cap === undefined ? 3 : cap;
    var n = profile.length;
    return profile.map(function (w, i) {
      if (i < cap || i > n - 1 - cap) return w;
      return (i % 3 === 1) ? Math.max(2, w - 2) : w;   // every third row, not every other
    });
  }

  function fleece(rows, opt) {
    opt = opt || {};
    var period = opt.period || 6;
    var offset = opt.offset || 0;
    /* Marks go on every other row only, and each marked row is shifted
       so they never stack into vertical stripes — the first attempt at
       this came out looking like corduroy. Highlights alone; a shadow
       pass as well just muddied the coat. */
    return rows.map(function (row, y) {
      if (y % 2 !== 0) return row;
      var shift = (((y / 2) % 2) * 3 + offset) % period;
      var cells = row.split('');
      for (var x = 0; x < cells.length - 1; x++) {
        if (cells[x] !== 'F' || cells[x + 1] !== 'F') continue;
        if ((x + shift) % period !== 0) continue;
        cells[x] = 'L'; cells[x + 1] = 'L';
        x++;
      }
      return cells.join('');
    });
  }

  /* ---------- drawing primitives ----------
     Accessories are frames and bars, not blobs. Typing a spectacle rim
     by hand puts a dot one column off every time; these do not. */
  function blank(w, h) {
    var rows = [];
    for (var y = 0; y < h; y++) rows.push(rep('.', w));
    return rows;
  }

  function box(rows, x, y, w, h, edge, fill) {
    var out = rows.map(function (r) { return r.split(''); });
    for (var yy = 0; yy < h; yy++) {
      for (var xx = 0; xx < w; xx++) {
        var onEdge = (yy === 0 || yy === h - 1 || xx === 0 || xx === w - 1);
        var c = onEdge ? edge : fill;
        if (!c) continue;
        var ty = y + yy, tx = x + xx;
        if (ty >= 0 && ty < out.length && tx >= 0 && tx < out[ty].length) out[ty][tx] = c;
      }
    }
    return out.map(function (r) { return r.join(''); });
  }

  function hline(rows, x, y, w, ch) { return box(rows, x, y, w, 1, ch, ch); }
  function vline(rows, x, y, h, ch) { return box(rows, x, y, 1, h, ch, ch); }
  function dot(rows, x, y, ch)      { return box(rows, x, y, 1, 1, ch, ch); }

  /* paint `art` over `rows` at (x, y); '.' in art leaves the base alone */
  function stamp(rows, art, x, y) {
    var out = rows.map(function (r) { return r.split(''); });
    art.forEach(function (line, r) {
      var ty = y + r;
      if (ty < 0 || ty >= out.length) return;
      line.split('').forEach(function (c, i) {
        var tx = x + i;
        if (c === '.' || tx < 0 || tx >= out[ty].length) return;
        out[ty][tx] = c;
      });
    });
    return out.map(function (r) { return r.join(''); });
  }

  /* ---------- eyes ----------
     Built rather than hand-drawn so every species blinks identically.
     Four sub-groups swap by display, never by scaling — scaling a dot
     grid is exactly what makes pixel art go soft. */
  /* A solid dark eye with the corners knocked off, plus one white
     glint. Sclera-and-pupil reads as a cheap cartoon at this size;
     the glint alone carries both the life and the gaze, because it
     lives in the `.pupil` group and so shifts with the cursor. */
  function eyeShape(w, h) {
    var rows = [];
    for (var y = 0; y < h; y++) {
      var inset = (y === 0 || y === h - 1) ? 1 : 0;
      rows.push(rep('.', inset) + rep('N', w - 2 * inset) + rep('.', inset));
    }
    return rows;
  }

  function eyeGroup(id, pos, cfg) {
    var w = cfg.size[0], h = cfg.size[1];
    var open = cfg.art || eyeShape(w, h);
    var glintAt = cfg.glint || [1, 1];

    var lid = [];
    for (var i = 0; i < Math.max(1, h - 2); i++) lid.push(rep('.', 0) + rep('D', w));

    var shut = [rep('N', w)];

    return '<g id="' + id + '">' +
      '<g class="eye-open">' +
        encode(open, pos[0], pos[1]) +
        '<g class="pupil">' + encode(['H'], pos[0] + glintAt[0], pos[1] + glintAt[1]) + '</g>' +
      '</g>' +
      '<g class="eye-lid">' + encode(lid, pos[0], pos[1]) + '</g>' +
      '<g class="eye-shut">' + encode(shut, pos[0], pos[1] + Math.floor(h / 2)) + '</g>' +
      '<g class="glint-2">' + encode(['H'], pos[0] + w - 2, pos[1] + h - 2) + '</g>' +
      '</g>';
  }

  function eyeOrigin(pos, cfg) {
    return ((pos[0] + cfg.size[0] / 2) * DOT) + 'px ' + ((pos[1] + cfg.size[1] / 2) * DOT) + 'px';
  }

  /* ---------- shared decorations ---------- */
  var PROP_ART = {
    yuzu: ['...SS...', '..GSSG..', '.GGSSGG.', '.OYYYYO.', 'OYyyYYYO', 'OYyYYYYO', 'OYYYYYYO', '.OYYYYO.', '..OOOO..'],
    leaf: ['.....GG.', '...GGGG.', '..GGGGG.', '.GGgGGG.', '.GGGGG..', 'SGGGG...', 'SG......', 'S.......'],
    star: ['...YY...', '...YY...', 'YYYYYYYY', '.YYYYYY.', '..YYYY..', '.YY..YY.', '.Y....Y.', '........']
  };

  var TEAR_ART = ['.C.', 'CCC', 'CCC', '.C.'];

  /* One group per accessory slot; every item is emitted and the renderer
     shows the chosen one. Cheaper than rebuilding the sprite on a change,
     and it keeps the swap instant. The head slot keeps the id `prop` so
     the existing gaze-parallax CSS still finds it. */
  /* Stretch a garment sideways by repeating its middle column. Clothes
     are drawn for one body width; a heavier pet needs the same garment,
     wider, or it sits inside the belly like a bug. Bands and stripes
     survive this because the column that repeats is the plain one in the
     middle. */
  function widen(art, extra) {
    if (!extra) return art;
    return art.map(function (row) {
      if (extra > 0) {
        var mid = Math.floor(row.length / 2);
        return row.slice(0, mid) + row.charAt(mid).repeat(extra) + row.slice(mid);
      }
      var take = Math.min(-extra, Math.max(0, row.length - 2));
      var m = Math.floor((row.length - take) / 2);
      return row.slice(0, m) + row.slice(m + take);
    });
  }

  function slotGroup(kind, off, fat) {
    var items = (root.GEAR && root.GEAR.items[kind]) || {};
    var id = (kind === 'head') ? 'prop' : ('slot-' + kind);
    var html = '<g id="' + id + '">';
    var shift = Math.round((fat || 0) / 2);
    Object.keys(items).forEach(function (key) {
      var it = items[key];
      html += '<g data-gear="' + key + '" style="display:none">' +
              encode(widen(it.art, fat || 0), it.at[0] + off[0] - shift, it.at[1] + off[1]) +
              '</g>';
    });
    return html + '</g>';
  }

  function tearGroup(at) {
    return '<g id="tear">' + encode(TEAR_ART, at[0], at[1]) + '</g>';
  }

  /* ---------- assembly ----------
     Z-order is fixed for every species so the rig ids always mean the
     same thing: tail sits behind the body, the head sits above it. */
  function build(sp) {
    var p = sp.parts;
    var eyes = sp.eyes;
    var offsets = sp.gearOffset || {};
    function off(kind) { return offsets[kind] || [0, 0]; }

    var html =
      '<g shape-rendering="crispEdges" stroke="none">' +
        '<g id="bodyBreathe">' +
          part('tail', p.tail) +
          part('pawL', p.pawL) +
          part('pawR', p.pawR) +
          part('armL', p.armL) +
          part('armR', p.armR, slotGroup('hand', off('hand'))) +
          (p.body ? encode(p.body.rows, p.body.x, p.body.y) : '') +
          (p.bodyMark ? encode(p.bodyMark.rows, p.bodyMark.x, p.bodyMark.y) : '') +
          slotGroup('body', off('body'), sp.gearFat || 0) +
        '</g>' +
        '<g id="headGaze"><g id="headAnim">' +
          (p.headBack ? encode(p.headBack.rows, p.headBack.x, p.headBack.y) : '') +
          // ears normally sit in front of the head so floppy ones hang over
          // the cheeks; `earsBehind` tucks them under instead, which is what
          // a coat the same colour as the face needs to read as one mass
          (sp.earsBehind ? part('earL', p.earL) + part('earR', p.earR) : '') +
          (p.head ? encode(p.head.rows, p.head.x, p.head.y) : '') +
          (sp.earsBehind ? '' : part('earL', p.earL) + part('earR', p.earR)) +
          (p.face ? encode(p.face.rows, p.face.x, p.face.y) : '') +
          eyeGroup('eyeL', eyes.l, eyes) +
          eyeGroup('eyeR', eyes.r, eyes) +
          slotGroup('eyes', off('eyes')) +
          tearGroup(sp.tearAt || [eyes.l[0], eyes.l[1] + eyes.size[1]]) +
          slotGroup('head', off('head')) +
        '</g></g>' +
      '</g>';

    return html;
  }

  function origins(sp) {
    var p = sp.parts;
    var o = {
      body: origin(p.body),
      head: origin(p.head),
      armL: origin(p.armL), armR: origin(p.armR),
      pawL: origin(p.pawL), pawR: origin(p.pawR),
      earL: origin(p.earL), earR: origin(p.earR),
      tail: origin(p.tail),
      eyeL: eyeOrigin(sp.eyes.l, sp.eyes),
      eyeR: eyeOrigin(sp.eyes.r, sp.eyes),
      prop: (((sp.propAt || [20, -2])[0] + 4) * DOT) + 'px ' + (((sp.propAt || [20, -2])[1] + 8) * DOT) + 'px'
    };
    return o;
  }

  /* A lying pose can't be reached by transforming the standing sprite:
     these are front-on drawings, so no 2D rotation turns the belly to the
     floor, and scale() is off the table because it softens the dots. So a
     species may ship a second, purpose-drawn sprite for sleep. */
  function buildSleep(sp) {
    if (!sp.sleep || !sp.sleep.rows) return null;
    return '<g shape-rendering="crispEdges" stroke="none">' +
             '<g id="sleepBody">' +
               encode(sp.sleep.rows, sp.sleep.x || 0, sp.sleep.y || 0) +
             '</g>' +
           '</g>';
  }

  root.PIXEL = {
    buildSleep: buildSleep,
    DOT: DOT,
    PALETTE: PALETTE,
    encode: encode,
    build: build,
    origins: origins,
    rep: rep,
    blob: blob,
    blank: blank,
    box: box,
    hline: hline,
    vline: vline,
    dot: dot,
    outline: outline,
    shade: shade,
    shaped: shaped,
    widen: widen,
    arc: arc,
    arced: arced,
    stamp: stamp,
    fluffy: fluffy,
    fleece: fleece
  };
})(window);
