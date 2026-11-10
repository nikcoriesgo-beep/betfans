import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { canBrowseMemberPages, canPlayFreeGames, hasPrizePoolAccess } from "../shared/membershipAccess";

test("Free Play members can browse and make picks without prize eligibility", () => {
  assert.equal(canBrowseMemberPages("free_play"), true);
  assert.equal(canPlayFreeGames({ membershipTier: "free_play", referredBy: "inviter" }), true);
  assert.equal(hasPrizePoolAccess("free_play"), false);
});

test("manual renewal selection and update both exclude free memberships", () => {
  for (const path of ["server/morningCheck.ts", ".local/nhl-rollout/server/morningCheck.ts"]) {
    if (path.startsWith(".local/") && !fs.existsSync(path)) continue;
    const source = fs.readFileSync(path, "utf8");
    const section = source.slice(source.indexOf("const lapsedManual"), source.indexOf("log(`⚠ Manual-pay lapse"));
    const predicates = [...section.matchAll(/membership_tier IN \(([^)]+)\)/g)];
    assert.equal(predicates.length, 2, `${path}: select and update must both check paid tier`);
    for (const [, values] of predicates) {
      const tiers = [...values.matchAll(/'([^']+)'/g)].map(m => m[1]);
      assert.ok(tiers.includes("legend"));
      assert.ok(!tiers.includes("free_play"));
      assert.ok(!tiers.includes("free"));
    }
  }
});
