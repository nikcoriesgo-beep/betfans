export type ChampionshipLockRule = "playoffs" | "final_round" | "world_series_friday";

// Owner-approved MLB 2026 exception: start of Friday in Pacific daylight time.
export const MLB_2026_CHAMPIONSHIP_LOCK = "2026-10-23T07:00:00.000Z";

// Use the earliest kickoff: a round may contain games at different times.
// Reject incomplete or cross-season responses instead of guessing a deadline.
export function finalRoundStart(
  events: { date?: string; season?: { year?: number } }[],
  seasonYear: number,
  expectedGames: number,
): string | null {
  if (events.length !== expectedGames) return null;
  const times = events.map(event =>
    event.season?.year === seasonYear ? Date.parse(event.date ?? "") : NaN);
  if (times.some(time => !Number.isFinite(time))) return null;
  return new Date(Math.min(...times)).toISOString();
}

export function championshipIsLocked(lockAt: string | null, now = Date.now()): boolean {
  return lockAt !== null && now >= Date.parse(lockAt);
}
