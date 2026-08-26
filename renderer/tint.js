/* ------------------------------------------------------------------
 * tint.js — the fur colours a sprite is painted with.
 *
 * Every palette character in pixel.js resolves to a CSS custom property,
 * so painting a pet is a matter of setting seven variables. Both the pet
 * window and the care window need the same seven, which is why this is
 * its own file rather than a copy in each.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  function parse(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [176, 128, 82];
  }

  function toHex(c) {
    return '#' + c.map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return ('0' + v.toString(16)).slice(-2);
    }).join('');
  }

  function mix(hex, target, t) {
    var a = parse(hex), b = parse(target);
    return toHex([0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }));
  }

  /* Shading depth is per species: the default ramp turns a white coat
     grey, so a pale pet asks for a shallower one. */
  var TONE = { lt: 0.20, dk: 0.22, bellyDk: 0.14, nose: 0.74, line: 0.82 };

  function vars(pet, sp) {
    var fur = (pet && pet.fur) || (sp && sp.fur) || '#B98052';
    var belly = (pet && pet.belly) || (sp && sp.belly) || '#EBD3A9';
    var t = (sp && sp.tone) || {};
    function f(k) { return t[k] === undefined ? TONE[k] : t[k]; }
    return {
      '--fur': fur,
      '--fur-lt': mix(fur, '#ffffff', f('lt')),
      '--fur-dk': mix(fur, '#000000', f('dk')),
      '--belly': belly,
      '--belly-dk': mix(belly, '#000000', f('bellyDk')),
      '--nose': mix(fur, '#241A14', f('nose')),
      '--line': mix(fur, '#231A14', f('line'))
    };
  }

  /* the same thing as a style="" string, for markup built by hand */
  function css(pet, sp) {
    var v = vars(pet, sp);
    return Object.keys(v).map(function (k) { return k + ':' + v[k]; }).join(';');
  }

  root.TINT = { mix: mix, vars: vars, css: css };
})(window);
