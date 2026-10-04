import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrizePoolExempt } from "../shared/prizePoolExemptions";

const fixture = {
  externalId: "NFL:401872965", homeTeam: "Washington Commanders",
  awayTeam: "Indianapolis Colts", gameTime: "2026-10-04T13:30:00Z",
};
test("only the approved October 4 fixture is exempt", () => {
  assert.equal(isPrizePoolExempt(fixture), true);
  assert.equal(isPrizePoolExempt({ ...fixture, externalId: null }), true);
  assert.equal(isPrizePoolExempt({ ...fixture, gameTime: "2026-10-05T13:30:00Z" }), false);
  assert.equal(isPrizePoolExempt({ ...fixture, gameTime: "2026-10-04T06:59:59Z" }), false);
  assert.equal(isPrizePoolExempt({ ...fixture, externalId: "NFL:401872966", homeTeam: "New York Giants", awayTeam: "Arizona Cardinals" }), false);
});