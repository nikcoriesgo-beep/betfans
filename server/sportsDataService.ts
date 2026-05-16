import { db } from "./db";
import { games, predictions, leaderboardEntries } from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

const ESPN_ENDPOINTS: Record<string, string> = {
  MLB: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
  NBA: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
  NHL: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",
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
  homeScore: number | null,
  awayScore: number | null,
  spread: string | null,
  total: string | null,
): "win" | "loss" | "push" | "pending" {
  if (homeScore === null || homeScore === undefined || awayScore === null || awayScore === undefined) return "pending";
  const pick = pickText.toLowerCase();
  const homeWords = homeTeam.toLowerCase().split(" ").filter((w) => w.length > 2);
  const awayWords = awayTeam.toLowerCase().split(" ").filter((w) => w.length > 2);
  const homeWon = homeScore > awayScore;
  const totalScore = homeScore + awayScore;

  // Prefer words unique to each team (e.g. "dodgers" vs "angels" when both share "los angeles").
  // This prevents city-name collisions (Dodgers/Angels, Yankees/Mets, etc.).
  const uniqueHomeWords = homeWords.filter((w) => !awayWords.includes(w));
  const uniqueAwayWords = awayWords.filter((w) => !homeWords.includes(w));
  const effectiveHomeWords = uniqueHomeWords.length > 0 ? uniqueHomeWords : homeWords;
  const effectiveAwayWords = uniqueAwayWords.length > 0 ? uniqueAwayWords : awayWords;

  const pickMentionsHome = effectiveHomeWords.some((w) => pick.includes(w));
  const pickMentionsAway = effectiveAwayWords.some((w) => pick.includes(w));

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

// Real Nikco account UUID — his BFB picks are tracked under this ID.
const NIKCO_REAL_ID = 'aa5b3efa-fb3e-49b1-9f60-983bcec7d67a';

// BFB seed: cumulative MLB record through May 15, 2026 (Nikco-confirmed 365-312 YTD).
// All MLB picks Nikco submits from May 16 onwards are added on top of this baseline.
const BFB_SEED_WINS = 365;
const BFB_SEED_LOSSES = 312;

// After grading an MLB game, update Nikco's bfb_ytd leaderboard entry.
// Counts only his graded MLB picks with created_at >= 2026-05-16 (real in-app picks after May 15 seed).
// and adds them to the historical seed record.
export async function refreshBFBRecord(): Promise<void> {
  try {
    const result = await db.execute(
      sql`SELECT
        COUNT(*) FILTER (WHERE p.result = 'win')  AS wins,
        COUNT(*) FILTER (WHERE p.result = 'loss') AS losses
      FROM predictions p
      JOIN games g ON p.game_id = g.id
      WHERE p.user_id = ${NIKCO_REAL_ID}
        AND g.league = 'MLB'
        AND p.result IN ('win', 'loss')
        AND p.created_at >= '2026-05-16'`
    );
    const row = (result as any).rows?.[0] ?? result[0] ?? {};
    const newW = parseInt((row as any).wins  ?? "0", 10);
    const newL = parseInt((row as any).losses ?? "0", 10);
    const totalW = BFB_SEED_WINS  + newW;
    const totalL = BFB_SEED_LOSSES + newL;
    const total  = totalW + totalL;
    const roi    = total > 0 ? Math.round((totalW / total) * 1000) / 10 : 0;

    const [existing] = await db.select({ id: leaderboardEntries.id })
      .from(leaderboardEntries)
      .where(and(eq(leaderboardEntries.userId, NIKCO_REAL_ID), eq(leaderboardEntries.period, "bfb_ytd")))
      .limit(1);

    if (existing) {
      await db.update(leaderboardEntries)
        .set({ wins: totalW, losses: totalL, roi, updatedAt: new Date() })
        .where(and(eq(leaderboardEntries.userId, NIKCO_REAL_ID), eq(leaderboardEntries.period, "bfb_ytd")));
    } else {
      await db.insert(leaderboardEntries).values({
        userId: NIKCO_REAL_ID, period: "bfb_ytd",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        rank: 1, wins: totalW, losses: totalL, roi, profit: 45, streak: 5,
      });
    }
    console.log(`[spider] BFB YTD updated: ${totalW}-${totalL} (${newW}+${newL} new real picks on top of ${BFB_SEED_WINS}-${BFB_SEED_LOSSES} seed)`);
  } catch (e: any) {
    console.log(`[spider] refreshBFBRecord error:`, e.message);
  }
}

// After grading picks, recount wins/losses from the predictions table and update
// the user's annual leaderboard entry so BB score auto-updates each day.
async function refreshAnnualLeaderboard(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  for (const userId of userIds) {
    try {
      const [row] = await db.execute<{ wins: string; losses: string }>(
        sql`SELECT
          COUNT(*) FILTER (WHERE result = 'win')  AS wins,
          COUNT(*) FILTER (WHERE result = 'loss') AS losses
        FROM predictions WHERE user_id = ${userId}`
      );
      const wins   = parseInt((row as any).wins  ?? "0", 10);
      const losses = parseInt((row as any).losses ?? "0", 10);
      const total  = wins + losses;
      const roi    = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
      await db.update(leaderboardEntries)
        .set({ wins, losses, roi, updatedAt: new Date() })
        .where(and(eq(leaderboardEntries.userId, userId), eq(leaderboardEntries.period, "annual")));
    } catch (e: any) {
      console.log(`[spider] refreshAnnualLeaderboard error for ${userId}:`, e.message);
    }
  }
}

export async function autoGradePredictions(
  gameId: number,
  homeTeam: string,
  awayTeam: string,
  homeScore: number | null,
  awayScore: number | null,
  spread: string | null,
  total: string | null,
): Promise<number> {
  // Never grade on a 0-0 score — game hasn't started or data is bad
  if (homeScore === 0 && awayScore === 0) return 0;

  const pending = await db
    .select()
    .from(predictions)
    .where(and(eq(predictions.gameId, gameId), eq(predictions.result, "pending")));

  let graded = 0;
  const affectedUsers = new Set<string>();
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
      affectedUsers.add(pred.userId);
      graded++;
    }
  }
  // Auto-update the annual leaderboard for every user whose picks were just graded
  if (affectedUsers.size > 0) {
    await refreshAnnualLeaderboard([...affectedUsers]).catch(() => {});
    // If Nikco's picks were among those graded AND the game is MLB, update his BFB YTD record
    if (affectedUsers.has(NIKCO_REAL_ID)) {
      await refreshBFBRecord().catch(() => {});
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
      // Also re-sync finished games that have 0-0 scores (placeholder/bad data)
      const allLeagueGames = await db.select().from(games)
        .where(sql`${games.league} = ${league} AND (${games.status} != 'finished' OR (${games.homeScore} = 0 AND ${games.awayScore} = 0))`);

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

  // ── Pass 0: void pending picks on DB-confirmed postponed games ───────────────
  // When ESPN confirms STATUS_POSTPONED, syncSportsData marks the DB game as
  // "postponed". Any pending picks on those games get voided here so they never
  // block the BFB record or the daily scorecard.
  try {
    const postponedPending = await db
      .select({ p: predictions, g: games })
      .from(predictions)
      .innerJoin(games, eq(predictions.gameId, games.id))
      .where(sql`${predictions.result} = 'pending' AND ${games.status} = 'postponed'`);

    if (postponedPending.length > 0) {
      console.log(`[spider] gradeStuckGames: voiding ${postponedPending.length} pick(s) on postponed game(s)`);
      for (const row of postponedPending) {
        await db.update(predictions).set({ result: "void" }).where(eq(predictions.id, row.p.id));
        console.log(`  → voided pick ${row.p.id} (${row.p.pick}) — ${row.g.awayTeam} @ ${row.g.homeTeam}`);
      }
    }
  } catch (e) {
    console.log("[spider] gradeStuckGames pass0 error:", e);
  }

  // ── Pass 1: fetch ESPN for stuck "upcoming" games (2h+ past start) ─────────
  // Must run FIRST so finished game rows exist before the remap pass below.
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const oldCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stuckUpcoming = await db.select().from(games)
    .where(sql`${games.status} = 'upcoming' AND ${games.gameTime} < ${cutoff} AND ${games.gameTime} > ${oldCutoff} AND ${games.league} IN ('MLB','NBA','NHL','MLS','NCAAB','NCAABB')`);

  if (stuckUpcoming.length > 0) {
    console.log(`[spider] gradeStuckGames: found ${stuckUpcoming.length} upcoming game(s) past start time — fetching ESPN`);
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

  // ── Pass 2: re-check ALL live games immediately ───────────────────────────
  const liveGames = await db.select().from(games)
    .where(sql`${games.status} = 'live' AND ${games.league} IN ('MLB','NBA','NHL','MLS','NCAAB')`);

  if (liveGames.length > 0) {
    console.log(`[spider] gradeStuckGames: re-checking ${liveGames.length} live game(s) for completion`);
    const byLeagueDate2: Record<string, { league: string; dateStr: string }> = {};
    for (const g of liveGames) {
      const dateStr = getETDateStr(new Date(g.gameTime!));
      const key = `${g.league}-${dateStr}`;
      byLeagueDate2[key] = { league: g.league, dateStr };
    }
    for (const { league, dateStr } of Object.values(byLeagueDate2)) {
      totalGraded += await fetchAndGradeForLeagueDate(league, dateStr);
    }
  }

  // ── Pass 3: remap orphaned picks whose opponent changed (schedule shift) ───
  // Runs AFTER ESPN fetch so finished game rows already exist in DB.
  // Finds pending picks where referenced game is still "upcoming" 2h+ past start,
  // then re-points game_id to the actual finished game where pickedTeam played.
  try {
    const orphaned = await db
      .select({ p: predictions, g: games })
      .from(predictions)
      .innerJoin(games, eq(predictions.gameId, games.id))
      .where(
        sql`${predictions.result} = 'pending'
          AND ${games.status} = 'upcoming'
          AND ${games.gameTime} < ${cutoff}`
      );

    if (orphaned.length > 0) {
      console.log(`[spider] gradeStuckGames: found ${orphaned.length} orphaned pick(s) — remapping to actual games`);
      for (const row of orphaned) {
        const pick = row.p;
        const staleGame = row.g;
        const staleGameTime = new Date(staleGame.gameTime!);
        const realGame = await db.select().from(games)
          .where(
            sql`${games.league} = ${staleGame.league}
              AND ${games.status} = 'finished'
              AND (${games.homeTeam} = ${pick.pick} OR ${games.awayTeam} = ${pick.pick})
              AND DATE(${games.gameTime} AT TIME ZONE 'America/New_York') = DATE(${staleGameTime.toISOString()} AT TIME ZONE 'America/New_York')`
          )
          .limit(1);

        if (realGame.length > 0) {
          const rg = realGame[0];
          console.log(`[spider] remapping pick ${pick.id} (${pick.pick}) → game ${rg.id} (${rg.awayTeam} @ ${rg.homeTeam})`);
          await db.update(predictions).set({ gameId: rg.id }).where(eq(predictions.id, pick.id));
        }
      }
    }
  } catch (e) {
    console.log("[spider] gradeStuckGames remap error:", e);
  }

  // ── Pass 4: grade any pending picks on already-finished games ─────────────
  // Runs after remap so re-pointed picks get graded in this pass.
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
        console.log(`[spider] gradeStuckGames: graded ${graded} pick(s) — ${g.awayTeam} @ ${g.homeTeam}`);
        totalGraded += graded;
      }
    }
  }

  // ── Pass 5: re-fetch finished games with 0-0 scores (bad/placeholder data) ──
  const zeroScoreFinished = await db.select().from(games)
    .where(sql`${games.status} = 'finished' AND ${games.homeScore} = 0 AND ${games.awayScore} = 0 AND ${games.league} IN ('MLB','NBA','NHL','MLS','NCAAB') AND ${games.gameTime} > ${oldCutoff}`);

  if (zeroScoreFinished.length > 0) {
    console.log(`[spider] gradeStuckGames: found ${zeroScoreFinished.length} finished game(s) with 0-0 score — re-fetching`);
    const byLeagueDate: Record<string, { league: string; dateStr: string }> = {};
    for (const g of zeroScoreFinished) {
      const dateStr = getETDateStr(new Date(g.gameTime!));
      const key = `${g.league}-${dateStr}`;
      byLeagueDate[key] = { league: g.league, dateStr };
    }
    for (const { league, dateStr } of Object.values(byLeagueDate)) {
      totalGraded += await fetchAndGradeForLeagueDate(league, dateStr);
    }
  }

  if (liveGames.length === 0 && stuckUpcoming.length === 0 && finishedWithPending.length === 0 && zeroScoreFinished.length === 0) {
    console.log("[spider] gradeStuckGames: all games up to date");
  }

  // ── Pass 6: verify & auto-correct misgraded picks from last 48h ──────────
  // Picks sometimes get graded during partial score updates (ESPN returns wrong
  // scores briefly mid-game) and are never re-checked once graded. This pass
  // re-runs gradePick against current DB scores for all recently graded picks
  // and corrects any that don't match the final result.
  try {
    const recentCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recentGraded = await db
      .select({ p: predictions, g: games })
      .from(predictions)
      .innerJoin(games, eq(predictions.gameId, games.id))
      .where(
        sql`${predictions.result} IN ('win','loss')
          AND ${games.status} = 'finished'
          AND ${games.homeScore} IS NOT NULL
          AND ${games.awayScore} IS NOT NULL
          AND ${predictions.createdAt} > ${recentCutoff}`
      );

    let corrected = 0;
    const correctedUsers = new Set<string>();
    for (const row of recentGraded) {
      const g = row.g;
      const p = row.p;
      const expected = gradePick(
        p.pick, p.predictionType,
        g.homeTeam, g.awayTeam,
        g.homeScore!, g.awayScore!,
        g.spread, g.total
      );
      if (expected !== "pending" && expected !== p.result) {
        const payout = expected === "win" ? 1 : expected === "push" ? 0 : -1;
        await db.update(predictions).set({ result: expected, payout }).where(eq(predictions.id, p.id));
        correctedUsers.add(p.userId);
        corrected++;
        console.log(`[spider] ✓ corrected pick ${p.id} (${p.pick}) on ${g.awayTeam}@${g.homeTeam}: ${p.result} → ${expected} (scores: ${g.awayScore}-${g.homeScore})`);
      }
    }
    if (corrected > 0) {
      console.log(`[spider] gradeStuckGames: auto-corrected ${corrected} misgraded pick(s)`);
      totalGraded += corrected;
      if (correctedUsers.has(NIKCO_REAL_ID)) {
        await refreshBFBRecord().catch(() => {});
      }
      await refreshAnnualLeaderboard([...correctedUsers]).catch(() => {});
    }
  } catch (e) {
    console.log("[spider] gradeStuckGames pass6 (verify) error:", e);
  }

  console.log(`[spider] gradeStuckGames: total ${totalGraded} pick(s) graded/corrected`);

  // Always recalculate BFB record after every grade pass — catches any
  // picks that were graded since the last sync without waiting for the next one.
  await refreshBFBRecord().catch((e) => console.log("[spider] refreshBFBRecord error:", e));

  return totalGraded;
}

