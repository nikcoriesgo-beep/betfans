import test from "node:test";
import assert from "node:assert/strict";
import { isNcaabRequired, isPrizePoolLeague, pacificDay, requiredPrizePoolLeagues } from "../shared/prizePoolRules";
import { prizePoolQualified, prizePoolScore } from "./prizePoolRules";

test("Top 25 college basketball starts at November 11 Pacific midnight", () => {
  assert.equal(isNcaabRequired(pacificDay(new Date("2026-11-11T07:59:59Z"))), false);
  assert.equal(isNcaabRequired(pacificDay(new Date("2026-11-11T08:00:00Z"))), true);
  assert.equal(requiredPrizePoolLeagues("2026-11-10").includes("NCAAB"), false);
  assert.equal(requiredPrizePoolLeagues("2026-11-11").includes("NCAAB"), true);
  assert.equal(isPrizePoolLeague("NCAAB", "2026-11-11", false), false);
  assert.equal(isPrizePoolLeague("NCAABB", "2026-11-11", true), false);
});

test("basketball picks affect qualification, scores and ties only from the effective day", () => {
  const win = { picks: 1, wins: 1, losses: 0 };
  const empty = { picks: 0, wins: 0, losses: 0 };
  const scores = { mlb: win, nfl: win, ncaaf: win, nhl: win, nba: win, ncaab: empty };
  const counts = { mlb: 1, nfl: 1, ncaaf: 1, nhl: 1, nba: 1, ncaab: 2 };
  assert.equal(prizePoolQualified(scores, counts, "2026-11-10"), true);
  assert.equal(prizePoolQualified(scores, counts, "2026-11-11"), false);
  assert.equal(prizePoolQualified({ ...scores, ncaab: win }, counts, "2026-11-11"), false);
  const picked = { ...scores, ncaab: { picks: 2, wins: 1, losses: 1 } };
  assert.equal(prizePoolQualified(picked, counts, "2026-11-11"), true);
  assert.deepEqual(prizePoolScore(picked, "2026-11-10"), { picks: 5, wins: 5, losses: 0, pending: 0 });
  assert.deepEqual(prizePoolScore(picked, "2026-11-11"), { picks: 7, wins: 6, losses: 1, pending: 0 });
  assert.equal(prizePoolQualified(scores, { ...counts, ncaab: 0 }, "2026-11-11"), true);
});
