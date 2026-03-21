import { db } from "./db";
import { games } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const ESPN_ENDPOINTS: Record<string, string> = {
  NFL: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  NBA: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
  WNBA: "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard",
  NHL: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",
  NCAAB: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard",
  MLB: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
  NCAABB: "https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/scoreboard",
  MLS: "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard",
  NWSL: "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.nwsl/scoreboard",
};

interface ESPNEvent {
  id: string;
  date: string;
  status: {
    type: {
      name: string;
      state: string;
    };
  };
  competitions: Array<{
    competitors: Array<{
      homeAway: string;
      team: {
        displayName: string;
        abbreviation: string;
      };
      score?: string;
    }>;
    odds?: Array<{
      details?: string;
      overUnder?: number;
      homeTeamOdds?: { moneyLine?: number };
      awayTeamOdds?: { moneyLine?: number };
    }>;
  }>;
}

function mapStatus(espnState: string, espnName: string): string {
  if (espnState === "pre") return "upcoming";
  if (espnState === "in") return "live";
  if (espnState === "post") return "finished";
  return "upcoming";
}

function generateSpiderPick(
  homeTeam: string,
  awayTeam: string,
  spread: string | null,
  total: string | null,
  moneylineHome: string | null,
  moneylineAway: string | null,
  league: string
): { pick: string; confidence: number; isProLocked: boolean } {
  const seed = (homeTeam + awayTeam + new Date().toDateString()).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = (offset: number) => ((seed + offset) * 9301 + 49297) % 233280 / 233280;

  const pickType = rng(1);
  let pick: string;
  let confidence: number;

  if (spread && pickType < 0.4) {
    const spreadNum = parseFloat(spread);
    const favoredTeam = spreadNum < 0 ? homeTeam.split(" ").pop() : awayTeam.split(" ").pop();
    pick = `${favoredTeam} ${spread}`;
    confidence = Math.floor(55 + rng(2) * 40);
  } else if (total && pickType < 0.7) {
    const direction = rng(3) > 0.5 ? "Over" : "Under";
    pick = `${direction} ${total}`;
    confidence = Math.floor(50 + rng(4) * 35);
  } else if (moneylineHome && moneylineAway) {
    const homeML = parseInt(moneylineHome);
    const awayML = parseInt(moneylineAway);
    const pickHome = homeML < awayML;
    const team = pickHome ? homeTeam.split(" ").pop() : awayTeam.split(" ").pop();
    pick = `${team} ML`;
    confidence = Math.floor(pickHome ? 60 + rng(5) * 30 : 50 + rng(6) * 30);
  } else {
    const team = rng(7) > 0.5 ? homeTeam.split(" ").pop() : awayTeam.split(" ").pop();
    pick = `${team} ML`;
    confidence = Math.floor(50 + rng(8) * 30);
  }

  const isProLocked = confidence >= 75;

  return { pick, confidence, isProLocked };
}

async function fetchLeagueGames(league: string): Promise<any[]> {
  try {
    const url = ESPN_ENDPOINTS[league];
    if (!url) return [];

    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[spider] ESPN ${league} returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    const events: ESPNEvent[] = data.events || [];
    const results: any[] = [];

    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp) continue;

      const homeComp = comp.competitors.find((c) => c.homeAway === "home");
      const awayComp = comp.competitors.find((c) => c.homeAway === "away");
      if (!homeComp || !awayComp) continue;

      const homeTeam = homeComp.team.displayName;
      const awayTeam = awayComp.team.displayName;
      const gameTime = new Date(event.date);
      const status = mapStatus(event.status.type.state, event.status.type.name);
      const homeScore = homeComp.score ? parseInt(homeComp.score) : null;
      const awayScore = awayComp.score ? parseInt(awayComp.score) : null;

      const odds = comp.odds?.[0];
      let spread: string | null = null;
      let total: string | null = null;
      let moneylineHome: string | null = null;
      let moneylineAway: string | null = null;

      if (odds) {
        if (odds.details) {
          const spreadMatch = odds.details.match(/([-+]?\d+\.?\d*)/);
          if (spreadMatch) spread = spreadMatch[1];
        }
        if (odds.overUnder) total = odds.overUnder.toString();
        if (odds.homeTeamOdds?.moneyLine) moneylineHome = odds.homeTeamOdds.moneyLine.toString();
        if (odds.awayTeamOdds?.moneyLine) moneylineAway = odds.awayTeamOdds.moneyLine.toString();
      }

      const spider = generateSpiderPick(homeTeam, awayTeam, spread, total, moneylineHome, moneylineAway, league);

      results.push({
        league,
        homeTeam,
        awayTeam,
        gameTime,
        status,
        homeScore,
        awayScore,
        spread,
        total,
        moneylineHome,
        moneylineAway,
        spiderPick: spider.pick,
        spiderConfidence: spider.confidence,
        isProLocked: spider.isProLocked,
      });
    }

    return results;
  } catch (error) {
    console.log(`[spider] Error fetching ${league}:`, error);
    return [];
  }
}

export async function syncSportsData(): Promise<{ synced: number; leagues: string[] }> {
  console.log("[spider] Syncing live sports data from ESPN...");

  const now = new Date();
  const month = now.getMonth() + 1;
  const seasonActive: Record<string, boolean> = {
    NFL: month >= 9 || month <= 2,
    NBA: month >= 10 || month <= 6,
    WNBA: month >= 5 && month <= 10,
    NHL: month >= 10 || month <= 6,
    NCAAB: month >= 11 || month <= 4,
    MLB: month >= 3 && month <= 10,
    NCAABB: month >= 2 && month <= 6,
    MLS: month >= 2 && month <= 11,
    NWSL: month >= 3 && month <= 11,
  };

  let totalSynced = 0;
  const syncedLeagues: string[] = [];

  for (const league of Object.keys(ESPN_ENDPOINTS)) {
    if (!seasonActive[league]) {
      console.log(`[spider] Skipping ${league} (off-season)`);
      continue;
    }
    const liveGames = await fetchLeagueGames(league);
    if (liveGames.length === 0) continue;

    for (const game of liveGames) {
      const existing = await db
        .select()
        .from(games)
        .where(
          sql`${games.league} = ${game.league} AND ${games.homeTeam} = ${game.homeTeam} AND ${games.awayTeam} = ${game.awayTeam} AND DATE(${games.gameTime}) = DATE(${game.gameTime})`
        );

      if (existing.length > 0) {
        await db
          .update(games)
          .set({
            status: game.status,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            spread: game.spread || existing[0].spread,
            total: game.total || existing[0].total,
            moneylineHome: game.moneylineHome || existing[0].moneylineHome,
            moneylineAway: game.moneylineAway || existing[0].moneylineAway,
          })
          .where(eq(games.id, existing[0].id));
      } else {
        await db.insert(games).values(game);
        totalSynced++;
      }
    }

    syncedLeagues.push(`${league}(${liveGames.length})`);
  }

  console.log(`[spider] Sync complete: ${totalSynced} new games, leagues: ${syncedLeagues.join(", ")}`);
  return { synced: totalSynced, leagues: syncedLeagues };
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSportsDataSync(intervalMinutes = 15) {
  syncSportsData().catch(console.error);

  syncInterval = setInterval(() => {
    syncSportsData().catch(console.error);
  }, intervalMinutes * 60 * 1000);

  console.log(`[spider] Auto-sync started (every ${intervalMinutes} minutes)`);
}

export function stopSportsDataSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
