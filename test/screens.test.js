// The JS screen renderer, checked against the Python it was ported from.
//
// bin/build-screens.py is a static site generator: it reads one night and writes
// HTML with the numbers already substituted into the strings. That is why the
// screens could only ever describe the latest night. web/screens.js is a port of
// it that runs in the browser, so picking a date can re-render them.
//
// A hand port of nine hundred lines is exactly the kind of change that goes
// subtly wrong and stays wrong, because every screen still looks plausible. So
// the two implementations are diffed mechanically rather than by eye, starting
// with the formatters and the statistics -- where a divergence is one character
// in a number that reads correctly either way.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

/**
 * Evaluate the shipped file, rather than importing a module wrapper around it.
 * What the tests exercise is then literally the text that gets inlined into the
 * published page.
 */
function loadScreens() {
  const ctx = { console };
  vm.createContext(ctx);
  new vm.Script(readFileSync('web/screens.js', 'utf8'), { filename: 'web/screens.js' })
    .runInContext(ctx);
  assert.ok(ctx.SleepOSScreens, 'web/screens.js must define SleepOSScreens');
  return ctx.SleepOSScreens;
}

/** Run a snippet against the same helpers the generator uses, and get its stdout. */
function python(snippet) {
  return execFileSync('python3', ['-c', `
import math
def ordinal(v):
    if float(v) != int(v): return 'th'
    n = int(v) % 100
    if 11 <= n <= 13: return 'th'
    return {1:'st',2:'nd',3:'rd'}.get(n % 10, 'th')
def article(n):
    n = int(n)
    return 'an' if str(n)[0] == '8' or str(n).startswith('11') or str(n).startswith('18') else 'a'
def phi(z): return 0.5 * (1 + math.erf(z / math.sqrt(2)))
def inv_phi(p):
    lo, hi = -6.0, 6.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if phi(mid) < p: lo = mid
        else: hi = mid
    return (lo + hi) / 2
${snippet}
`], { encoding: 'utf8' }).trim();
}

const S = loadScreens();

test('the ordinal suffix matches Python for every shape of number', () => {
  const cases = [1, 2, 3, 4, 5, 11, 12, 13, 21, 22, 23, 31, 100, 101, 111, 113, 27.7, 13.1, 0];
  const mine = cases.map((v) => S.g(v) + S.ordinal(v)).join(' ');
  const theirs = python(`print(' '.join(f'{v:g}{ordinal(v)}' for v in [${cases.join(',')}]))`);
  assert.equal(mine, theirs);
});

test('the signed, comma and %g formats match Python', () => {
  const signedCases = [4.7, -4.7, 0, 0.04, -0.04, 11.25, -16];
  assert.equal(
    signedCases.map((v) => S.signed(v)).join(' '),
    python(`print(' '.join(f'{v:+.1f}' for v in [${signedCases.join(',')}]))`),
  );

  const commaCases = [0, 7, 999, 1000, 1042, 1046, 23069];
  assert.equal(
    commaCases.map((v) => S.comma(v)).join(' '),
    python(`print(' '.join(f'{v:,}' for v in [${commaCases.join(',')}]))`),
  );

  // %g is the one that bit already: it drops a trailing zero, so 81.0 prints as
  // "81" and a test looking for "81.0" failed against correct output.
  const gCases = [81.0, 13.1, 68, 79.31, 0.5, 100];
  assert.equal(
    gCases.map((v) => S.g(v)).join(' '),
    python(`print(' '.join(f'{v:g}' for v in [${gCases.join(',')}]))`),
  );

  assert.equal(
    [8, 11, 18, 74, 95, 80, 1].map((n) => S.article(n)).join(' '),
    python(`print(' '.join(article(n) for n in [8,11,18,74,95,80,1]))`),
  );
});

test('the fixed-decimal format matches Python, including rounding at the half', () => {
  // Bar heights and marker positions are placed with .2f. A different rounding
  // rule would move geometry by a fraction of a pixel on every screen -- which
  // is invisible in one screenshot and obvious in a diff.
  const cases = [0.125, 1.005, 2.675, 75.15, 83.45, 146.5, -0.5];
  for (const n of [1, 2]) {
    assert.equal(
      cases.map((v) => S.fx(v, n)).join(' '),
      python(`print(' '.join(f'{v:.${n}f}' for v in [${cases.join(',')}]))`),
      `.${n}f disagrees`,
    );
  }
});

