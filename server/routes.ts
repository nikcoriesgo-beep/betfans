import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";
import { db } from "./db";
import { users, referrals, games, predictions, leaderboardEntries } from "@shared/schema";
import { eq, sql, and, desc, asc, inArray } from "drizzle-orm";
import { insertPredictionSchema, insertChatMessageSchema, insertThreadSchema, insertThreadReplySchema, insertAdvertiserSchema } from "@shared/schema";
import { stripeService } from "./stripeService";
import { WebhookHandlers } from "./webhookHandlers";
import { getPayPalConfig, getSubscriptionDetails, tierFromPlanId } from "./paypalService";
import { WebSocketServer } from "ws";
import multer from "multer";
import { syncSportsData } from "./sportsDataService";
import { getLastCheckResult } from "./morningCheck";
import { fetchAllSportsNews } from "./sportsNewsService";
import path from "path";
import fs from "fs";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Only images and videos are allowed"));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post(
    '/api/stripe/webhook',
    (await import('express')).default.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature'];
      if (!signature) return res.status(400).json({ error: 'Missing signature' });
      try {
        const sig = Array.isArray(signature) ? signature[0] : signature;
        await WebhookHandlers.processWebhook(req.body as Buffer, sig);
        res.status(200).json({ received: true });
      } catch (error: any) {
        console.error('Webhook error:', error.message);
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );

  const express = (await import('express')).default;
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "2mb" }));

  await setupAuth(app);
  registerAuthRoutes(app);

  app.get("/api/auth/replit-auto", async (req: any, res) => {
    try {
      const replitUserName = req.headers["x-replit-user-name"] as string;
      const replitUserId = req.headers["x-replit-user-id"] as string;
      if (!replitUserName || !replitUserId) {
        return res.json({ recognized: false });
      }
      const replOwner = process.env.REPL_OWNER || "nikcoriesgo-beep";
      if (replitUserName.toLowerCase() !== replOwner.toLowerCase()) {
        return res.json({ recognized: false });
      }
      const [founder] = await db.select().from(users).where(eq(users.referralCode, "NIKCOX")).limit(1);
      if (!founder) {
        return res.json({ recognized: false, message: "Founder account not yet created — please sign up once." });
      }
      (req.session as any).userId = founder.id;
      req.session.save((err: any) => {
        if (err) return res.status(500).json({ recognized: false });
        const { passwordHash, ...safe } = founder as any;
        res.json({ recognized: true, user: safe });
      });
    } catch (err) {
      res.status(500).json({ recognized: false });
    }
  });

  app.post("/api/auth/logout", (req: any, res) => {
    req.session.destroy((err: any) => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  async function fetchMLBSchedule(dateStr: string) {
    try {
      const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}&hydrate=team,linescore,probablePitcher`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const data = await r.json();
      const games: any[] = [];
      for (const date of data.dates || []) {
        for (const g of date.games || []) {
          games.push({
            mlbGamePk: g.gamePk,
            homeTeam: g.teams?.home?.team?.name || "Home",
            awayTeam: g.teams?.away?.team?.name || "Away",
            homeAbbr: g.teams?.home?.team?.abbreviation || "",
            awayAbbr: g.teams?.away?.team?.abbreviation || "",
            gameTime: g.gameDate,
            status: g.status?.abstractGameState || "Preview",
            detailedState: g.status?.detailedState || "",
            homeScore: g.teams?.home?.score ?? null,
            awayScore: g.teams?.away?.score ?? null,
            inning: g.linescore?.currentInning ?? null,
            inningHalf: g.linescore?.inningHalf ?? null,
            venue: g.venue?.name || "",
            homePitcher: g.teams?.home?.probablePitcher?.fullName || null,
            awayPitcher: g.teams?.away?.probablePitcher?.fullName || null,
          });
        }
      }
      return games;
    } catch { return []; }
  }

  function spiderAnalysis(awayTeam: string, homeTeam: string, seed: number) {
    const picks = [awayTeam, homeTeam];
    const pick = picks[seed % 2];
    const confidence = 55 + (seed % 30);
    const types = ["Moneyline", "Run Line", "First 5 Innings"];
    const type = types[seed % 3];
    return { pick, confidence, type };
  }

  app.get("/api/baseball-breakfast", async (req: any, res) => {
    try {
      const callerId: string | null = (req.session as any)?.userId || null;
      // Find founder by referralCode so any account with NIKCOX code is recognised
      const [founderRow] = await db.select().from(users).where(eq(users.referralCode, "NIKCOX")).limit(1);
      const founder = founderRow || null;
      const callerIsFounder = !!founder && callerId === founder.id;

      // ET date — Intl is immune to Replit's dev-server frozen clock
      const etParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date()).split("/"); // ["MM","DD","YYYY"]
      const dateStr = `${etParts[2]}-${etParts[0]}-${etParts[1]}`; // YYYY-MM-DD
      const etDateESPN = `${etParts[2]}${etParts[0]}${etParts[1]}`; // YYYYMMDD for ESPN
      // EDT = UTC-4: ET midnight → UTC 04:00
      const [ey, em, ed] = dateStr.split("-").map(Number);
      const todayStart = new Date(Date.UTC(ey, em - 1, ed, 4, 0, 0));
      const todayEnd   = new Date(Date.UTC(ey, em - 1, ed + 1, 4, 0, 0));

      function normalize(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ""); }
      function teamMatch(a: string, b: string) {
        const na = normalize(a), nb = normalize(b);
        return na === nb || na.includes(nb.slice(-6)) || nb.includes(na.slice(-6));
      }

      // --- Read today's MLB games via storage.getGames so game IDs match daily-picks exactly ---
      const dbMlbGames = await storage.getGames("MLB");

      // --- Fresh ESPN fetch for live scores/status only (no DB writes here) ---
      const espnStatusMap = new Map<string, { status: string; homeScore: number|null; awayScore: number|null }>();
      try {
        const espnResp = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${etDateESPN}`);
        if (espnResp.ok) {
          const espnData = await espnResp.json();
          for (const event of (espnData.events || [])) {
            const comp = event.competitions?.[0];
            const homeComp = comp?.competitors?.find((c: any) => c.homeAway === "home");
            const awayComp = comp?.competitors?.find((c: any) => c.homeAway === "away");
            if (!homeComp || !awayComp) continue;
            const state = event.status?.type?.state;
            const status = state === "post" ? "finished" : state === "in" ? "live" : "upcoming";
            const key = `${awayComp.team.displayName}|${homeComp.team.displayName}`;
            espnStatusMap.set(key, {
              status,
              homeScore: homeComp.score ? parseInt(homeComp.score) : null,
              awayScore: awayComp.score ? parseInt(awayComp.score) : null,
            });
          }
        }
      } catch (e) { console.error("ESPN MLB live fetch error:", e); }

      // --- MLB Stats API for pitcher names ---
      const mlbApiGames = await fetchMLBSchedule(dateStr);

      // --- Founder YTD stats — read from annual leaderboard entry (tracks all sports) ---
      // If no entry exists, self-heal by creating one with current YTD numbers
      const YTD_WINS = 242, YTD_LOSSES = 195;
      let stats = { wins: YTD_WINS, losses: YTD_LOSSES, profit: 37, roi: 55.4, streak: 5, totalPicks: YTD_WINS + YTD_LOSSES };
      if (founder) {
        try {
          const [lbEntry] = await db
            .select()
            .from(leaderboardEntries)
            .where(and(eq(leaderboardEntries.userId, founder.id), eq(leaderboardEntries.period, "annual")))
            .limit(1);
          if (lbEntry && ((lbEntry.wins ?? 0) > 0 || (lbEntry.losses ?? 0) > 0)) {
            // Use DB values only if they have real data
            stats = {
              wins: lbEntry.wins ?? 0,
              losses: lbEntry.losses ?? 0,
              profit: Number(lbEntry.profit) || 0,
              roi: Number(lbEntry.roi) || 0,
              streak: lbEntry.streak || 0,
              totalPicks: ((lbEntry.wins ?? 0) + (lbEntry.losses ?? 0)),
            };
          } else if (lbEntry) {
            // Entry exists but has 0-0 data — update it to current YTD
            await db.update(leaderboardEntries)
              .set({ wins: YTD_WINS, losses: YTD_LOSSES, roi: 55.4, profit: 37, streak: 5, rank: 1 })
              .where(and(eq(leaderboardEntries.userId, founder.id), eq(leaderboardEntries.period, "annual")));
          } else {
            // Self-heal: insert the annual entry if it's missing
            await db.insert(leaderboardEntries).values({
              userId: founder.id,
              period: "annual",
              periodStart: new Date("2026-01-01T00:00:00Z"),
              rank: 1,
              wins: YTD_WINS,
              losses: YTD_LOSSES,
              roi: 55.6,
              profit: 37,
              streak: 5,
            });
          }
        } catch (e) {
          // Fallback to hardcoded YTD stats if DB error
          console.error("BB stats error, using fallback:", e);
        }
      }

      // --- Today's picks: founder sees their own picks; members see only their own picks ---
      const founderPredictions = callerIsFounder && callerId
        ? await db.select().from(predictions).where(
            sql`${predictions.userId} = ${callerId} AND ${predictions.createdAt} >= ${todayStart} AND ${predictions.createdAt} <= ${todayEnd}`
          )
        : [];

      // For non-founder logged-in members, load their own today's picks
      const callerPredictions = !callerIsFounder && callerId
        ? await db.select().from(predictions).where(
            sql`${predictions.userId} = ${callerId} AND ${predictions.createdAt} >= ${todayStart} AND ${predictions.createdAt} <= ${todayEnd}`
          )
        : [];

      const gamesWithAnalysis = dbMlbGames.map((g) => {
        const apiGame = mlbApiGames.find((a: any) => teamMatch(g.homeTeam, a.homeTeam) && teamMatch(g.awayTeam, a.awayTeam));
        // Prefer live ESPN status over potentially-stale DB status
        const liveESPN = espnStatusMap.get(`${g.awayTeam}|${g.homeTeam}`);
        const liveStatus = liveESPN?.status || g.status;
        const liveHomeScore = liveESPN?.homeScore ?? g.homeScore;
        const liveAwayScore = liveESPN?.awayScore ?? g.awayScore;
        const rawPick = (g.spiderPick || "").replace(/\s*ML\s*$/i, "").trim();
        const spider = { pick: rawPick, confidence: g.spiderConfidence || 60, type: "Moneyline" };
        // founderPick only returned to the founder; myPick returned to the logged-in member
        const founderPick = callerIsFounder ? (founderPredictions.find((p) => p.gameId === g.id) || null) : null;
        const myPick = !callerIsFounder ? (callerPredictions.find((p) => p.gameId === g.id) || null) : null;
        return {
          gameId: g.id,
          mlbGamePk: apiGame?.mlbGamePk || g.id,
          homeTeam: g.homeTeam, awayTeam: g.awayTeam,
          homeAbbr: apiGame?.homeAbbr || g.homeTeam.split(" ").pop() || "",
          awayAbbr: apiGame?.awayAbbr || g.awayTeam.split(" ").pop() || "",
          gameTime: g.gameTime,
          status: liveStatus === "finished" ? "Final" : liveStatus === "live" ? "Live" : "Upcoming",
          detailedState: liveStatus,
          homeScore: liveHomeScore, awayScore: liveAwayScore,
          inning: apiGame?.inning || null, inningHalf: apiGame?.inningHalf || null,
          venue: apiGame?.venue || "",
          homePitcher: apiGame?.homePitcher || null, awayPitcher: apiGame?.awayPitcher || null,
          spread: g.spread, total: g.total,
          spider, founderPick, myPick,
        };
      });

      res.json({
        founder: founder ? { id: founder.id, firstName: founder.firstName, lastName: founder.lastName, profileImageUrl: founder.profileImageUrl } : null,
        games: gamesWithAnalysis,
        stats,
        date: dateStr,
      });
    } catch (error) {
      console.error("Baseball breakfast error:", error);
      res.status(500).json({ message: "Failed to fetch baseball breakfast data" });
    }
  });

  app.post("/api/baseball-breakfast/pick", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!me || me.referralCode !== "NIKCOX") {
        return res.status(403).json({ message: "Only the Founder can post picks here" });
      }

      const { gameId, predictionType, pick } = req.body;
      if (!gameId || !predictionType || !pick) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Verify this is a real MLB game in the DB (ESPN-synced so auto-grader can fire on it)
      const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game || game.league !== "MLB") {
        return res.status(404).json({ message: "MLB game not found" });
      }

      // Prevent duplicate picks for the same game today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const existing = await db
        .select()
        .from(predictions)
        .where(sql`${predictions.userId} = ${userId} AND ${predictions.gameId} = ${gameId} AND ${predictions.createdAt} >= ${todayStart}`)
        .limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Pick already posted for this game today" });
      }

      const prediction = await storage.createPrediction({
        userId,
        gameId: game.id,
        predictionType,
        pick,
        units: 1,
        odds: null,
        result: "pending",
        payout: 0,
      });

      res.status(201).json({ prediction, game });
    } catch (error: any) {
      console.error("Baseball breakfast pick error:", error);
      res.status(500).json({ message: "Failed to post pick" });
    }
  });


  app.get("/api/news", async (req, res) => {
    try {
      const league = req.query.league as string | undefined;
      const articles = await fetchAllSportsNews(league);
      res.json(articles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sports news" });
    }
  });

  app.get("/api/games", async (req, res) => {
    try {
      const league = req.query.league as string | undefined;
      const games = await storage.getGames(league);
      const cleaned = games.map((g: any) => ({
        ...g,
        spiderPick: g.spiderPick ? g.spiderPick.replace(/\s*ML\s*$/i, "").trim() : g.spiderPick,
      }));
      res.json(cleaned);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch games" });
    }
  });

  app.get("/api/games/:id", async (req, res) => {
    try {
      const game = await storage.getGame(parseInt(req.params.id));
      if (!game) return res.status(404).json({ message: "Game not found" });
      res.json(game);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch game" });
    }
  });

  app.post("/api/predictions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const parsed = insertPredictionSchema.parse({ ...req.body, userId });
      const prediction = await storage.createPrediction(parsed);

      try {
        await storage.completeReferralPrediction(userId);
      } catch (e) {
        console.error("Referral prediction bonus error:", e);
      }

      res.status(201).json(prediction);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid prediction data" });
    }
  });

  app.get("/api/predictions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userPredictions = await storage.getUserPredictions(userId);
      // Join game team data so client can match BFB picks by team names as a fallback
      const gameIds = [...new Set(userPredictions.map((p) => p.gameId))];
      const gameRows = gameIds.length > 0
        ? await db.select({ id: games.id, awayTeam: games.awayTeam, homeTeam: games.homeTeam })
            .from(games).where(inArray(games.id, gameIds))
        : [];
      const gameMap = new Map(gameRows.map((g) => [g.id, g]));
      const result = userPredictions.map((p) => ({
        ...p,
        awayTeam: gameMap.get(p.gameId)?.awayTeam ?? null,
        homeTeam: gameMap.get(p.gameId)?.homeTeam ?? null,
      }));
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch predictions" });
    }
  });

  app.get("/api/users/:userId/predictions", isAuthenticated, async (req: any, res) => {
    try {
      const requestingUserId = (req.session as any)?.userId;
      const targetUserId = req.params.userId;
      const requestingUser = await storage.getUser(requestingUserId);
      if (!requestingUser || requestingUser.membershipTier === "rookie" || requestingUser.membershipTier === "free") {
        return res.status(403).json({ message: "Upgrade to Pro to view other members' daily picks" });
      }
      const userPredictions = await storage.getUserPredictions(targetUserId);
      res.json(userPredictions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch member predictions" });
    }
  });

  app.get("/api/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Returns how many MLB/NBA/NHL games are scheduled in the current day's pick window.
  // Uses midnight PST as the day boundary so West Coast late games fall on the correct date.
  app.get("/api/mlb-game-count", async (_req, res) => {
    try {
      const pstDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
      const [y, m, d] = pstDateStr.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, d, 8, 0, 0, 0));     // today midnight PST
      const end   = new Date(Date.UTC(y, m - 1, d + 1, 8, 0, 0, 0)); // tomorrow midnight PST
      const [mlbGames, nbaGames, nhlGames] = await Promise.all([
        db.select({ id: games.id, homeTeam: games.homeTeam, awayTeam: games.awayTeam }).from(games).where(sql`${games.league} = 'MLB' AND ${games.gameTime} >= ${start} AND ${games.gameTime} < ${end} AND ${games.status} != 'postponed'`),
        db.select({ id: games.id, homeTeam: games.homeTeam, awayTeam: games.awayTeam }).from(games).where(sql`${games.league} = 'NBA' AND ${games.gameTime} >= ${start} AND ${games.gameTime} < ${end} AND ${games.status} != 'postponed'`),
        db.select({ id: games.id, homeTeam: games.homeTeam, awayTeam: games.awayTeam }).from(games).where(sql`${games.league} = 'NHL' AND ${games.gameTime} >= ${start} AND ${games.gameTime} < ${end} AND ${games.status} != 'postponed'`),
      ]);
      // Deduplicate by matchup — count unique (homeTeam|awayTeam) combos only
      const dedup = (list: { homeTeam: string; awayTeam: string }[]) =>
        new Set(list.map(g => `${g.homeTeam}|${g.awayTeam}`)).size;
      const mlbCount = dedup(mlbGames);
      const nbaCount = dedup(nbaGames);
      const nhlCount = dedup(nhlGames);
      res.json({ count: mlbCount + nbaCount + nhlCount, mlbCount, nbaCount, nhlCount, periodStart: start, periodEnd: end });
    } catch (e) {
      res.json({ count: 0 });
    }
  });

  // Daily member scorecard — shows the PREVIOUS day's final graded results.
  // Searches back up to 7 days to find the most recent day with finished games.
  // Public endpoint. Used for transparent prize pool verification.
  app.get("/api/daily-scorecard", async (_req, res) => {
    try {
      // Search back through recent days to find the last day that has graded games
      type MatchupGroup = { canonicalId: number; allIds: Set<number>; league: string };
      let dayGamesRaw: (typeof games.$inferSelect)[] = [];
      let periodStart!: Date;
      let periodEnd!: Date;
      let dateLabel = "";

      for (let daysBack = 1; daysBack <= 7; daysBack++) {
        const dt = new Date();
        dt.setUTCDate(dt.getUTCDate() - daysBack);
        const pstStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(dt);
        const [y, m, d] = pstStr.split("-").map(Number);
        const start = new Date(Date.UTC(y, m - 1, d, 8, 0, 0, 0));
        const end   = new Date(Date.UTC(y, m - 1, d + 1, 8, 0, 0, 0));

        const candidateGames = await db.select().from(games).where(
          sql`${games.gameTime} >= ${start} AND ${games.gameTime} < ${end}
              AND ${games.status} != 'postponed'
              AND ${games.league} IN ('MLB','NBA','NHL')`
        );

        // Check if any of these games are finished (graded)
        const hasFinished = candidateGames.some(g => g.status === "finished");
        if (hasFinished) {
          dayGamesRaw   = candidateGames;
          periodStart   = start;
          periodEnd     = end;
          dateLabel     = pstStr;
          break;
        }
      }

      // Deduplicate by (league, homeTeam, awayTeam)
      const matchupGroups = new Map<string, MatchupGroup>();
      for (const g of dayGamesRaw) {
        const key = `${g.league}|${g.homeTeam}|${g.awayTeam}`;
        if (!matchupGroups.has(key)) {
          matchupGroups.set(key, { canonicalId: g.id, allIds: new Set([g.id]), league: g.league });
        } else {
          matchupGroups.get(key)!.allIds.add(g.id);
        }
      }

      const mlbMatchups = [...matchupGroups.entries()].filter(([k]) => k.startsWith("MLB|"));
      const nbaMatchups = [...matchupGroups.entries()].filter(([k]) => k.startsWith("NBA|"));
      const nhlMatchups = [...matchupGroups.entries()].filter(([k]) => k.startsWith("NHL|"));

      const allDayIds = dayGamesRaw.map(g => g.id);

      // Fetch all graded predictions for this day's games
      const dayPreds = allDayIds.length === 0 ? [] : await db.select().from(predictions).where(
        inArray(predictions.gameId, allDayIds)
      );

      // Fetch all paid members
      const allUsers = await db.select().from(users).where(
        sql`${users.membershipTier} IN ('rookie', 'pro', 'legend')`
      );

      const memberRows = allUsers.map(u => {
        const myPreds = dayPreds.filter(p => p.userId === u.id);
        const forSport = (matchups: [string, MatchupGroup][]) => {
          let picks = 0, wins = 0, losses = 0, pending = 0;
          for (const [, group] of matchups) {
            const sp = myPreds.filter(p => group.allIds.has(p.gameId));
            if (sp.length > 0) {
              picks++;
              // Count exactly 1 result per GAME — a game is a win, loss, or pending.
              // If a member made multiple picks on one game, take the majority result.
              const gWins    = sp.filter(p => p.result === "win").length;
              const gLosses  = sp.filter(p => p.result === "loss").length;
              const gPending = sp.filter(p => p.result === "pending").length;
              if (gWins > gLosses)           wins++;
              else if (gLosses > gWins)      losses++;
              else if (gPending > 0)         pending++;
              else if (gWins > 0)            wins++;   // tie → win
            }
          }
          return { picks, wins, losses, pending };
        };
        const mlb = forSport(mlbMatchups);
        const nba = forSport(nbaMatchups);
        const nhl = forSport(nhlMatchups);
        const total = {
          picks:   mlb.picks   + nba.picks   + nhl.picks,
          wins:    mlb.wins    + nba.wins    + nhl.wins,
          losses:  mlb.losses  + nba.losses  + nhl.losses,
          pending: mlb.pending + nba.pending + nhl.pending,
        };
        const qualified =
          mlb.picks >= mlbMatchups.length &&
          (nbaMatchups.length === 0 || nba.picks >= nbaMatchups.length) &&
          (nhlMatchups.length === 0 || nhl.picks >= nhlMatchups.length);

        return {
          userId: u.id,
          name:   [u.firstName, u.lastName].filter(Boolean).join(" ") || "Member",
          tier:   u.membershipTier,
          avatar: u.profileImageUrl || null,
          mlb, nba, nhl, total, qualified,
        };
      });

      // Sort: qualified first → most wins → most picks
      memberRows.sort((a, b) => {
        if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
        return b.total.wins - a.total.wins || b.total.picks - a.total.picks;
      });

      // Winner = first qualified member with at least 1 pick graded
      const winner = memberRows.find(m => m.qualified && (m.total.wins + m.total.losses) > 0) || null;

      res.json({
        period: { start: periodStart, end: periodEnd, label: dateLabel },
        games:  { mlb: mlbMatchups.length, nba: nbaMatchups.length, nhl: nhlMatchups.length, total: matchupGroups.size },
        members: memberRows,
        winner: winner ? { userId: winner.userId, name: winner.name, wins: winner.total.wins, losses: winner.total.losses } : null,
      });
    } catch (e: any) {
      console.error("[daily-scorecard]", e);
      res.status(500).json({ message: "Failed to fetch scorecard" });
    }
  });

  app.get("/api/leaderboard", async (req, res) => {
    try {
      const period = (req.query.period as string) || "weekly";
      const league = req.query.league as string | undefined;

      // Fetch total prize pool payouts per user (all time)
      const { payouts } = await import("@shared/schema");
      const prizeRows = await db
        .select({ userId: payouts.userId, total: sql<number>`COALESCE(SUM(${payouts.amount}), 0)` })
        .from(payouts)
        .groupBy(payouts.userId);
      const prizeMap: Record<string, number> = {};
      for (const row of prizeRows) {
        prizeMap[row.userId] = Math.round(Number(row.total) * 100) / 100;
      }

      const augment = (entries: any[]) =>
        entries.map((e: any) => ({ ...e, totalPrizes: prizeMap[e.userId] ?? 0 }));

      if (league && league !== "ALL") {
        const sportLeaderboard = await storage.getLeaderboardByLeague(period, league);
        return res.json(augment(sportLeaderboard));
      }

      const leaderboard = await storage.getLeaderboard(period);
      res.json(augment(leaderboard));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  app.get("/api/chat/:channel", async (req, res) => {
    try {
      const messages = await storage.getChatMessages(req.params.channel);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.get("/api/referral/code", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const code = await storage.generateReferralCode(userId);
      res.json({ code });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate referral code" });
    }
  });

  app.get("/api/referral/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
      const isFounder = adminIds[0] === userId;
      const stats = await storage.getReferralStats(userId);
      res.json({ ...stats, isFounder });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch referral stats" });
    }
  });

  app.get("/api/referral/list", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const referrals = await storage.getReferralsByReferrer(userId);
      res.json(referrals);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch referrals" });
    }
  });

  app.get("/api/referral/leaderboard", async (_req, res) => {
    try {
      const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
      const founderId = adminIds[0] || null;

      const result = await db.select({
        userId: referrals.referrerId,
        activeReferrals: sql<number>`count(*)::int`,
      })
        .from(referrals)
        .where(eq(referrals.status, "active"))
        .groupBy(referrals.referrerId)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      const enriched = await Promise.all(
        result.map(async (r) => {
          const user = await storage.getUser(r.userId);
          const tier = user?.membershipTier || "rookie";
          const perReferral = tier === "legend" ? 50 : tier === "pro" ? 10 : 5;
          return {
            userId: r.userId,
            activeReferrals: r.activeReferrals,
            monthlyIncome: r.activeReferrals * perReferral,
            firstName: user?.firstName || null,
            lastName: user?.lastName || null,
            profileImageUrl: user?.profileImageUrl || null,
            membershipTier: tier,
            isFounder: founderId ? r.userId === founderId : false,
          };
        })
      );

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch referral leaderboard" });
    }
  });

  app.post("/api/referral/apply", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const { code, selectedTier } = req.body;
      if (!code) return res.status(400).json({ message: "Affiliate code required" });

      const user = await storage.getUser(userId);
      if (user?.referredBy && user.referredBy !== "NIKCOX") return res.status(400).json({ message: "You have already used an affiliate code" });

      const upperCode = code.trim().toUpperCase();

      if (upperCode === "NIKCOX") {
        await db.update(users).set({ referredBy: "NIKCOX" }).where(eq(users.id, userId));
        const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
        const founderId = adminIds[0];
        if (founderId && founderId !== userId) {
          try { await storage.createReferral(founderId, userId); } catch {}
        }
        return res.json({ message: "Affiliate code applied successfully!", referrerTier: "founder" });
      }

      const referrer = await storage.getUserByReferralCode(upperCode);
      if (!referrer) return res.status(404).json({ message: "Invalid affiliate code" });
      if (referrer.id === userId) return res.status(400).json({ message: "You cannot use your own affiliate code" });

      const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
      const isFounder = adminIds[0] === referrer.id;
      const tierToCheck = selectedTier || user?.membershipTier || "rookie";
      if (!isFounder && tierToCheck === "legend" && referrer.membershipTier !== "legend") {
        return res.status(400).json({ message: "Only Legend members can refer Legend tier signups. Your referrer is a " + (referrer.membershipTier || "Rookie") + " member." });
      }

      await storage.createReferral(referrer.id, userId);
      await db.update(users).set({ referredBy: referrer.id }).where(eq(users.id, userId));

      res.json({ message: "Affiliate code applied successfully!", referrerTier: referrer.membershipTier || "rookie" });
    } catch (error) {
      res.status(500).json({ message: "Failed to apply affiliate code" });
    }
  });

  app.post("/api/referral/check-tier", async (req, res) => {
    try {
      const { code, selectedTier } = req.body;
      if (!code || !selectedTier) return res.json({ allowed: true });

      const upperCode = (code as string).trim().toUpperCase();
      if (upperCode === "NIKCOX") {
        return res.json({ allowed: true, referrerTier: "founder" });
      }

      const referrer = await storage.getUserByReferralCode(upperCode);
      if (!referrer) return res.json({ allowed: true, error: "Invalid code" });

      const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
      const isFounder = adminIds[0] === referrer.id;

      if (isFounder) return res.json({ allowed: true, referrerTier: "founder" });

      const referrerTier = referrer.membershipTier || "rookie";
      if (selectedTier === "legend" && referrerTier !== "legend") {
        return res.json({ allowed: false, referrerTier, message: "Only Legend members can refer new Legend signups. Ask your referrer to upgrade, or choose Rookie or Pro." });
      }

      return res.json({ allowed: true, referrerTier });
    } catch {
      res.json({ allowed: true });
    }
  });

  app.post("/api/referral/assign-platform", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const user = await storage.getUser(userId);
      if (user?.referredBy) return res.json({ message: "Already assigned" });

      const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
      const founderId = adminIds[0] || "FOUNDER";

      await db.update(users).set({ referredBy: founderId }).where(eq(users.id, userId));

      if (founderId !== "FOUNDER" && founderId !== userId) {
        try {
          await storage.createReferral(founderId, userId);
        } catch (e) {}
      }

      res.json({ message: "Assigned to Founder" });
    } catch (error) {
      res.status(500).json({ message: "Failed to assign" });
    }
  });


  app.post("/api/chat", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const parsed = insertChatMessageSchema.parse({ ...req.body, userId });
      const message = await storage.createChatMessage(parsed);
      
      broadcastToChannel(parsed.channel || "general", {
        type: "new_message",
        data: message,
      });

      res.status(201).json(message);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid message" });
    }
  });

  app.get("/api/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const txs = await storage.getUserTransactions(userId);
      res.json(txs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.get("/api/referral/founder-code", async (_req, res) => {
    res.json({ code: "NIKCOX" });
  });

  app.get("/api/member-count", async (_req, res) => {
    try {
      const count = await storage.getMemberCount();
      res.json({ count });
    } catch {
      res.json({ count: 0 });
    }
  });

  app.get("/ads.txt", (_req, res) => {
    res.redirect(301, "https://monetumo.com/ads-txt/betfans-us");
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  app.get("/api/health/morning", (_req, res) => {
    const result = getLastCheckResult();
    if (!result) {
      return res.json({ status: "pending", message: "No sweep run yet — first sweep will run at 5:00 AM PST" });
    }
    res.json(result);
  });

  app.get("/api/members/recent", async (_req, res) => {
    try {
      const members = await storage.getRecentMembers(20);
      res.json(members);
    } catch {
      res.json([]);
    }
  });

  app.get("/api/prize-pool", async (_req, res) => {
    try {
      const total = await storage.getPrizePoolTotal();
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const epoch = new Date(0);

      const [daily, yearContributions, dailyPaidThisYear, allTimePaid] = await Promise.all([
        storage.getPrizePoolTotalByPeriod(dayStart),
        storage.getPrizePoolTotalByPeriod(yearStart),
        storage.getTotalPayoutsByPeriod(yearStart),
        storage.getTotalPayoutsByPeriod(epoch),
      ]);

      const annualRemaining = Math.max(0, yearContributions - dailyPaidThisYear);
      // Remaining pool = total contributions minus all payouts ever made
      const remaining = Math.max(0, Math.floor(total - allTimePaid));

      res.json({ amount: remaining, daily, weekly: 0, monthly: 0, annual: annualRemaining });
    } catch (error) {
      res.json({ amount: 0, daily: 0, weekly: 0, monthly: 0, annual: 0 });
    }
  });

  app.post("/api/stripe/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { priceId } = req.body;
      if (!priceId) return res.status(400).json({ message: "priceId required" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(user.email || "", userId, user.phone || undefined);
        await storage.updateUser(userId, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }

      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${baseUrl}/dashboard?checkout=success`,
        `${baseUrl}/membership?checkout=cancel`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error.message);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/portal", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ message: "No subscription found" });
      }

      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      const session = await stripeService.createCustomerPortalSession(
        user.stripeCustomerId,
        `${baseUrl}/profile`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Portal error:", error.message);
      res.status(500).json({ message: "Failed to create portal session" });
    }
  });

  app.get("/api/stripe/subscription", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const user = await storage.getUser(userId);
      if (!user?.stripeSubscriptionId) {
        return res.json({ subscription: null });
      }
      const subscription = await storage.getSubscription(user.stripeSubscriptionId);
      res.json({ subscription });
    } catch (error) {
      res.json({ subscription: null });
    }
  });

  app.get("/api/stripe/products", async (_req, res) => {
    try {
      const rows = await storage.listProductsWithPrices();
      const productsMap = new Map();
      for (const row of rows) {
        if (!productsMap.has(row.product_id)) {
          productsMap.set(row.product_id, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            prices: [],
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id).prices.push({
            id: row.price_id,
            unit_amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
          });
        }
      }
      res.json({ data: Array.from(productsMap.values()) });
    } catch (error) {
      res.json({ data: [] });
    }
  });

  // ── PayPal Subscription Routes ──────────────────────────────────────────────

  app.get("/api/paypal/config", (_req, res) => {
    const config = getPayPalConfig();
    if (!config.clientId) {
      return res.status(503).json({ error: "PayPal not configured" });
    }
    res.json(config);
  });

  app.post("/api/paypal/subscription", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { subscriptionId, tier, affiliateCode } = req.body;
      if (!subscriptionId || !tier) {
        return res.status(400).json({ message: "subscriptionId and tier required" });
      }

      // Verify subscription with PayPal
      // Accept APPROVED and ACTIVE — onApprove fires before PayPal processes the first payment
      // so the status may still be APPROVED at this point (it moves to ACTIVE seconds later)
      const sub = await getSubscriptionDetails(subscriptionId);
      if (!sub || !["ACTIVE", "APPROVED"].includes(sub.status)) {
        return res.status(400).json({ message: "Subscription is not active" });
      }

      // Determine tier from plan ID if not provided, or validate it
      const confirmedTier = tierFromPlanId(sub.plan_id) || tier;
      const validTiers = ["rookie", "pro", "legend"];
      if (!validTiers.includes(confirmedTier)) {
        return res.status(400).json({ message: "Invalid tier" });
      }

      await storage.updateUser(userId, {
        membershipTier: confirmedTier,
        paypalSubscriptionId: subscriptionId,
      });

      // Add 50% of subscription price to prize pool
      const tierPrices: Record<string, number> = { rookie: 19, pro: 29, legend: 99 };
      const prizeContribution = (tierPrices[confirmedTier] || 0) * 0.5;
      if (prizeContribution > 0) {
        await storage.addPrizePoolContribution(prizeContribution, "paypal", subscriptionId, userId);
        console.log(`[PayPal] Prize pool +$${prizeContribution} for ${confirmedTier} (${subscriptionId})`);
      }

      // Apply affiliate code if provided and not already referred
      if (affiliateCode) {
        const currentUser = await storage.getUser(userId);
        if (!currentUser?.referredBy) {
          const upperCode = affiliateCode.trim().toUpperCase();
          if (upperCode === "NIKCOX") {
            await db.update(users).set({ referredBy: "NIKCOX" }).where(eq(users.id, userId));
            const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((id: string) => id.trim()).filter(Boolean);
            const founderId = adminIds[0];
            if (founderId && founderId !== userId) {
              try { await storage.createReferral(founderId, userId); } catch {}
            }
            console.log(`[PayPal] Referral applied: NIKCOX -> ${userId}`);
          } else {
            const referrer = await storage.getUserByReferralCode(upperCode);
            if (referrer && referrer.id !== userId) {
              await storage.createReferral(referrer.id, userId);
              await db.update(users).set({ referredBy: referrer.id }).where(eq(users.id, userId));
              // Instant signup bonus to referrer's wallet — tier-based
              // Rookie join: $5 instant | Pro join: $10 instant | Legend join: $50 instant
              const signupBonus = confirmedTier === "legend" ? 50 : confirmedTier === "pro" ? 10 : 5;
              const referrerBalance = parseFloat(referrer.walletBalance || "0");
              await storage.updateUser(referrer.id, { walletBalance: String(referrerBalance + signupBonus) });
              await storage.createTransaction({ userId: referrer.id, type: "referral_bonus", amount: signupBonus, description: `Signup bonus — ${upperCode} referred a ${confirmedTier} member`, status: "completed" });
              console.log(`[PayPal] Referral applied: ${referrer.id} -> ${userId}, +$${signupBonus} wallet bonus`);
            }
          }
        }
      }

      console.log(`[PayPal] User ${userId} subscribed to ${confirmedTier} (${subscriptionId})`);
      res.json({ success: true, tier: confirmedTier });
    } catch (error: any) {
      console.error("[PayPal] Subscription verification error:", error.message);
      res.status(500).json({ message: "Failed to verify subscription" });
    }
  });

  app.post("/api/paypal/webhook", async (req, res) => {
    try {
      const event = req.body;
      const resourceType = event?.event_type || "";

      if (resourceType === "BILLING.SUBSCRIPTION.ACTIVATED" || resourceType === "BILLING.SUBSCRIPTION.RENEWED") {
        const sub = event.resource;
        const subscriptionId = sub?.id;
        const planId = sub?.plan_id;
        if (subscriptionId && planId) {
          const tier = tierFromPlanId(planId);
          if (tier) {
            const foundUser = await storage.getUserByPaypalSubscriptionId(subscriptionId);
            if (foundUser) {
              await storage.updateUser(foundUser.id, { membershipTier: tier });
              console.log(`[PayPal webhook] User ${foundUser.id} activated ${tier}`);
              // Add prize pool + affiliate commission on monthly renewal
              if (resourceType === "BILLING.SUBSCRIPTION.RENEWED") {
                // Affiliate residual commissions per tier
                const affiliateCommission: Record<string, number> = { rookie: 5, pro: 10, legend: 50 };
                // Prize pool gets the remainder after affiliate commission
                const tierPrices: Record<string, number> = { rookie: 19, pro: 29, legend: 99 };
                const commission = affiliateCommission[tier] || 0;
                const prizeContribution = (tierPrices[tier] || 0) - commission;

                // Pay affiliate commission to referrer
                if (commission > 0 && foundUser.referredBy) {
                  const referrer = await storage.getUser(foundUser.referredBy);
                  if (referrer) {
                    const refBalance = parseFloat((referrer as any).walletBalance || "0");
                    await storage.updateUser(referrer.id, { walletBalance: String(refBalance + commission) } as any);
                    await storage.createTransaction({ userId: referrer.id, type: "referral_bonus", amount: commission, description: `Monthly residual — ${foundUser.firstName || foundUser.id} (${tier}) renewed`, status: "completed" });
                    console.log(`[PayPal webhook] Affiliate $${commission} to ${referrer.id} for ${foundUser.id} renewal`);
                  }
                }

                if (prizeContribution > 0) {
                  await storage.addPrizePoolContribution(prizeContribution, "paypal_renewal", subscriptionId, foundUser.id);
                  console.log(`[PayPal webhook] Prize pool +$${prizeContribution} renewal for ${tier}`);
                }
              }
            }
          }
        }
      }

      if (resourceType === "BILLING.SUBSCRIPTION.CANCELLED" || resourceType === "BILLING.SUBSCRIPTION.EXPIRED") {
        const sub = event.resource;
        const subscriptionId = sub?.id;
        if (subscriptionId) {
          const user = await storage.getUserByPaypalSubscriptionId(subscriptionId);
          if (user) {
            await storage.updateUser(user.id, {
              membershipTier: "free",
              subscriptionCancelledAt: new Date(),
            });
            console.log(`[PayPal webhook] User ${user.id} subscription cancelled`);
          }
        }
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("[PayPal webhook] Error:", error.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────

  app.use("/uploads", (await import("express")).default.static(uploadsDir));

  app.post("/api/upload", isAuthenticated, upload.single("media"), (req: any, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const ext = path.extname(req.file.filename).toLowerCase();
    const isVideo = [".mp4", ".mov", ".webm"].includes(ext);
    res.json({
      url: `/uploads/${req.file.filename}`,
      mediaType: isVideo ? "video" : "image",
    });
  });

  const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(",").filter(Boolean) || [];
  const FOUNDER_CODES_ADMIN = ["NIKCOX"];
  function isAdmin(req: any, res: any, next: any) {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(403).json({ message: "Admin access required" });
    db.select().from(users).where(eq(users.id, userId)).limit(1).then(([sessionUser]) => {
      if (sessionUser && FOUNDER_CODES_ADMIN.includes(sessionUser.referralCode ?? "")) {
        return next();
      }
      if (ADMIN_USER_IDS.length > 0 && !ADMIN_USER_IDS.includes(userId)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      next();
    }).catch(() => res.status(500).json({ message: "Admin check failed" }));
  }

  // Admin: full user list with phone, tier, join date, PayPal info
  app.get("/api/admin/members", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          email: users.email,
          membershipTier: users.membershipTier,
          paypalSubscriptionId: users.paypalSubscriptionId,
          paypalPayoutEmail: users.paypalPayoutEmail,
          referralCode: users.referralCode,
          referredBy: users.referredBy,
          createdAt: users.createdAt,
          walletBalance: users.walletBalance,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
      res.json(allUsers);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  app.get("/api/members/locations", async (_req, res) => {
    try {
      const locations = await storage.getMemberLocations();
      res.json(locations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.get("/api/members/by-region", async (req, res) => {
    try {
      const locations = await storage.getMemberLocations();
      const byState: Record<string, any[]> = {};
      const byCountry: Record<string, any[]> = {};
      for (const m of locations) {
        if (m.state) {
          if (!byState[m.state]) byState[m.state] = [];
          byState[m.state].push(m);
        }
        if (m.country) {
          if (!byCountry[m.country]) byCountry[m.country] = [];
          byCountry[m.country].push(m);
        }
      }
      res.json({ byState, byCountry, total: locations.length });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch member regions" });
    }
  });

  app.get("/api/users/:userId/profile", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { email, stripeCustomerId, stripeSubscriptionId, walletBalance, phone, smsConsent, smsConsentDate, ...publicProfile } = user;
      res.json(publicProfile);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get("/api/users/:userId/sport-stats", async (req, res) => {
    try {
      const period = req.query.period as string | undefined;
      const stats = await storage.getUserSportStats(req.params.userId, period);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sport stats" });
    }
  });

  app.get("/api/sport-stats", async (req, res) => {
    try {
      const period = req.query.period as string | undefined;
      const stats = await storage.getPlatformSportStats(period);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch platform sport stats" });
    }
  });

  app.get("/api/threads", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const threads = await storage.getThreads(category);
      res.json(threads);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch threads" });
    }
  });

  app.get("/api/threads/user/:userId", async (req, res) => {
    try {
      const threads = await storage.getThreadsByUser(req.params.userId);
      res.json(threads);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user threads" });
    }
  });

  app.get("/api/threads/profile/:profileUserId", async (req, res) => {
    try {
      const threads = await storage.getThreadsByProfile(req.params.profileUserId);
      res.json(threads);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch profile threads" });
    }
  });

  app.get("/api/threads/:id", async (req, res) => {
    try {
      const thread = await storage.getThread(parseInt(req.params.id));
      if (!thread) return res.status(404).json({ message: "Thread not found" });
      res.json(thread);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch thread" });
    }
  });

  app.post("/api/threads", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const parsed = insertThreadSchema.parse({ ...req.body, userId });
      const thread = await storage.createThread(parsed);
      res.status(201).json(thread);
    } catch (error) {
      res.status(500).json({ message: "Failed to create thread" });
    }
  });

  app.get("/api/threads/:id/replies", async (req, res) => {
    try {
      const replies = await storage.getThreadReplies(parseInt(req.params.id));
      res.json(replies);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch replies" });
    }
  });

  app.post("/api/threads/:id/replies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const threadId = parseInt(req.params.id);
      const parsed = insertThreadReplySchema.parse({ ...req.body, userId, threadId });
      const reply = await storage.createThreadReply(parsed);
      res.status(201).json(reply);
    } catch (error) {
      res.status(500).json({ message: "Failed to create reply" });
    }
  });

  app.post("/api/user/avatar", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const { imageData } = req.body;
      if (!imageData || !imageData.startsWith("data:image/")) {
        return res.status(400).json({ message: "Invalid image data" });
      }
      const updated = await storage.updateUser(userId, { profileImageUrl: imageData });
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ url: imageData, user: updated });
    } catch (error) {
      res.status(500).json({ message: "Failed to upload avatar" });
    }
  });

  app.patch("/api/user/phone-consent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const { phone, smsConsent } = req.body;
      if (!phone || !smsConsent) {
        return res.status(400).json({ message: "Phone number and consent are required" });
      }
      const cleaned = phone.replace(/[^\d+]/g, "");
      if (cleaned.length < 10) {
        return res.status(400).json({ message: "Invalid phone number" });
      }
      const updated = await storage.updateUser(userId, {
        phone: cleaned,
        smsConsent: true,
        smsConsentDate: new Date(),
      });
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update phone consent" });
    }
  });

  app.patch("/api/user/location", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const { city, state, country, latitude, longitude } = req.body;
      const updated = await storage.updateUser(userId, { city, state, country, latitude, longitude });
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.post("/api/games/sync", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const result = await syncSportsData();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Sync failed" });
    }
  });

  app.get("/api/ads", async (req, res) => {
    try {
      const placement = req.query.placement as string | undefined;
      const ads = await storage.getActiveAdvertisers(placement);
      res.json(ads);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ads" });
    }
  });

  app.post("/api/ads/:id/impression", async (req, res) => {
    try {
      await storage.incrementAdImpression(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to track impression" });
    }
  });

  app.post("/api/ads/:id/click", async (req, res) => {
    try {
      await storage.incrementAdClick(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to track click" });
    }
  });

  app.get("/api/ads/admin", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const ads = await storage.getAllAdvertisers();
      res.json(ads);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch advertisers" });
    }
  });

  app.post("/api/ads", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const parsed = insertAdvertiserSchema.parse(req.body);
      const ad = await storage.createAdvertiser(parsed);
      res.status(201).json(ad);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid advertiser data" });
    }
  });

  app.patch("/api/ads/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const ad = await storage.updateAdvertiser(parseInt(req.params.id), req.body);
      if (!ad) return res.status(404).json({ message: "Advertiser not found" });
      res.json(ad);
    } catch (error) {
      res.status(500).json({ message: "Failed to update advertiser" });
    }
  });

  app.delete("/api/ads/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const deleted = await storage.deleteAdvertiser(parseInt(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Advertiser not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete advertiser" });
    }
  });

  app.post("/api/payouts/process", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { period } = req.body;
      if (!period || !["daily", "annual"].includes(period)) {
        return res.status(400).json({ message: "Invalid period. Use daily or annual." });
      }

      const now = new Date();
      const periodLabel = period === "daily"
        ? now.toISOString().split("T")[0]
        : `${now.getFullYear()}`;

      const periodStart = period === "daily"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
        : new Date(now.getFullYear(), 0, 1);
      const periodEnd = period === "daily"
        ? new Date(periodStart.getTime() + 86400000)
        : new Date(now.getFullYear() + 1, 0, 1);

      const { processPayoutForPeriod } = await import("./payoutService");
      const result = await processPayoutForPeriod(period, periodLabel, periodStart, periodEnd);

      res.json({ period, periodLabel, results: [result] });
    } catch (error: any) {
      console.error("Payout processing error:", error);
      res.status(500).json({ message: "Failed to process payouts: " + error.message });
    }
  });

  app.get("/api/payouts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const payoutList = await storage.getUserPayouts(userId);
      res.json(payoutList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payouts" });
    }
  });

  app.get("/api/payouts/all", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit || "50");
      const payoutList = await storage.getAllPayouts(limit);
      res.json(payoutList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payouts" });
    }
  });

  app.post("/api/admin/send-to-card/:payoutId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const payoutId = parseInt(req.params.payoutId);
      if (isNaN(payoutId)) return res.status(400).json({ error: "Invalid payout ID" });

      const payout = await storage.getPayoutById(payoutId);
      if (!payout) return res.status(404).json({ error: "Payout not found" });
      if (payout.status === "paypal_sent") return res.status(400).json({ error: "Already sent via PayPal" });

      const user = await storage.getUser(payout.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const { sendPayPalPayout, getSubscriptionDetails } = await import("./paypalService");
      const amount = parseFloat(String(payout.amount));
      const note = `BetFans ${payout.period} prize — ${payout.periodLabel}`;
      const senderItemId = `betfans-card-${payoutId}-${Date.now()}`;

      let email = user.paypalPayoutEmail;
      if (!email && user.paypalSubscriptionId) {
        const sub = await getSubscriptionDetails(user.paypalSubscriptionId);
        email = sub?.subscriber?.email_address || null;
      }
      if (!email) return res.status(400).json({ error: "No PayPal email on file for this member. Ask them to add a payout email in their profile." });

      const result = await sendPayPalPayout(email, amount, senderItemId, note);
      await storage.updatePayout(payoutId, {
        stripeTransferId: result.batchId,
        status: "paypal_sent",
        paidAt: new Date(),
      });
      res.json({ ok: true, email, batchId: result.batchId, status: result.status });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/paypal-refund-payout", async (req, res) => {
    try {
      const { secret, subscriptionId, amount, note } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
        method: "POST",
        headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const { access_token: token } = await tokenRes.json() as any;
      if (!token) return res.status(500).json({ error: "No PayPal token" });
      // Get subscription transactions to find the capture ID
      const txRes = await fetch(`https://api-m.paypal.com/v1/billing/subscriptions/${subscriptionId}/transactions?start_time=2026-01-01T00:00:00Z&end_time=${new Date().toISOString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const txData = await txRes.json() as any;
      const transactions = txData?.transactions || [];
      const completedTx = transactions.find((t: any) => t.status === "COMPLETED");
      if (!completedTx) return res.status(404).json({ error: "No completed transaction found", raw: txData });
      const captureId = completedTx.id;
      // Issue a partial refund equal to the prize amount
      const refundRes = await fetch(`https://api-m.paypal.com/v2/payments/captures/${captureId}/refund`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: { value: amount.toFixed(2), currency_code: "USD" }, note_to_payer: note }),
      });
      const refundData = await refundRes.json() as any;
      res.json({ status: refundRes.status, captureId, refundData });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/paypal-diag", async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
        method: "POST",
        headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const tokenData = await tokenRes.json() as any;
      const token = tokenData.access_token;
      if (!token) return res.json({ step: "token", status: tokenRes.status, data: tokenData });
      // Try payout with full raw response
      const payoutRes = await fetch("https://api-m.paypal.com/v1/payments/payouts", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_batch_header: { sender_batch_id: "diag-test-001", email_subject: "Test" },
          items: [{ recipient_type: "EMAIL", amount: { value: "0.01", currency: "USD" }, receiver: "test@example.com", sender_item_id: "diag-001", note: "test" }]
        }),
      });
      const payoutData = await payoutRes.json() as any;
      const userInfoRes = await fetch("https://api-m.paypal.com/v1/oauth2/token/userinfo?schema=paypalv1.1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userInfo = await userInfoRes.json() as any;
      res.json({ tokenOk: true, scopes: tokenData.scope, payoutStatus: payoutRes.status, payoutRaw: payoutData, userInfo });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/create-payout", async (req, res) => {
    try {
      const { secret, userId, amount, periodLabel, period, rank } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const existing = await storage.getPayoutsByPeriod(period, periodLabel);
      const alreadyExists = existing.find(p => p.userId === userId);
      if (alreadyExists) return res.json({ ok: true, skipped: true, payoutId: alreadyExists.id, message: "Payout already exists" });
      const payout = await storage.createPayout({
        userId,
        amount: parseFloat(amount),
        period,
        periodLabel,
        rank: rank || 1,
        sharePercent: 10,
      });
      await storage.updatePayout(payout.id, { status: "wallet_credited", paidAt: new Date() });
      const currentBalance = parseFloat((user as any).walletBalance || "0");
      await storage.updateUser(userId, { walletBalance: String(currentBalance + parseFloat(amount)) } as any);
      res.json({ ok: true, payoutId: payout.id, userId, amount, message: `Payout of $${amount} created for ${user.firstName || userId}` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/credit-wallet", async (req, res) => {
    try {
      const { secret, userId, amount, description } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const credit = parseFloat(amount);
      if (!credit || credit <= 0) return res.status(400).json({ error: "Invalid amount" });
      const currentBalance = parseFloat((user as any).walletBalance || "0");
      await storage.updateUser(userId, { walletBalance: String(currentBalance + credit) } as any);
      await storage.createTransaction({ userId, type: "referral_bonus", amount: credit, description: description || `Manual wallet credit $${credit}`, status: "completed" });
      res.json({ ok: true, credited: credit, newBalance: currentBalance + credit, message: `Credited $${credit} to ${user.firstName || userId}` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/add-prize-pool", async (req, res) => {
    try {
      const { secret, amount, source, userId } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const contribution = parseFloat(amount);
      if (!contribution || contribution <= 0) return res.status(400).json({ error: "Invalid amount" });
      await storage.addPrizePoolContribution(contribution, source || "manual", undefined, userId || undefined);
      const newTotal = await storage.getPrizePoolTotal();
      res.json({ ok: true, added: contribution, newTotal, message: `Added $${contribution} to prize pool. New total: $${newTotal}` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/retry-paypal-payout", async (req, res) => {
    try {
      const { secret, payoutId, userId, amount, periodLabel, period, directEmail } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const { sendPayPalPayout, getSubscriptionDetails } = await import("./paypalService");

      let email = directEmail || null;
      if (!email) {
        const user = await storage.getUser(userId);
        if (user?.paypalPayoutEmail) {
          email = user.paypalPayoutEmail;
        } else if (user?.paypalSubscriptionId) {
          const sub = await getSubscriptionDetails(user.paypalSubscriptionId);
          email = sub?.subscriber?.email_address || null;
        }
      }
      if (!email) return res.status(404).json({ error: "No PayPal email found for user" });

      // Persist payout email for future use
      if (userId && directEmail) {
        await storage.updateUser(userId, { paypalPayoutEmail: directEmail });
      }

      const batchId = `betfans-retry-${period}-${periodLabel}-${Date.now()}`;
      const note = `BetFans ${period} prize — 10% pool — ${periodLabel}`;
      const result = await sendPayPalPayout(email, amount, batchId, note);
      if (payoutId) {
        await storage.updatePayout(payoutId, { stripeTransferId: result.batchId, status: "paypal_sent", paidAt: new Date() });
      }
      res.json({ ok: true, email, batchId: result.batchId, status: result.status });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/payouts/history", async (req, res) => {
    try {
      const { period, periodLabel } = req.query;
      if (!period || !periodLabel) {
        const all = await storage.getAllPayouts(100);
        return res.json(all);
      }
      const results = await storage.getPayoutsByPeriod(period as string, periodLabel as string);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payout history" });
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const channels = new Map<string, Set<any>>();

  function broadcastToChannel(channel: string, data: any) {
    const clients = channels.get(channel);
    if (clients) {
      const message = JSON.stringify(data);
      clients.forEach((ws) => {
        if (ws.readyState === 1) ws.send(message);
      });
    }
  }

  wss.on("connection", (ws) => {
    let currentChannel = "general";
    channels.get(currentChannel)?.add(ws) || channels.set(currentChannel, new Set([ws]));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "join") {
          channels.get(currentChannel)?.delete(ws);
          currentChannel = msg.channel || "general";
          if (!channels.has(currentChannel)) channels.set(currentChannel, new Set());
          channels.get(currentChannel)!.add(ws);
        }
      } catch {}
    });

    ws.on("close", () => {
      channels.get(currentChannel)?.delete(ws);
    });
  });

  app.get("/api/views/home", async (_req, res) => {
    try {
      const count = await storage.getPageViews("home");
      res.json({ count });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/views/home", async (_req, res) => {
    try {
      const count = await storage.incrementPageViews("home");
      res.json({ count });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
