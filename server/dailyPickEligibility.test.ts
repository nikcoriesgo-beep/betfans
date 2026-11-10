import test from "node:test";
import assert from "node:assert/strict";
import { hasTop25Team, isDailyPickEligible } from "../shared/dailyPickEligibility";
import { isPrizePoolLeague } from "../shared/prizePoolRules";

test("college basketball includes either ranked team and excludes unranked matchups", () => {
  for (const [home, away, expected] of [[1, 99, true], [99, 25, true], [25, 1, true], [26, 99, false], [0, 0, false], [undefined, null, false]] as const) {
    const isTop25 = hasTop25Team(home, away);
    assert.equal(isTop25, expected);
    assert.equal(isDailyPickEligible({ league: "NCAAB", isTop25 }), expected);
  }
  assert.equal(isDailyPickEligible({ league: "NCAAB", isTop25: null }), false);
  assert.equal(isDailyPickEligible({ league: "NBA" }), true);
  assert.equal(isDailyPickEligible({ league: "NCAABB" }), true);
});

test("Top 25 basketball becomes required November 11 without including unranked games", () => {
  for (const day of ["2026-11-01", "2026-11-10", "2026-11-11", "2026-11-18", "2027-03-01"]) {
    assert.equal(isPrizePoolLeague("NCAAB", day, true), day >= "2026-11-11");
    assert.equal(isPrizePoolLeague("NCAAB", day, false), false);
  }
});
