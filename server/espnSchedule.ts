export interface ScheduleEvent {
  id: string;
  date: string;
  status: { type: { name: string; state: string } };
  competitions: Array<{
    competitors: Array<{
      homeAway: string;
      team: { displayName: string; abbreviation: string };
      score?: string;
      curatedRank?: { current?: number };
    }>;
    odds?: Array<{
      details?: string;
      overUnder?: number;
      homeTeamOdds?: { moneyLine?: number };
      awayTeamOdds?: { moneyLine?: number };
    }>;
  }>;
}

export interface ScheduleSnapshot {
  events: ScheduleEvent[];
  successfulDates: Set<string>;
}

export function espnETDate(date: Date, offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date).split("/");
  // Count calendar days, not host-local days or 24h across a DST transition.
  return new Date(Date.UTC(+parts[2], +parts[0] - 1, +parts[1] + offsetDays))
    .toISOString().slice(0, 10).replace(/-/g, "");
}

export async function fetchEspnSchedule(
  league: string,
  endpoint: string,
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<ScheduleSnapshot> {
  const events = new Map<string, ScheduleEvent>();
  const successfulDates = new Set<string>();
  const football = league === "NFL" || league === "NCAAF";
  const readDays = async (start: number, end: number) => {
    // ESPN rejects NFL/NCAAF date ranges. A failed day must not hide other days.
    // Bound concurrency to avoid flooding the provider during the regular sync.
    for (let offset = start; offset <= end; offset += 4) {
      await Promise.all(Array.from({ length: Math.min(4, end - offset + 1) }, async (_, index) => {
        const date = espnETDate(now, offset + index);
        const url = new URL(endpoint);
        url.searchParams.set("dates", date);
        url.searchParams.set("limit", "300");
        try {
          const response = await fetcher(url.toString(), { signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          if (!Array.isArray(data.events) || data.events.some((event: ScheduleEvent) =>
            !event.id || !Number.isFinite(new Date(event.date).getTime()) ||
            !event.status?.type || !Array.isArray(event.competitions))) {
            throw new Error("Invalid ESPN events payload");
          }
          successfulDates.add(date);
          for (const event of data.events as ScheduleEvent[]) {
            // Overlapping scoreboards can include the same weekly event.
            if (!events.has(event.id)) events.set(event.id, event);
          }
        } catch (error) {
          console.warn(`[spider] ESPN ${league} ${date} schedule failed:`, error);
        }
      }));
    }
  };
  await readDays(0, football ? 14 : ["MLB", "NHL", "FIFA_WC"].includes(league) ? 1 : 0);
  if (football && successfulDates.size === 15 &&
      !Array.from(events.values()).some(event => new Date(event.date).getTime() > now.getTime())) {
    await readDays(15, 45);
  }
  return { events: Array.from(events.values()), successfulDates };
}

interface Fixture {
  externalId: string | null;
  status: string | null;
  gameTime: Date;
  homeTeam: string;
  awayTeam: string;
}

export function isRemovedFixtureCandidate(
  fixture: Fixture, snapshot: ScheduleSnapshot, predictionCount: number, now = new Date(),
): boolean {
  return fixture.status === "upcoming" && fixture.externalId?.startsWith("MLB:") === true &&
    fixture.gameTime > now && predictionCount === 0 &&
    snapshot.successfulDates.has(espnETDate(fixture.gameTime)) &&
    !snapshot.events.some(event => `MLB:${event.id}` === fixture.externalId);
}

export async function verifyEspnFixture(
  endpoint: string, fixture: Fixture, fetcher: typeof fetch = fetch,
): Promise<"scheduled" | "missing" | "unknown"> {
  const eventId = fixture.externalId?.split(":")[1];
  if (!eventId || !/^\d+$/.test(eventId)) return "unknown";
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/scoreboard$/, "/summary");
  url.search = "";
  url.searchParams.set("event", eventId);
  try {
    const response = await fetcher(url.toString(), { signal: AbortSignal.timeout(15000) });
    if (response.status === 404) return "missing";
    if (!response.ok) return "unknown";
    const data = await response.json();
    const competition = data.header?.competitions?.[0];
    const home = competition?.competitors?.find((team: any) => team.homeAway === "home");
    const away = competition?.competitors?.find((team: any) => team.homeAway === "away");
    return data.header?.id === eventId &&
      home?.team?.displayName === fixture.homeTeam && away?.team?.displayName === fixture.awayTeam &&
      new Date(competition?.date).getTime() === fixture.gameTime.getTime() &&
      competition?.status?.type?.state === "pre" &&
      !["STATUS_POSTPONED", "STATUS_CANCELLED", "STATUS_SUSPENDED"].includes(competition?.status?.type?.name)
      ? "scheduled" : "unknown";
  } catch (error) {
    console.warn(`[spider] ESPN fixture verification failed for ${fixture.externalId}:`, error);
    return "unknown";
  }
}