async function gradeYesterdayGames(): Promise<void> {
  // Look back 3 days to catch postponed/rescheduled games that finally played
  // West coast games, doubleheaders, and weather postponements all handled
  const activeLeagues = ["MLB", "NBA", "NHL", "MLS", "NCAAB"];
  for (let daysBack = 1; daysBack <= 3; daysBack++) {
    const d = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const dateStr = getETDateStr(d);
    for (const league of activeLeagues) {
      const graded = await fetchAndGradeForLeagueDate(league, dateStr);
      if (graded > 0) console.log(`[spider] lookback-${daysBack}d: graded ${graded} picks for ${league} on ${dateStr}`);
    }
  }
}

async function auditStalePicks(): Promise<void> {
  // Warn when any pick is still pending 36+ hours after submission — signals a grading gap
  const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000);
  const stale = await db
    .select({ pred: predictions, game: games })
    .from(predictions)
    .innerJoin(games, eq(predictions.gameId, games.id))
    .where(sql`${predictions.result} = 'pending' AND ${predictions.createdAt} < ${cutoff}`);
  if (stale.length > 0) {
    console.log(`[spider] ⚠ STALE PICKS: ${stale.length} pick(s) ungraded after 36h:`);
    for (const row of stale) {
      console.log(`  → pick="${row.pred.pick}" game="${row.game.awayTeam} @ ${row.game.homeTeam}" status=${row.game.status} gameTime=${row.game.gameTime}`);
    }
  }
}

