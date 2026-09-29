// Prize rules are evaluated for the game's Pacific calendar day, not the viewer's
// timezone or the day on which a scorecard/payout is displayed.
export const NHL_PRIZE_POOL_START = "2026-09-29";

export function pacificDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function isNhlRequired(day: string): boolean {
  return day >= NHL_PRIZE_POOL_START;
}

export function isPrizePoolLeague(league: string, day: string, isTop25 = false): boolean {
  return league === "MLB" || league === "NFL" ||
    (league === "NCAAF" && isTop25) || (league === "NHL" && isNhlRequired(day));
}

export function requiredPrizePoolLeagues(day: string): string[] {
  return isNhlRequired(day) ? ["MLB", "NFL", "NCAAF", "NHL"] : ["MLB", "NFL", "NCAAF"];
}

export function pacificDayWindow(day: string): { start: Date; end: Date } {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date || new Date(Date.UTC(year, month - 1, date)).toISOString().slice(0, 10) !== day) {
    throw new Error(`Invalid Pacific day: ${day}`);
  }
  const midnight = (y: number, m: number, d: number) => {
    // 07:00 UTC is midnight PDT or 23:00 PST on the previous day.
    // Both are before the 02:00 Pacific DST transition, unlike noon UTC.
    const midnightProbe = new Date(Date.UTC(y, m - 1, d, 7));
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", timeZoneName: "shortOffset",
    }).formatToParts(midnightProbe).find(part => part.type === "timeZoneName")?.value;
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offset || "");
    if (!match) throw new Error(`Cannot resolve Pacific offset: ${offset}`);
    const minutes = (Number(match[2]) * 60 + Number(match[3] || 0)) * (match[1] === "+" ? 1 : -1);
    return new Date(Date.UTC(y, m - 1, d) - minutes * 60000);
  };
  return { start: midnight(year, month, date), end: midnight(year, month, date + 1) };
}

export function previousPacificDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date - 1)).toISOString().slice(0, 10);
}