test('the number formats match Python across five hundred values', () => {
  // Six hand-picked cases prove the rule; a sweep proves there is no other rule
  // hiding behind it. Includes every exact half that fits in a double, since
  // those are the only inputs where the two languages disagree at all.
  const cases = [0.125, 11.25, 2.675, 0.5, 1.5, 2.5, -0.5, -1.5, 0.05, 0.15, 0.25,
    0.35, 146.5, 75.15, 83.45, 0, -0.04, 99.995, 1.0049999999999999];
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 500; i++) {
    const dp = [1, 2, 3, 4][Math.floor(rnd() * 4)];
    cases.push(Number(((rnd() * 400) - 200).toFixed(dp)));
  }

  const list = cases.map((v) => (Object.is(v, -0) ? '-0.0' : String(v))).join(',');
  for (const n of [0, 1, 2]) {
    assert.equal(
      cases.map((v) => S.fx(v, n)).join(' '),
      python(`print(' '.join(f'{v:.${n}f}' for v in [${list}]))`),
      `.${n}f diverges somewhere in ${cases.length} values`,
    );
  }
  assert.equal(
    cases.map((v) => S.signed(v)).join(' '),
    python(`print(' '.join(f'{v:+.1f}' for v in [${list}]))`),
    `+.1f diverges somewhere in ${cases.length} values`,
  );
});

test('the normal-curve maths matches Python to four decimals', () => {
  // Every band edge, bar height and SD marker comes out of these two.
  const zs = [-3, -2, -1.65, -1, -0.4307, 0, 0.4307, 1, 1.65, 2, 3];
  assert.equal(
    zs.map((z) => S.phi(z).toFixed(4)).join(' '),
    python(`print(' '.join(f'{phi(z):.4f}' for z in [${zs.join(',')}]))`),
  );

  const ps = [1 / 3, 2 / 3, 0.05, 0.5, 0.95, 0.977];
  assert.equal(
    ps.map((p) => S.invPhi(p).toFixed(4)).join(' '),
    python(`print(' '.join(f'{inv_phi(p):.4f}' for p in [${ps.map((p) => p.toFixed(6)).join(',')}]))`),
  );

  // The band cuts, which decide whether a night reads as bad, decent or good.
  const MEAN = 79.31, SD = 9.54;
  const lo = MEAN + S.invPhi(S.CUT_LO_P) * SD;
  const hi = MEAN + S.invPhi(S.CUT_HI_P) * SD;
  assert.equal(
    `${lo.toFixed(1)} ${hi.toFixed(1)}`,
    python(`print(f'{${MEAN} + inv_phi(1/3) * ${SD}:.1f}', f'{${MEAN} + inv_phi(2/3) * ${SD}:.1f}')`),
  );
});

test('the weekday comes from the date, matching Python\'s Zeller', () => {
  const dates = ['2026-08-26', '2026-01-01', '2024-02-29', '2023-10-15', '2026-12-31', '2025-03-01'];
  const mine = dates.map((d) => S.dateLabel(d)).join(' | ');
  const theirs = python(`
def _date_label(iso):
    if not iso or len(iso) != 10 or iso[4] != '-':
        return iso or 'no date'
    y, m, d = int(iso[0:4]), int(iso[5:7]), int(iso[8:10])
    mm, yy = (m, y) if m > 2 else (m + 12, y - 1)
    kk, jj = yy % 100, yy // 100
    h = (d + (13 * (mm + 1)) // 5 + kk + kk // 4 + jj // 4 + 5 * jj) % 7
    wd = ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'][h]
    mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]
    return f'{wd} {d} {mon} {y}'
print(' | '.join(_date_label(d) for d in [${dates.map((d) => `'${d}'`).join(',')}]))`);
  assert.equal(mine, theirs);

  // A malformed date must not throw or invent a weekday.
  assert.equal(S.dateLabel(''), 'no date');
  assert.equal(S.dateLabel('2026/08/26'), '2026/08/26');
});

test('the shared stylesheet is the Python one, token for token', () => {
  // The screens are only identical to the album if the CSS is. Compared after
  // colour substitution, which is where a typo would hide.
  const py = readFileSync('bin/build-screens.py', 'utf8');
  const block = py.slice(py.indexOf('CSS = """') + 'CSS = """'.length, py.indexOf('"""\nCSS = CSS.replace'));
  const theirs = block
    .split('GROUND').join('#F4F0E6').split('INK').join('#1A1814')
    .split('QUIET').join('#7C7568').split('RULE').join('#D5CDBC');
  const mine = S.paint(S.CSS);
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  assert.equal(norm(mine), norm(theirs),
    'the ported stylesheet has drifted from the generator');
});

test('the three-group body split is the Python one', () => {
  // The seams decide the vertical rhythm of every screen. Ported as string
  // surgery precisely because that is what the original does.
  const body = '<p class="q">Q?</p>\n<p class="ans">A.</p>\n<div>middle</div>\n<div class="hair"></div>\n<p>foot</p>';
  const out = S.group(body);
  assert.equal((out.match(/<div class="grp">/g) ?? []).length, 3);
  assert.ok(out.indexOf('class="ans"') < out.indexOf('middle'));
  assert.ok(out.indexOf('middle') < out.lastIndexOf('<div class="grp">'));

  // With no hair rule there are two groups, not three.
  const two = S.group('<p class="q">Q?</p><div>rest</div>');
  assert.equal((two.match(/<div class="grp">/g) ?? []).length, 2);
});
