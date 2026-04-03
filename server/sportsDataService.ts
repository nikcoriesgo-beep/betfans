import { db } from "./db";
import { games, predictions } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const ESPN_ENDPOINTS: Record<string, string> = {
  MLB: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
  NBA: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
  MLS: "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard",
  NCAAB: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=50",
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

function mapStatus(espnState: string, typeName?: string): string {
  if (typeName === "STATUS_POSTPONED" || typeName === "STATUS_CANCELLED" || typeName === "STATUS_SUSPENDED") return "postponed";
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

function getTodayET(): string {
  // Returns YYYYMMDD in Eastern Time (handles EDT/EST automatically)
  // en-US gives "MM/DD/YYYY" → rearrange to YYYYMMDD
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()).split("/"); // ["MM", "DD", "YYYY"]
  return `${parts[2]}${parts[0]}${parts[1]}`; // YYYYMMDD
}

async function fetchLeagueGames(league: string): Promise<any[]> {
  try {
    const url = ESPN_ENDPOINTS[league];
    if (!url) return [];
    // Always pass today's ET date so ESPN returns ALL scheduled games,
    // not just live/finished ones. Without this, upcoming games are invisible.
    const todayET = getTodayET();
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}dates=${todayET}`);
    if (!response.ok) {
      console.log(`[spider] ESPN ${league} returned ${response.status}`);
      return [];
    }
    const data = await response.json();
    const events: ESPNEvent[] = data.events || [];
    const results: any[] = [];

    // For college baseball, ESPN includes some D2 transition schools — exclude them
    const NON_D1_BASEBALL = new Set(["West Georgia Wolves", "Queens University Royals"]);

    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const homeComp = comp.competitors.find((c) => c.homeAway === "home");
      const awayComp = comp.competitors.find((c) => c.homeAway === "away");
      if (!homeComp || !awayComp) continue;



      const homeTeam = homeComp.team.displayName;
      const awayTeam = awayComp.team.displayName;
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

function getETDateStr(date: Date): string {
  // Returns YYYYMMDD in correct ET (handles EST/EDT automatically)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" })
    .format(date)
    .replace(/-/g, "");
}

async function fetchAndGradeForLeagueDate(league: string, dateStr: string): Promise<number> {
  const url = ESPN_ENDPOINTS[league];
  if (!url) return 0;
  let totalGraded = 0;
  try {
    const resp = await fetch(`${url}?dates=${dateStr}`);
    if (!resp.ok) return 0;
    const data = await resp.json();
    for (const event of (data.events || []) as ESPNEvent[]) {
      if (event.status.type.state !== "post") continue;
      const comp = event.competitions?.[0];
      const homeComp = comp?.competitors?.find((c) => c.homeAway === "home");
      const awayComp = comp?.competitors?.find((c) => c.homeAway === "away");
      if (!homeComp || !awayComp) continue;
      const homeTeam = homeComp.team.displayName;
      const awayTeam = awayComp.team.displayName;
      const homeScore = homeComp.score ? parseInt(homeComp.score) : null;
      const awayScore = awayComp.score ? parseInt(awayComp.score) : null;
      if (homeScore === null || awayScore === null) continue;
      if (homeScore === 0 && awayScore === 0) continue;

      // Match by team name + date string (ET date of game start)
      const allLeagueGames = await db.select().from(games)
        .where(sql`${games.league} = ${league} AND ${games.status} != 'finished'`);

      for (const g of allLeagueGames) {
        if (g.homeTeam !== homeTeam || g.awayTeam !== awayTeam) continue;
        if (getETDateStr(new Date(g.gameTime!)) !== dateStr) continue;

        await db.update(games).set({ status: "finished", homeScore, awayScore }).where(eq(games.id, g.id));
        const graded = await autoGradePredictions(g.id, homeTeam, awayTeam, homeScore, awayScore, g.spread, g.total);
        if (graded > 0) {
          console.log(`[spider] gradeStuckGames: graded ${graded} pick(s) — ${awayTeam} @ ${homeTeam} (${dateStr})`);
          totalGraded += graded;
        }
      }
    }
  } catch (e) {
    console.log(`[spider] fetchAndGrade error ${league} ${dateStr}:`, e);
  }
  return totalGraded;
}

export async function gradeStuckGames(): Promise<number> {
  let totalGraded = 0;

  // ── Pass 1: grade any pending picks on already-finished games ─────────────
  const finishedWithPending = await db
    .select({ g: games, p: predictions })
    .from(predictions)
    .innerJoin(games, eq(predictions.gameId, games.id))
    .where(
      sql`${predictions.result} = 'pending'
        AND ${games.status} = 'finished'
        AND ${games.homeScore} IS NOT NULL
        AND ${games.awayScore} IS NOT NULL`
    );

  if (finishedWithPending.length > 0) {
    console.log(`[spider] gradeStuckGames: found ${finishedWithPending.length} pending pick(s) on finished games — grading now`);
    const gamesSeen = new Set<number>();
    for (const row of finishedWithPending) {
      const g = row.g;
      if (gamesSeen.has(g.id)) continue;
      gamesSeen.add(g.id);
      const graded = await autoGradePredictions(
        g.id, g.homeTeam, g.awayTeam,
        g.homeScore!, g.awayScore!,
        g.spread, g.total,
      );
      if (graded > 0) {
        console.log(`[spider] gradeStuckGames: safety-net graded ${graded} pick(s) — ${g.awayTeam} @ ${g.homeTeam}`);
        totalGraded += graded;
      }
    }
  }

  // ── Pass 2: re-check ALL live games immediately (no time cutoff) ──────────
  // Bug fix: the old 4-hour cutoff missed late west coast games that finish
  // before their start time + 4h. Any game marked "live" needs immediate re-check.
  const liveGames = await db.select().from(games)
    .where(sql`${games.status} = 'live' AND ${games.league} IN ('MLB','NBA','MLS','NCAAB')`);

  if (liveGames.length > 0) {
    console.log(`[spider] gradeStuckGames: re-checking ${liveGames.length} live game(s) for completion`);
    const byLeagueDate: Record<string, { league: string; dateStr: string }> = {};
    for (const g of liveGames) {
      const dateStr = getETDateStr(new Date(g.gameTime!));
      const key = `${g.league}-${dateStr}`;
      byLeagueDate[key] = { league: g.league, dateStr };
    }
    for (const { league, dateStr } of Object.values(byLeagueDate)) {
      totalGraded += await fetchAndGradeForLeagueDate(league, dateStr);
    }
  }

  // ── Pass 3: catch upcoming/unknown-status games started > 2h ago (but < 24h so we don't re-check ancient games) ──
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const oldCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stuckUpcoming = await db.select().from(games)
    .where(sql`${games.status} = 'upcoming' AND ${games.gameTime} < ${cutoff} AND ${games.gameTime} > ${oldCutoff} AND ${games.league} IN ('MLB','NBA','MLS','NCAAB','NCAABB')`);

  if (stuckUpcoming.length > 0) {
    console.log(`[spider] gradeStuckGames: found ${stuckUpcoming.length} upcoming game(s) past start time — checking`);
    const byLeagueDate: Record<string, { league: string; dateStr: string }> = {};
    for (const g of stuckUpcoming) {
      const dateStr = getETDateStr(new Date(g.gameTime!));
      const key = `${g.league}-${dateStr}`;
      byLeagueDate[key] = { league: g.league, dateStr };
    }
    for (const { league, dateStr } of Object.values(byLeagueDate)) {
      totalGraded += await fetchAndGradeForLeagueDate(league, dateStr);
    }
  }

  if (liveGames.length === 0 && stuckUpcoming.length === 0 && finishedWithPending.length === 0) {
    console.log("[spider] gradeStuckGames: all games up to date");
  }

  console.log(`[spider] gradeStuckGames: total ${totalGraded} pick(s) graded`);
  return totalGraded;
}

async function gradeYesterdayGames(): Promise<void> {
  // Fetch yesterday's date in ET and grade any unfinished games from it
  // This catches late west coast games (e.g. 9:40 PM PT) that finish after midnight UTC
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dateStr = getETDateStr(yesterday);
  const activeLeagues = ["MLB", "NBA", "MLS", "NCAAB"];
  for (const league of activeLeagues) {
    const graded = await fetchAndGradeForLeagueDate(league, dateStr);
    if (graded > 0) console.log(`[spider] yesterday-sweep: graded ${graded} picks for ${league} on ${dateStr}`);
  }
}

export async function syncSportsData(): Promise<{ synced: number; leagues: string[] }> {
  console.log("[spider] Syncing live sports data from ESPN...");

  // Grade yesterday's late games first (west coast games finishing after midnight UTC)
  await gradeYesterdayGames().catch((e) => console.log("[spider] gradeYesterday error:", e));

  // Always grade any stuck games first (picks from yesterday or earlier that didn't get graded)
  await gradeStuckGames().catch((e) => console.log("[spider] gradeStuckGames error:", e));

  const now = new Date();
  const month = now.getMonth() + 1;
  const seasonActive: Record<string, boolean> = {
    MLB: month >= 3 && month <= 10,
    NBA: month >= 10 || month <= 6,
    MLS: month >= 2 && month <= 11,
    NCAAB: month >= 11 || month <= 4,
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
        // Never mark a game as finished before its scheduled start time
        // ESPN sometimes returns stale/incorrect "post" status for future games
        const safeStatus = (game.status === "finished" && game.gameTime > new Date())
          ? (prev.status ?? "upcoming")
          : game.status;
        await db.update(games).set({
          gameTime: game.gameTime,
          status: safeStatus,
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
let gradeInterval: ReturnType<typeof setInterval> | null = null;

export function startSportsDataSync(intervalMinutes = 5) {
  // Full sync: fetch today's games + grade stuck games
  syncSportsData().catch(console.error);
  syncInterval = setInterval(() => {
    syncSportsData().catch(console.error);
  }, intervalMinutes * 60 * 1000);

  // Rapid grade check every 2 minutes: catches live→finished transitions fast
  // This runs independently so late-finishing west coast games grade immediately
  gradeInterval = setInterval(() => {
    gradeStuckGames().catch(console.error);
  }, 2 * 60 * 1000);

  console.log(`[spider] Auto-sync started (full sync every ${intervalMinutes}min, grade check every 2min)`);
}

export function stopSportsDataSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  if (gradeInterval) { clearInterval(gradeInterval); gradeInterval = null; }
}
