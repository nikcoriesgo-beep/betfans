import { db } from "./db";
import { games, predictions } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

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
  status: { type: { name: string; state: string } };
  competitions: Array<{
    competitors: Array<{
      homeAway: string;
      team: { displayName: string; abbreviation: string };
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

function mapStatus(espnState: string): string {
  if (espnState === "pre") return "upcoming";
  if (espnState === "in") return "live";
  if (espnState === "post") return "finished";
  return "upcoming";
}

function generateSpiderPick(
  homeTeam: string, awayTeam: string,
  spread: string | null, total: string | null,
  moneylineHome: string | null, moneylineAway: string | null,
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

  return { pick, confidence, isProLocked: confidence >= 75 };
}

function gradePick(
  pickText: string,
  predType: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  spread: string | null,
  total: string | null,
): "win" | "loss" | "push" | "pending" {
  const pick = pickText.toLowerCase();
  const homeWords = homeTeam.toLowerCase().split(" ").filter((w) => w.length > 2);
  const awayWords = awayTeam.toLowerCase().split(" ").filter((w) => w.length > 2);
  const homeWon = homeScore > awayScore;
  const totalScore = homeScore + awayScore;

  const pickMentionsHome = homeWords.some((w) => pick.includes(w));
  const pickMentionsAway = awayWords.some((w) => pick.includes(w));

  if (pick.includes("over") || pick.includes("under")) {
    const line = parseFloat(total || "0");
    if (!line) return "pending";
    if (totalScore === line) return "push";
    if (pick.includes("over")) return totalScore > line ? "win" : "loss";
    if (pick.includes("under")) return totalScore < line ? "win" : "loss";
  }

  const type = predType.toLowerCase();
  const isSpread = type.includes("spread") || type.includes("run line") || type.includes("puck line") || type.includes("handicap");

  if (isSpread && spread) {
    const line = parseFloat(spread);
    if (pickMentionsHome) {
      const adj = homeScore + line;
      if (adj > awayScore) return "win";
      if (adj < awayScore) return "loss";
      return "push";
    }
    if (pickMentionsAway) {
      const adj = awayScore - line;
      if (adj > homeScore) return "win";
      if (adj < homeScore) return "loss";
      return "push";
    }
  }

  if (pickMentionsHome) return homeWon ? "win" : homeScore === awayScore ? "push" : "loss";
  if (pickMentionsAway) return !homeWon ? "win" : homeScore === awayScore ? "push" : "loss";

  return "pending";
}

async function autoGradePredictions(
  gameId: number,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  spread: string | null,
  total: string | null,
): Promise<number> {
  const pending = await db
    .select()
    .from(predictions)
    .where(and(eq(predictions.gameId, gameId), eq(predictions.result, "pending")));

  let graded = 0;
  for (const pred of pending) {
    const result = gradePick(
      pred.pick,
      pred.predictionType,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      spread,
      total,
    );
    if (result !== "pending") {
      const payout = result === "win" ? 1 : result === "push" ? 0 : -1;
      await db.update(predictions).set({ result, payout }).where(eq(predictions.id, pred.id));
      graded++;
    }
  }
  return graded;
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
      const status = mapStatus(event.status.type.state);
      const homeScore = homeComp.score ? parseInt(homeComp.score) : null;
      const awayScore = awayComp.score ? parseInt(awayComp.score) : null;

      const odds = comp.odds?.[0];
      let spread: string | null = null;
      let total: string | null = null;
      let moneylineHome: string | null = null;
      let moneylineAway: string | null = null;

      if (odds) {
        if (odds.details) {
          const m = odds.details.match(/([-+]?\d+\.?\d*)/);
          if (m) spread = m[1];
        }
        if (odds.overUnder) total = odds.overUnder.toString();
        if (odds.homeTeamOdds?.moneyLine) moneylineHome = odds.homeTeamOdds.moneyLine.toString();
        if (odds.awayTeamOdds?.moneyLine) moneylineAway = odds.awayTeamOdds.moneyLine.toString();
      }

      const spider = generateSpiderPick(homeTeam, awayTeam, spread, total, moneylineHome, moneylineAway);

      results.push({
        league, homeTeam, awayTeam,
        gameTime: new Date(event.date),
        status, homeScore, awayScore,
        spread, total, moneylineHome, moneylineAway,
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
  let totalGraded = 0;
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
        const prev = existing[0];
        await db.update(games).set({
          status: game.status,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          spread: game.spread || prev.spread,
          total: game.total || prev.total,
          moneylineHome: game.moneylineHome || prev.moneylineHome,
          moneylineAway: game.moneylineAway || prev.moneylineAway,
          spiderPick: game.spiderPick,
          spiderConfidence: game.spiderConfidence,
          isProLocked: game.isProLocked,
        }).where(eq(games.id, prev.id));

        if (
          game.status === "finished" &&
          game.homeScore !== null &&
          game.awayScore !== null
        ) {
          const graded = await autoGradePredictions(
            prev.id,
            game.homeTeam,
            game.awayTeam,
            game.homeScore,
            game.awayScore,
            game.spread || prev.spread,
            game.total || prev.total,
          );
          if (graded > 0) {
            totalGraded += graded;
            console.log(`[spider] Auto-graded ${graded} picks for ${game.awayTeam} @ ${game.homeTeam}`);
          }
        }
      } else {
        await db.insert(games).values(game);
        totalSynced++;
      }
    }

    syncedLeagues.push(`${league}(${liveGames.length})`);
  }

  console.log(`[spider] Sync complete: ${totalSynced} new games, ${totalGraded} picks graded, leagues: ${syncedLeagues.join(", ")}`);
  return { synced: totalSynced, leagues: syncedLeagues };
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSportsDataSync(intervalMinutes = 5) {
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
