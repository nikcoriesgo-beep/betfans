import { test } from "node:test";
import assert from "node:assert/strict";
import { prizePoolScore, prizePoolQualified } from "./prizePoolRules";
import { readFileSync } from "node:fs";
import { isNhlRequired, isPrizePoolLeague, pacificDay, pacificDayWindow, previousPacificDay, requiredPrizePoolLeagues } from "../shared/prizePoolRules";

test("optional sports cannot turn a 14-4 outright win into a tie", () => {
  const noPicks = { picks: 0, wins: 0, losses: 0 };
  const nikco = { mlb: { picks: 15, wins: 11, losses: 4 }, ncaaf: { picks: 3, wins: 3, losses: 0 }, nfl: noPicks, epl: { picks: 1, wins: 0, losses: 1 } };
  const bryant = { ...nikco, mlb: { picks: 15, wins: 10, losses: 5 }, epl: { picks: 1, wins: 1, losses: 0 } };
  assert.deepEqual(prizePoolScore(nikco, "2026-09-28"), { picks: 18, wins: 14, losses: 4, pending: 0 });
  assert.deepEqual(prizePoolScore(bryant, "2026-09-28"), { picks: 18, wins: 13, losses: 5, pending: 0 });
});

test("payout selection limits leagues and preserves Top 25 eligibility", () => {
  const source = readFileSync("server/payoutService.ts", "utf8");
  assert.ok(source.includes("requiredPrizePoolLeagues(day)"));
  assert.ok(source.includes("inArray(games.league, leagues)"));
  assert.ok(source.includes("COALESCE(${games.isTop25}, FALSE)"));
  assert.ok(source.includes("prizePoolQualified(scores,"));
  const routes = readFileSync("server/routes.ts", "utf8");
  assert.ok(routes.includes("prizePoolScore(scores, dateLabel)"));
  assert.ok(routes.includes("prizePoolQualified(scores,"));
  assert.ok(routes.includes("nhlRequired: isNhlRequired(dateLabel)"));
});

test("September 29 switches NHL on at midnight Pacific, not UTC or payout time", () => {
  const before = new Date("2026-09-29T06:59:59.999Z");
  const after = new Date("2026-09-29T07:00:00.000Z");
  assert.equal(pacificDay(before), "2026-09-28");
  assert.equal(pacificDay(after), "2026-09-29");
  assert.equal(isNhlRequired(pacificDay(before)), false);
  assert.equal(isNhlRequired(pacificDay(after)), true);
  assert.deepEqual(requiredPrizePoolLeagues("2026-09-28"), ["MLB", "NFL", "NCAAF"]);
  assert.deepEqual(requiredPrizePoolLeagues("2026-09-29"), ["MLB", "NFL", "NCAAF", "NHL"]);
  assert.equal(pacificDayWindow("2026-09-28").end.toISOString(), after.toISOString());
  assert.equal(pacificDayWindow("2026-09-29").start.toISOString(), after.toISOString());
  assert.equal(previousPacificDay("2026-09-29"), "2026-09-28");
  const spring = pacificDayWindow("2026-03-08");
  assert.equal(spring.start.toISOString(), "2026-03-08T08:00:00.000Z");
  assert.equal(spring.end.toISOString(), "2026-03-09T07:00:00.000Z");
  assert.equal(spring.end.getTime() - spring.start.getTime(), 23 * 60 * 60 * 1000);
  const fall = pacificDayWindow("2026-11-01");
  assert.equal(fall.start.toISOString(), "2026-11-01T07:00:00.000Z");
  assert.equal(fall.end.toISOString(), "2026-11-02T08:00:00.000Z");
  assert.equal(fall.end.getTime() - fall.start.getTime(), 25 * 60 * 60 * 1000);
});

test("only Top 25 FBS and date-effective NHL affect qualification and prize scoring", () => {
  for (const day of ["2026-09-28", "2026-09-29"]) {
    assert.equal(isPrizePoolLeague("NCAAF", day, true), true);
    assert.equal(isPrizePoolLeague("NCAAF", day, false), false);
    for (const optional of ["NBA", "EPL", "UCL", "FIFA_WC", "BOXING", "NCAABB", "MLS"]) {
      assert.equal(isPrizePoolLeague(optional, day), false);
    }
  }
  assert.equal(isPrizePoolLeague("NHL", "2026-09-28"), false);
  assert.equal(isPrizePoolLeague("NHL", "2026-09-29"), true);
  const scores = {
    mlb: { picks: 1, wins: 1, losses: 0 },
    nfl: { picks: 1, wins: 0, losses: 1 },
    ncaaf: { picks: 1, wins: 1, losses: 0 },
    nhl: { picks: 0, wins: 0, losses: 0 },
    nba: { picks: 2, wins: 2, losses: 0 },
    epl: { picks: 2, wins: 2, losses: 0 },
  };
  const counts = { mlb: 1, nfl: 1, ncaaf: 1, nhl: 1 };
  assert.equal(prizePoolQualified(scores, counts, "2026-09-28"), true);
  assert.equal(prizePoolQualified(scores, counts, "2026-09-29"), false);
  assert.deepEqual(prizePoolScore(scores, "2026-09-28"), { picks: 3, wins: 2, losses: 1, pending: 0 });
  const pickedNhl = { ...scores, nhl: { picks: 1, wins: 1, losses: 0 } };
  assert.equal(prizePoolQualified(pickedNhl, counts, "2026-09-29"), true);
  assert.deepEqual(prizePoolScore(pickedNhl, "2026-09-29"), { picks: 4, wins: 3, losses: 1, pending: 0 });
  assert.deepEqual(prizePoolScore(pickedNhl, "2026-09-28"), { picks: 3, wins: 2, losses: 1, pending: 0 });
});