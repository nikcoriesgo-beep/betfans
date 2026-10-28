// Apply eligibility to the game's Pacific calendar day, including preseason games.
export const NHL_PRIZE_POOL_START = "2026-09-29";
export const NBA_PRIZE_POOL_START = "2026-10-20";
export const MLS_PLAYOFF_PRIZE_POOL_START = "2026-11-18";
export const PRIZE_POOL_NOTICE = "Beginning November 18th, 2026 (Pacific Time), all scheduled MLS Soccer Playoff 2026 games must be selected along with all MLB, NFL, NHL, NBA and NCAA FBS Top 25 games for daily Prize Pool qualification.";
export const OPTIONAL_SPORTS_NOTICE = "All other sports are optional Skill Play. They count toward rankings, not Prize Pool qualification.";

// This is the owner's 2026 MLS playoff window, not a permanent MLS rule.
// MLS regular-season games in subsequent seasons must remain optional.
export function isMlsRequired(day: string): boolean {
  return day >= MLS_PLAYOFF_PRIZE_POOL_START && day < "2027-01-01";
}

export function isNbaRequired(day: string): boolean {
  return day >= NBA_PRIZE_POOL_START;
}

export function pacificDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function isNhlRequired(day: string): boolean {
  return day >= NHL_PRIZE_POOL_START;
}

export function isPrizePoolLeague(league: string, day: string, isTop25 = false): boolean {
  return league === "MLB" || league === "NFL" ||
    (league === "NCAAF" && isTop25) || (league === "NHL" && isNhlRequired(day)) ||
    (league === "NBA" && isNbaRequired(day)) || (league === "MLS" && isMlsRequired(day));
}

export function requiredPrizePoolLeagues(day: string): string[] {
  return ["MLB", "NFL", "NCAAF", ...(isNhlRequired(day) ? ["NHL"] : []), ...(isNbaRequired(day) ? ["NBA"] : []), ...(isMlsRequired(day) ? ["MLS"] : [])];
}

export function pacificDayWindow(day: string): { start: Date; end: Date } {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date || new Date(Date.UTC(year, month - 1, date)).toISOString().slice(0, 10) !== day) {
    throw new Error(`Invalid Pacific day: ${day}`);
  }
  const midnight = (y: number, m: number, d: number) => {
    const probe = new Date(Date.UTC(y, m - 1, d, 7));
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", timeZoneName: "shortOffset",
    }).formatToParts(probe).find(part => part.type === "timeZoneName")?.value;
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