export async function syncSportsData(): Promise<{ synced: number; leagues: string[] }> {
  console.log("[spider] Syncing live sports data from ESPN...");

  // Look back 3 days for postponed/rescheduled games + late west coast finishers
  await gradeYesterdayGames().catch((e) => console.log("[spider] gradeYesterday error:", e));

  // Grade any stuck picks on already-finished games
  await gradeStuckGames().catch((e) => console.log("[spider] gradeStuckGames error:", e));

  // Audit: warn if any pick is still pending after 36h — surfaces grading gaps immediately
  await auditStalePicks().catch((e) => console.log("[spider] auditStalePicks error:", e));

  const now = new Date();
  const month = now.getMonth() + 1;
  const seasonActive: Record<string, boolean> = {
    MLB: month >= 3 && month <= 10,
    NBA: month >= 10 || month <= 6,
    NHL: month >= 10 || month <= 6,
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
      // Find all DB records for this matchup on the same PST date
      const allSameDay = await db
        .select()
        .from(games)
        .where(
          sql`${games.league} = ${game.league} AND ${games.homeTeam} = ${game.homeTeam} AND ${games.awayTeam} = ${game.awayTeam} AND DATE(${games.gameTime} AT TIME ZONE 'America/Los_Angeles') = DATE(${game.gameTime} AT TIME ZONE 'America/Los_Angeles')`
        );

      // Match by game time (within 90 minutes) to handle doubleheaders.
      // If no close-time match found → INSERT as a new game even if same matchup exists.
      const gameTimeMs = game.gameTime.getTime();
      const timeMatch = allSameDay.find(e => Math.abs(new Date(e.gameTime!).getTime() - gameTimeMs) <= 90 * 60 * 1000);
      const existing = timeMatch ? [timeMatch] : [];

      if (existing.length > 0) {
        const prev = existing[0];

        // CRITICAL: If the existing record is already FINISHED (played yesterday),
        // treat today's same-matchup as a brand-new game — INSERT, never UPDATE.
        // MLB series = same teams play 3 days in a row; this is the root cause of
        // the duplicate game / reset-picks bug.
        if (prev.status === "finished" && game.status === "upcoming") {
          await db.insert(games).values(game);
          totalSynced++;
          continue;
        }

        // Never mark a game as finished before its scheduled start time
        const safeStatus = (game.status === "finished" && game.gameTime > new Date())
          ? (prev.status ?? "upcoming")
          : game.status;

        await db.update(games).set({
          gameTime: game.gameTime,
          status: safeStatus,
          homeScore: safeStatus === "upcoming" ? null : game.homeScore,
          awayScore: safeStatus === "upcoming" ? null : game.awayScore,
          spread: game.spread || prev.spread,
          total: game.total || prev.total,
          moneylineHome: game.moneylineHome || prev.moneylineHome,
          moneylineAway: game.moneylineAway || prev.moneylineAway,
          spiderPick: game.spiderPick,
          spiderConfidence: game.spiderConfidence,
          isProLocked: game.isProLocked,
        }).where(eq(games.id, prev.id));

        if (
          safeStatus === "finished" &&
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
        // Final guard: before inserting, check the 90-min time-bucket to prevent any duplicate
        // (handles edge cases where the PST-date query above missed an existing record).
        const gameTimeBucket = Math.round(game.gameTime.getTime() / (90 * 60 * 1000));
        const bucketCheck = await db.execute(sql`
          SELECT id FROM games
          WHERE league = ${game.league}
            AND home_team = ${game.homeTeam}
            AND away_team = ${game.awayTeam}
            AND ROUND(EXTRACT(EPOCH FROM game_time) / 5400) = ${gameTimeBucket}
          LIMIT 1
        `);
        if ((bucketCheck as any).rows?.length > 0) {
          // An equivalent game already exists — update it instead of inserting a duplicate
          const existingId = (bucketCheck as any).rows[0].id;
          await db.update(games).set({
            status: game.status,
            homeScore: game.status === "upcoming" ? null : game.homeScore,
            awayScore: game.status === "upcoming" ? null : game.awayScore,
            spiderPick: game.spiderPick,
            spiderConfidence: game.spiderConfidence,
          }).where(eq(games.id, existingId));
        } else {
          await db.insert(games).values(game);
          totalSynced++;
        }
      }
    }

    syncedLeagues.push(`${league}(${liveGames.length})`);
  }

  console.log(`[spider] Sync complete: ${totalSynced} new games, ${totalGraded} picks graded, leagues: ${syncedLeagues.join(", ")}`);

  // Always recalculate BFB record after every sync — ensures it stays current
  // regardless of whether grading happened during this cycle.
  await refreshBFBRecord().catch((e) => console.log("[spider] refreshBFBRecord error:", e));

  return { synced: totalSynced, leagues: syncedLeagues };
}

let syncInterval: ReturnType<typeof setInterval> | null = null;
let gradeInterval: ReturnType<typeof setInterval> | null = null;

export function startSportsDataSync(intervalMinutes = 30) {
  // Full sync: fetch today's games + grade stuck games
  syncSportsData().catch(console.error);
  syncInterval = setInterval(() => {
    syncSportsData().catch(console.error);
  }, intervalMinutes * 60 * 1000);

  // Grade check every 15 minutes: lets Neon auto-suspend between runs to conserve compute quota
  gradeInterval = setInterval(() => {
    gradeStuckGames().catch(console.error);
  }, 15 * 60 * 1000);

  console.log(`[spider] Auto-sync started (full sync every ${intervalMinutes}min, grade check every 15min)`);
}

export function stopSportsDataSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  if (gradeInterval) { clearInterval(gradeInterval); gradeInterval = null; }
}
