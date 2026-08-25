import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadCurves, loadReference, gradeFor, gradesFor, memberStanding, ownStanding,
  compareStandings, CURVE_IDS, FEATURED_CURVE,
} from '../src/grades.js';

const ref = loadReference();

/* ------------------------------------------------------- the reference table */

test('the reference table is complete and monotonic', () => {
  assert.equal(ref.table.length, 60);
  assert.equal(ref.table[0].score, 40);
  assert.equal(ref.table[59].score, 99);
  const scores = ref.table.map((r) => r.score);
  assert.deepEqual(scores, [...Array(60)].map((_, i) => 40 + i), 'no score missing or repeated');
  for (let i = 1; i < ref.table.length; i++) {
    assert.ok(
      ref.table[i].percentile >= ref.table[i - 1].percentile,
      `percentile must not fall from ${ref.table[i - 1].score} to ${ref.table[i].score}`,
    );
  }
});

test('every stated percentile sits inside its own stated interval', () => {
  for (const row of ref.table) {
    const [lo, hi] = row.ci;
    assert.ok(lo <= row.percentile && row.percentile <= hi, `score ${row.score}`);
  }
});

// This is the regression guard that matters. The curve definitions live in one
// JSON and the published grades live in another; if the two ever drift, every
// grade on both screens is silently wrong while still looking plausible.
test('the curves reproduce all 180 published grade cells exactly', () => {
  let checked = 0;
  for (const row of ref.table) {
    for (const id of CURVE_IDS) {
      assert.equal(
        gradeFor(row.percentile, id), row.grades[id],
        `score ${row.score} (percentile ${row.percentile}) on the ${id} curve`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, 180);
});

test('every curve grades a rank, never a raw score', () => {
  // Computing the standard grade from the score instead of the percentile was a
  // real bug in the source research. If anyone reintroduces it, a score of 88
  // becomes a B (80s) instead of the B+ its 89.1st percentile earns.
  for (const c of loadCurves()) {
    assert.ok(c.bands.some((b) => b.min > 0 && b.min < 100));
  }
  // Score 79 sits at the 56.2nd percentile of member nights. Graded on its rank
  // that is an F; graded as though the score itself were a percentile it is a
  // C+. Those are five bands apart, and the wrong one looks entirely plausible.
  assert.equal(gradeFor(56.2, 'standard'), 'F');
  assert.equal(gradeFor(79, 'standard'), 'C+');
  assert.equal(memberStanding(79).grades.standard, 'F');
});

test('the curves run harshest to most generous', () => {
  const share = (id) => {
    // Share of member nights earning an A or a B, integrated over the real
    // nightly density implied by the percentile column.
    let acc = 0;
    for (let i = 0; i < ref.table.length; i++) {
      const row = ref.table[i];
      const next = i + 1 < ref.table.length ? ref.table[i + 1].percentile : 100;
      const letter = gradeFor(row.percentile, id)[0];
      if (letter === 'A' || letter === 'B') acc += next - row.percentile;
    }
    return acc;
  };
  const [standard, bell, curved] = [share('standard'), share('bell'), share('curved')];
  assert.ok(standard < bell, `standard ${standard.toFixed(1)}% must be harsher than bell ${bell.toFixed(1)}%`);
  assert.ok(bell < curved, `bell ${bell.toFixed(1)}% must be harsher than curved ${curved.toFixed(1)}%`);
  assert.equal(loadCurves().map((c) => c.id).join(','), 'standard,bell,curved');
});

/* ----------------------------------------------------- the suppression guard */

test('low-confidence rows never offer a number to display', () => {
  const suppressed = ref.table.filter((r) => !memberStanding(r.score).display);
  assert.equal(suppressed.length, 26);
  for (const row of suppressed) {
    assert.equal(row.confidence, 'low');
    assert.ok(row.score <= 59 || row.score >= 94, `score ${row.score} should not be suppressed`);
  }
  // A suppressed row still grades -- it just cannot print its percentile.
  const top = memberStanding(95);
  assert.equal(top.display, false);
  assert.equal(top.grades.curved, 'A+');
  assert.ok(top.qualitative);
});

test('every displayable row is medium confidence and in 60..93', () => {
  const shown = ref.table.filter((r) => memberStanding(r.score).display);
  assert.equal(shown.length, 34);
  for (const row of shown) {
    assert.equal(row.confidence, 'medium');
    assert.ok(row.score >= 60 && row.score <= 93);
  }
  // The source research is explicit that no row can be high confidence until a
  // spread comes from Oura's own member base.
  assert.ok(!ref.table.some((r) => r.confidence === 'high'));
});

test('scores off the ends of the table are marked, not guessed', () => {
  for (const score of [20, 39, 100, 120]) {
    const s = memberStanding(score);
    assert.equal(s.percentile, null);
    assert.equal(s.display, false);
    assert.equal(s.offTable, true);
  }
});

test('the member population is never described as national, and carries no count', () => {
  const label = JSON.stringify(ref.population).toLowerCase();
  assert.ok(!label.includes('"national'), 'members are self-selected, not a population sample');
  assert.equal(ref.population.n, null, 'no member count is published; do not invent one');
  assert.equal(ref.population.sdPublished, false);
});

/* --------------------------------------------------------- the known anchors */

test('the anchors from the source document round-trip', () => {
  const last = memberStanding(88);
  assert.equal(last.percentile, 89.1);
  assert.deepEqual(last.grades, { standard: 'B+', bell: 'B+', curved: 'A' });
  assert.deepEqual(last.ci, [84.6, 93.2]);
  assert.equal(last.sd, 1.11);

  const avg = memberStanding(77);
  assert.equal(avg.percentile, 47.9); // the mean is not the median; the curve is skewed
  assert.equal(avg.grades.curved, 'B-');
  assert.equal(avg.sd, 0);

  assert.equal(memberStanding(79).grades.curved, 'B');
  assert.equal(memberStanding(60).grades.standard, 'F');
  assert.equal(FEATURED_CURVE, 'curved');
});

/* ------------------------------------------------------------ his own nights */

const history = [
  ...Array(200).fill(70), ...Array(400).fill(79), ...Array(300).fill(85),
  ...Array(100).fill(88), ...Array(42).fill(94),
];

test('own standing is empirical and accounts for every night', () => {
  const own = ownStanding(88, history);
  assert.equal(own.n, 1042);
  assert.equal(own.worse + own.better + own.nightsAtScore, own.n, 'every night is worse, better, or tied');
  assert.equal(own.nightsAtScore, 100);
  // percentileRank splits the tie, so it sits between the two one-sided ranks.
  assert.ok(own.percentile > (own.worse / own.n) * 100);
  assert.ok(own.percentile < ((own.worse + own.nightsAtScore) / own.n) * 100);
  assert.equal(own.display, true);
});

test('own standing never claims a percentile from too little history', () => {
  for (const h of [[], [80]]) {
    const own = ownStanding(88, h);
    assert.equal(own.percentile, null);
    assert.equal(own.grades, null);
    assert.equal(own.display, false);
  }
});

test('own standing accepts telemetry records as well as bare numbers', () => {
  const asRecords = history.map((score, i) => ({ date: `d${i}`, score }));
  assert.deepEqual(ownStanding(88, asRecords), ownStanding(88, history));
});

test('a score with almost no neighbours in the history is flagged thin', () => {
  assert.equal(ownStanding(88, history).thin, false);
  assert.equal(ownStanding(71, history).thin, true);
});

test('the two populations are graded on identical curves so the gap is readable', () => {
  const cmp = compareStandings(88, history);
  assert.equal(cmp.members.percentile, 89.1);
  assert.ok(cmp.own.percentile !== null);
  assert.equal(
    cmp.percentileGap.toFixed(4),
    (cmp.members.percentile - cmp.own.percentile).toFixed(4),
  );
  // Same percentile in, same grade out, whichever population produced it.
  for (const id of CURVE_IDS) {
    assert.equal(gradeFor(cmp.own.percentile, id), gradesFor(cmp.own.percentile)[id]);
  }
});

test('an unknown curve is an error, not a silent null', () => {
  assert.throws(() => gradeFor(50, 'generous'), /unknown curve/);
});

test('a missing percentile grades to null rather than to F', () => {
  // Guards the worst failure mode on a screen: no data rendering as a failure.
  for (const p of [null, undefined, NaN]) {
    assert.equal(gradesFor(p), null);
    assert.equal(gradeFor(p, 'curved'), null);
  }
});
