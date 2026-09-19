import { test } from "node:test";
import assert from "node:assert/strict";
import { prizePoolScore } from "./prizePoolRules";
import { readFileSync } from "node:fs";

test("optional sports cannot turn a 14-4 outright win into a tie", () => {
  const noPicks = { picks: 0, wins: 0, losses: 0 };
  const nikco = { mlb: { picks: 15, wins: 11, losses: 4 }, ncaaf: { picks: 3, wins: 3, losses: 0 }, nfl: noPicks, epl: { picks: 1, wins: 0, losses: 1 } };
  const bryant = { ...nikco, mlb: { picks: 15, wins: 10, losses: 5 }, epl: { picks: 1, wins: 1, losses: 0 } };
  assert.deepEqual(prizePoolScore(nikco), { picks: 18, wins: 14, losses: 4, pending: 0 });
  assert.deepEqual(prizePoolScore(bryant), { picks: 18, wins: 13, losses: 5, pending: 0 });
});

test("payout selection limits leagues and preserves Top 25 eligibility", () => {
  const source = readFileSync("server/payoutService.ts", "utf8");
  assert.ok(source.includes("IN ('MLB','NCAAF','NFL')"));
  assert.ok(source.includes("COALESCE(${games.isTop25}, FALSE)"));
  assert.ok(!source.includes("boxing.picks >= boxingMatchups.length"));
});