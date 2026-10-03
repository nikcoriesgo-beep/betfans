import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  espnETDate, fetchEspnSchedule, isRemovedFixtureCandidate, verifyEspnFixture,
  type ScheduleEvent,
} from "./espnSchedule";

const now = new Date("2026-10-01T14:00:00Z");
const steelers: ScheduleEvent = {
  id: "401872964",
  date: "2026-10-02T00:15Z",
  status: { type: { state: "pre", name: "STATUS_SCHEDULED" } },
  competitions: [{
    competitors: [
      { homeAway: "home", team: { displayName: "Cleveland Browns", abbreviation: "CLE" } },
      { homeAway: "away", team: { displayName: "Pittsburgh Steelers", abbreviation: "PIT" } },
    ],
  }],
};
const phantom = {
  externalId: "MLB:401907976", status: "upcoming",
  homeTeam: "San Diego Padres", awayTeam: "Chicago Cubs",
  gameTime: new Date("2026-10-02T00:00:00Z"),
};

for (const league of ["NFL", "NCAAF"]) {
  test(`${league} requests individual dates and deduplicates weekly events`, async () => {
    const urls: URL[] = [];
    let active = 0;
    let maxActive = 0;
    const fetcher = (async (input: any) => {
      const url = new URL(input);
      urls.push(url);
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return Response.json({ events: [steelers] });
    }) as typeof fetch;
    const endpoint = `https://example.com/scoreboard${league === "NCAAF" ? "?groups=80" : ""}`;
    const snapshot = await fetchEspnSchedule(league, endpoint, now, fetcher);
    assert.equal(urls.length, 15);
    assert.ok(urls.every(url => /^\d{8}$/.test(url.searchParams.get("dates")!)));
    assert.equal(urls[0].searchParams.get("dates"), "20261001");
    assert.equal(urls.at(-1)!.searchParams.get("dates"), "20261015");
    if (league === "NCAAF") assert.ok(urls.every(url => url.searchParams.get("groups") === "80"));
    assert.ok(maxActive <= 4);
    assert.equal(snapshot.successfulDates.size, 15);
    assert.deepEqual(snapshot.events, [steelers]);
  });
}

test("a failed or malformed day does not suppress valid football fixtures", async () => {
  const fetcher = (async (input: any) => {
    const date = new URL(input).searchParams.get("dates");
    if (date === "20261002") return new Response("", { status: 400 });
    if (date === "20261003") return Response.json({ error: "upstream failed" });
    return Response.json({ events: date === "20261001" ? [steelers] : [] });
  }) as typeof fetch;
  const snapshot = await fetchEspnSchedule("NFL", "https://example.com/scoreboard", now, fetcher);
  assert.deepEqual(snapshot.events, [steelers]);
  assert.equal(snapshot.successfulDates.size, 13);
  assert.ok(!snapshot.successfulDates.has("20261002"));
  assert.ok(!snapshot.successfulDates.has("20261003"));
});

test("empty two-week football slate falls back using single dates, not ranges", async () => {
  const dates: string[] = [];
  const snapshot = await fetchEspnSchedule("NFL", "https://example.com/scoreboard", now,
    (async (input: any) => {
      dates.push(new URL(input).searchParams.get("dates")!);
      return Response.json({ events: [] });
    }) as typeof fetch);
  assert.equal(dates.length, 46);
  assert.equal(dates.at(-1), "20261115");
  assert.equal(snapshot.successfulDates.size, 46);
  assert.ok(dates.every(date => /^\d{8}$/.test(date)));
});

test("MLB and NHL retain tomorrow's slate for late Pacific starts and next-day picks", async () => {
  for (const league of ["MLB", "NHL"]) {
    const dates: string[] = [];
    await fetchEspnSchedule(league, "https://example.com/scoreboard", now,
      (async (input: any) => {
        dates.push(new URL(input).searchParams.get("dates")!);
        return Response.json({ events: [] });
      }) as typeof fetch);
    assert.deepEqual(dates, ["20261001", "20261002"]);
  }
});

test("ET date conversion handles UTC midnight, month boundaries and DST", () => {
  assert.equal(espnETDate(phantom.gameTime), "20261001");
  assert.equal(espnETDate(new Date("2026-11-01T03:00:00Z"), 1), "20261101");
  assert.equal(espnETDate(new Date("2026-11-01T07:00:00Z"), 1), "20261102");
  assert.equal(espnETDate(new Date("2026-12-31T23:00:00Z"), 1), "20270101");
});

test("removal requires a successful missing-date slate and no predictions; never live/completed", () => {
  const snapshot = { events: [], successfulDates: new Set(["20261001"]) };
  assert.equal(isRemovedFixtureCandidate(phantom, snapshot, 0, now), true);
  assert.equal(isRemovedFixtureCandidate(phantom, snapshot, 1, now), false);
  for (const status of ["live", "finished", "postponed"]) {
    assert.equal(isRemovedFixtureCandidate({ ...phantom, status }, snapshot, 0, now), false);
  }
  assert.equal(isRemovedFixtureCandidate(phantom, { ...snapshot, successfulDates: new Set() }, 0, now), false);
  assert.equal(isRemovedFixtureCandidate(phantom, {
    ...snapshot, events: [{ ...steelers, id: "401907976" }],
  }, 0, now), false);
  assert.equal(isRemovedFixtureCandidate(phantom, snapshot, 0, new Date("2026-10-02T01:00Z")), false);
});

test("only summary 404 proves absence; outages must not retire or reactivate fixtures", async () => {
  for (const [status, expected] of [[404, "missing"], [500, "unknown"], [401, "unknown"]] as const) {
    assert.equal(await verifyEspnFixture("https://example.com/scoreboard", phantom,
      (async () => new Response("", { status })) as typeof fetch), expected);
  }
  assert.equal(await verifyEspnFixture("https://example.com/scoreboard", phantom,
    (async () => { throw new Error("network down"); }) as typeof fetch), "unknown");
});

test("postponed fixture restoration needs exact ID, teams, time and scheduled summary", async () => {
  const fixture = {
    externalId: "NFL:401872964", status: "postponed", gameTime: new Date(steelers.date),
    homeTeam: "Cleveland Browns", awayTeam: "Pittsburgh Steelers",
  };
  const summary = {
    header: {
      id: steelers.id,
      competitions: [{
        ...steelers.competitions[0], date: steelers.date, status: steelers.status,
      }],
    },
  };
  const fetcher = (async () => Response.json(summary)) as typeof fetch;
  assert.equal(await verifyEspnFixture("https://example.com/scoreboard", fixture, fetcher), "scheduled");
  assert.equal(await verifyEspnFixture("https://example.com/scoreboard", {
    ...fixture, homeTeam: "Different team",
  }, fetcher), "unknown");
  assert.equal(await verifyEspnFixture("https://example.com/scoreboard", {
    ...fixture, gameTime: new Date("2026-10-02T01:15Z"),
  }, fetcher), "unknown");
  summary.header.competitions[0].status.type.name = "STATUS_POSTPONED";
  assert.equal(await verifyEspnFixture("https://example.com/scoreboard", fixture, fetcher), "unknown");
});