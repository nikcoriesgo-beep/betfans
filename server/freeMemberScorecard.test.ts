import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { isFreeMembership, hasPrizePoolAccess } from "../shared/membershipAccess";
import { scorecardWinners } from "./scorecardWinners";

test("both free tiers remain scored but cannot win or share a prize", () => {
  const free = ["free", "free_play"].map(tier => ({
    userId: tier, name: tier, tier, qualified: true,
    prizePoolTotal: { wins: 20, losses: 0 },
  }));
  for (const member of free) {
    assert.equal(isFreeMembership(member.tier), true);
    assert.equal(hasPrizePoolAccess(member.tier), false);
  }
  const paid = { userId: "paid", name: "Paid", tier: "legend", qualified: true, prizePoolTotal: { wins: 10, losses: 1 } };
  assert.deepEqual(scorecardWinners([...free, paid]).winners.map(m => m.userId), ["paid"]);
  assert.equal(scorecardWinners([...free, paid]).winners[0].shareFraction, 1);
  assert.equal(scorecardWinners(free).winner, null);
  assert.equal(free[0].prizePoolTotal.wins, 20);
});

test("scorecard includes and labels both free tiers in development and release", () => {
  for (const prefix of ["", ".local/nhl-rollout/"]) {
    if (prefix && !existsSync(prefix + "server/routes.ts")) continue;
    const source = readFileSync(prefix + "server/routes.ts", "utf8");
    const route = source.slice(source.indexOf('app.get("/api/daily-scorecard"'), source.indexOf('app.get("/api/world-cup/schedule"'));
    assert.match(route, /'free_play', 'free'/);
    assert.match(route, /u.membershipTier !== "free_play" && u.membershipTier !== "free" && prizePoolQualified/);
    assert.match(route, /const myPreds = dayPreds.filter/);
    const ui = readFileSync(prefix + "client/src/pages/winners.tsx", "utf8");
    assert.match(ui, /isFreeMembership\(m.tier\)/);
    assert.match(ui, /Not qualified for Prize Pool/);
    assert.match(ui, /FOR PRIZE POOL/);
  }
});
