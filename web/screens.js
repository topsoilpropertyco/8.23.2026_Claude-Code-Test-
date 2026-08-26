// The eight screens, rendered from data in the browser.
//
// A direct port of bin/build-screens.py, kept deliberately parallel to it: same
// variable names, same order, same arithmetic, same markup. That is not elegance,
// it is so the two can be diffed by a human and by a test. test/screens.test.js
// renders every screen both ways for a set of nights and compares the output, so
// a divergence is a failing assertion rather than something noticed weeks later
// in a screenshot.
//
// Why this exists at all: the Python is a static site generator. It reads one
// night and writes HTML with the numbers already substituted into the strings, so
// a screen is a photograph of one morning. Seth asked why picking a date could
// not just re-render them, and the honest answer was that nothing was in the way
// except this file not existing.
//
// Written as a plain script rather than a module: it is inlined into the
// published page, which is one self-contained HTML file.

/* eslint-disable no-unused-vars */
var SleepOSScreens = (function () {
  'use strict';

  var W = 390, H = 844;

  var GROUND = '#F4F0E6', RAISED = '#E9E3D4', INK = '#1A1814', QUIET = '#7C7568', RULE = '#D5CDBC';
  var NAT_GROUND = '#E9EEF3', NAT_RULE = '#C2CDD8';
  var OWN_RAIL = '#8A6D3B', NAT_RAIL = '#2C5F86';
  var OWN_RAIL_BG = '#EFE6D2', NAT_RAIL_BG = '#D6E2EE';
  var ACCENT = '#1F4B8F';
  var BAD_L = '#EFD3CC', BAD = '#B23A2F';
  var OK_L = '#EFE3C4', OK = '#96761C';
  var GOOD_L = '#D2E3CC', GOOD = '#2F7A44';

  /* ------------------------------------------------------- number formatting */

  // Python's f-string forms, matched exactly. Getting these wrong is the most
  // likely way for the port to drift without anyone noticing, because the
  // difference is one character in a number that still looks right.
  // Python formats floats with round-half-to-EVEN. JavaScript's toFixed rounds
  // half AWAY FROM ZERO. They agree on almost everything and disagree on exactly
  // representable halves: 0.125 formats as "0.12" in Python and "0.13" in JS, and
  // a delta of 11.25 prints as +11.2 against +11.3. Rare enough to survive any
  // amount of reading, frequent enough to happen -- and when it happens it is the
  // album and the page disagreeing about a number, which is the one thing this
  // port must not do.
  //
  // Scaling by a power of ten does NOT work, which is the trap here: 2.675 * 100
  // rounds to exactly 267.5 as a double, so a tie is detected where the real
  // value is 2.67499999999999982. Python rounds the true decimal expansion of
  // the double, so that is what this does -- toPrecision(21) exposes it, and the
  // rounding is then done on the digits.
  function fx(v, n) {                                                // {v:.2f}
    var x = Number(v);
    if (!Number.isFinite(x)) return String(x);

    // Preserve the sign of negative zero: Python prints -0.04 as "-0.0".
    var neg = x < 0 || Object.is(x, -0);
    var mag = Math.abs(x);

    var exact = mag.toPrecision(21);
    if (exact.indexOf('e') !== -1 || exact.indexOf('E') !== -1) {
      // Outside the range this page ever plots; fall back rather than guess.
      return (neg ? -mag : mag).toFixed(n);
    }

    var dot = exact.indexOf('.');
    var intPart = dot === -1 ? exact : exact.slice(0, dot);
    var frac = dot === -1 ? '' : exact.slice(dot + 1);
    while (frac.length < n + 1) frac += '0';

    var keep = frac.slice(0, n);
    var tail = frac.slice(n);
    var half = '5' + new Array(tail.length).join('0');

    var roundUp;
    if (tail > half) roundUp = true;
    else if (tail < half) roundUp = false;
    else {
      // Exactly half: to even, on the last digit that survives.
      var last = n === 0 ? intPart.charCodeAt(intPart.length - 1) - 48
                         : keep.charCodeAt(n - 1) - 48;
      roundUp = last % 2 === 1;
    }

    var digits = intPart + keep;
    if (roundUp) {
      var carried = (BigInt(digits) + 1n).toString();
      while (carried.length < digits.length) carried = '0' + carried;
      digits = carried;
    }

    var out = n === 0 ? digits
      : (digits.slice(0, digits.length - n) || '0') + '.' + digits.slice(digits.length - n);
    // Strip a leading zero run that the carry may have introduced ("012.34").
    out = out.replace(/^0+(?=\d)/, '');
    return (neg ? '-' : '') + out;
  }
  function g(v) { return String(Number(v)); }                        // {v:g}
  function signed(v, n) {                                            // {v:+.1f}
    var s = fx(v, n === undefined ? 1 : n);
    return s[0] !== '-' && s[0] !== '+' ? '+' + s : s;
  }
  function comma(n) { return Number(n).toLocaleString('en-US'); }     // {n:,}

  function ordinal(v) {
    // Decimals always take 'th'.
    if (Number(v) !== Math.trunc(Number(v))) return 'th';
    var n = Math.abs(Math.trunc(Number(v))) % 100;
    if (n >= 11 && n <= 13) return 'th';
    return ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
  }

  function article(n) {
    var s = String(Math.trunc(Number(n)));
    return (s[0] === '8' || s.indexOf('11') === 0 || s.indexOf('18') === 0) ? 'an' : 'a';
  }

  function dateLabel(iso) {
    if (!iso || iso.length !== 10 || iso[4] !== '-') return iso || 'no date';
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
    // Zeller, so the weekday comes from the date rather than a stored string.
    var mm = m > 2 ? m : m + 12, yy = m > 2 ? y : y - 1;
    var kk = yy % 100, jj = Math.floor(yy / 100);
    var h = (d + Math.floor((13 * (mm + 1)) / 5) + kk + Math.floor(kk / 4)
             + Math.floor(jj / 4) + 5 * jj) % 7;
    var wd = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][h];
    var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
               'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
    return wd + ' ' + d + ' ' + mon + ' ' + y;
  }

  /* ------------------------------------------------------------------- maths */

  function erf(x) {
    // Abramowitz & Stegun 7.1.26, the same approximation src/stats.js uses.
    var s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
      - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
  function invPhi(p) {
    var lo = -6, hi = 6;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (phi(mid) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  var CUT_LO_P = 1 / 3, CUT_HI_P = 2 / 3;

  /* --------------------------------------------------------- the shared shell */

  var CSS = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'html,body{background:#78756F}',
    '.s{position:relative;width:390px;height:844px;overflow:hidden;background:GROUND;color:INK;',
    "  font-family:'Newsreader',Georgia,serif;font-variant-numeric:tabular-nums lining-nums;",
    "  font-feature-settings:'tnum' 1,'lnum' 1;-webkit-font-smoothing:antialiased;",
    '  display:flex;flex-direction:column;padding:30px 24px 26px}',
    ".mono{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}",
    '.hd{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:9px;',
    '  border-bottom:1px solid INK;flex:0 0 auto}',
    '.bd{flex:1;display:flex;flex-direction:column;padding:20px 0 10px;min-height:0}',
    '.grp{flex:0 0 auto}',
    '.grp:nth-child(2){flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}',
    '.hd .brand{font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:600}',
    '.hd .num{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:QUIET}',
    '.q{font-size:23px;line-height:1.25;font-weight:400;letter-spacing:-.01em}',
    '.ans{margin-top:6px;font-size:11.5px;line-height:1.55;color:QUIET;max-width:34ch}',
    '.lab{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:QUIET;font-weight:500}',
    '.hair{height:1px;background:RULE}',
    '.ft{margin-top:auto;padding-top:12px;border-top:1px solid RULE;display:flex;',
    '  justify-content:space-between;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:QUIET}',
    '.note{font-size:9px;line-height:1.5;color:QUIET;letter-spacing:.02em}',
    '.note b{color:INK;font-weight:600}',
    '.pill{display:inline-block;padding:3px 9px 2px;font-size:9px;letter-spacing:.16em;',
    "  text-transform:uppercase;font-weight:600;font-family:'IBM Plex Mono',monospace}",
    '.s.samp .prov{background:#EFD3CC!important;color:#8A2C22!important}',
    ".prov{flex:0 0 auto;margin-top:9px;padding:5px 9px 4px;font-family:'IBM Plex Mono',monospace;",
    '  font-size:8.5px;letter-spacing:.17em;text-transform:uppercase;font-weight:600;',
    '  display:flex;justify-content:space-between;align-items:baseline;gap:8px}',
    '.s.nat{background:#E9EEF3}',
    '.s.nat .hair{background:#C2CDD8}',
    '.s.nat .ft{border-top-color:#C2CDD8}',
    '',
  ].join('\n');

  function paint(css) {
    return css.split('GROUND').join(GROUND).split('INK').join(INK)
      .split('QUIET').join(QUIET).split('RULE').join(RULE);
  }

  // The body is split into three flex groups so the middle one can absorb the
  // slack. Ported verbatim, string surgery included: the seams are where the
  // Python cuts, and changing them changes the vertical rhythm of every screen.
  function group(body) {
    var i = body.indexOf('class="ans"');
    if (i === -1) i = body.indexOf('class="q"');
    var j = body.indexOf('</p>', i) + 4;
    var k = body.lastIndexOf('<div class="hair"');
    if (k === -1) {
      return '<div class="grp">' + body.slice(0, j) + '</div><div class="grp">' + body.slice(j) + '</div>';
    }
    return '<div class="grp">' + body.slice(0, j) + '</div><div class="grp">' + body.slice(j, k)
      + '</div><div class="grp">' + body.slice(k) + '</div>';
  }

  return { W: W, H: H, fx: fx, g: g, signed: signed, comma: comma, ordinal: ordinal,
    article: article, dateLabel: dateLabel, phi: phi, invPhi: invPhi, erf: erf,
    CSS: CSS, paint: paint, group: group,
    colors: { GROUND: GROUND, RAISED: RAISED, INK: INK, QUIET: QUIET, RULE: RULE,
      NAT_GROUND: NAT_GROUND, NAT_RULE: NAT_RULE, OWN_RAIL: OWN_RAIL, NAT_RAIL: NAT_RAIL,
      OWN_RAIL_BG: OWN_RAIL_BG, NAT_RAIL_BG: NAT_RAIL_BG, ACCENT: ACCENT,
      BAD_L: BAD_L, BAD: BAD, OK_L: OK_L, OK: OK, GOOD_L: GOOD_L, GOOD: GOOD },
    CUT_LO_P: CUT_LO_P, CUT_HI_P: CUT_HI_P };
})();

