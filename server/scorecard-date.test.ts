import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("yesterday's scorecard excludes today even when an early game has finished", () => {
  const source = readFileSync("server/routes.ts", "utf8");
  const handler = source.slice(source.indexOf('app.get("/api/daily-scorecard"'));
  const loop = handler.match(/for \(let daysBack = (\d+); daysBack <= (\d+); daysBack\+\+\)/);
  assert.ok(loop);
  assert.equal(Number(loop[1]), 1);
  const candidateDates = (now: string) => {
    const dates = [];
    for (let daysBack = Number(loop[1]); daysBack <= Number(loop[2]); daysBack++) {
      const dt = new Date(now);
      dt.setUTCDate(dt.getUTCDate() - daysBack);
      dates.push(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(dt));
    }
    return dates;
  };
  for (const now of ["2026-09-19T07:01:00Z", "2026-09-19T13:53:00Z", "2026-09-20T06:59:00Z"]) {
    const dates = candidateDates(now);
    assert.equal(dates[0], "2026-09-18");
    assert.ok(!dates.includes("2026-09-19"));
    // Both yesterday and today have finished games: only yesterday is eligible.
    assert.equal(dates.find(date => ["2026-09-18", "2026-09-19"].includes(date)), "2026-09-18");
    // Fall back to an older day if yesterday has no finished games.
    assert.equal(dates.find(date => date === "2026-09-17"), "2026-09-17");
  }
  assert.equal(candidateDates("2027-01-01T08:01:00Z")[0], "2026-12-31");
});