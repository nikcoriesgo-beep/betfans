import test from "node:test";
import assert from "node:assert/strict";
import { isMlsRequired, isPrizePoolLeague, pacificDay, requiredPrizePoolLeagues } from "../shared/prizePoolRules";
import { prizePoolQualified, prizePoolScore } from "./prizePoolRules";

test("2026 MLS playoffs become required at November 18 Pacific midnight only", () => {
  assert.equal(isMlsRequired(pacificDay(new Date("2026-11-18T07:59:59Z"))), false);
  assert.equal(isMlsRequired(pacificDay(new Date("2026-11-18T08:00:00Z"))), true);
  for (const day of ["2026-11-18", "2026-12-06"]) {
    assert.equal(isPrizePoolLeague("MLS", day), true);
    assert.ok(requiredPrizePoolLeagues(day).includes("MLS"));
    assert.equal(isPrizePoolLeague("NCAAF", day, false), false);
    assert.equal(isPrizePoolLeague("NCAAF", day, true), true);
    assert.equal(isPrizePoolLeague("EPL", day), false);
  }
  for (const day of ["2026-11-17", "2027-01-01", "2027-11-18"]) {
    assert.equal(isPrizePoolLeague("MLS", day), false);
    assert.ok(!requiredPrizePoolLeagues(day).includes("MLS"));
  }
});

test("MLS picks affect qualification and prize scores only within the playoff window", () => {
  const win = { picks: 1, wins: 1, losses: 0 };
  const empty = { picks: 0, wins: 0, losses: 0 };
  const scores = { mlb: win, nfl: win, ncaaf: win, nhl: win, nba: win, mls: empty };
  const counts = { mlb: 1, nfl: 1, ncaaf: 1, nhl: 1, nba: 1, mls: 1 };
  assert.equal(prizePoolQualified(scores, counts, "2026-11-17"), true);
  assert.equal(prizePoolQualified(scores, counts, "2026-11-18"), false);
  const picked = { ...scores, mls: win };
  assert.equal(prizePoolQualified(picked, counts, "2026-11-18"), true);
  assert.equal(prizePoolScore(picked, "2026-11-17").wins, 5);
  assert.equal(prizePoolScore(picked, "2026-11-18").wins, 6);
  assert.equal(prizePoolScore(picked, "2027-01-01").wins, 5);
  assert.equal(prizePoolQualified(scores, { ...counts, mls: 0 }, "2026-11-18"), true);
});
