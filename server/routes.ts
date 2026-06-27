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
import { syncSportsData, gradeStuckGames as _gradeStuckGames, autoGradePredictions, refreshBFBRecord } from "./sportsDataService";
import { getLastCheckResult } from "./morningCheck";
import { fetchAllSportsNews } from "./sportsNewsService";
import path from "path";
import fs from "fs";

const uploadsDir = path.join(process.cwd(), "uploads");

// ── Suspended accounts — blocked from submitting picks and re-subscribing ──
// Add user IDs here to permanently lock an account without deleting it.
const SUSPENDED_USERS = new Set<string>([
  "550e8400-e29b-41d4-a716-446655440003", // Ian — unauthorized Legend access
]);
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
      // Both the canonical Nikco UUID and the legacy seed UUID are recognised as founder
      const FOUNDER_UUIDS = new Set(["aa5b3efa-fb3e-49b1-9f60-983bcec7d67a", "29b670b7-5296-44dc-a0a0-aec0d878ef9b"]);
      const callerIsFounder = !!callerId && (FOUNDER_UUIDS.has(callerId) || (!!founder && callerId === founder.id));

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
      let dbMlbGames = await storage.getGames("MLB");

      // Self-heal: if no MLB games in DB yet (e.g. 5am sweep failed or ran before ESPN published),
      // trigger a live sync right now so BFB always shows games first thing in the morning.
      if (dbMlbGames.length === 0) {
        console.log("[BFB] No MLB games in DB for today — triggering on-demand sync");
        try {
          await syncSportsData();
          dbMlbGames = await storage.getGames("MLB");
          console.log(`[BFB] On-demand sync complete — ${dbMlbGames.length} game(s) now available`);
        } catch (syncErr) {
          console.error("[BFB] On-demand sync failed:", syncErr);
        }
      }

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

      // --- Founder BFB YTD stats — auto-computed by refreshBFBRecord() after each grading run ---
      // Fixed permanent seed (269W-222L, pre-app picks) + all in-app graded MLB picks = live total.
      // refreshBFBRecord() writes to leaderboard_entries with period = "bfb_ytd" every grading cycle.
      let stats = { wins: 434, losses: 380, profit: 45, roi: 0, streak: 5, totalPicks: 814 };
      stats.roi = Math.round((stats.wins / stats.totalPicks) * 1000) / 10;
      if (founder) {
        try {
          // Always refresh from graded picks so the record stays current without manual updates
          await refreshBFBRecord();
          const [entry] = await db
            .select()
            .from(leaderboardEntries)
            .where(and(eq(leaderboardEntries.userId, founder.id), eq(leaderboardEntries.period, "bfb_ytd")))
            .limit(1);
          if (entry) {
            const w = entry.wins ?? stats.wins;
            const l = entry.losses ?? stats.losses;
            const total = w + l;
            stats = {
              wins: w, losses: l,
              profit: entry.profit ?? 45,
              roi: total > 0 ? Math.round((w / total) * 1000) / 10 : 0,
              streak: entry.streak ?? 5,
              totalPicks: total,
            };
          }
        } catch (e) {
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
        callerIsFounder,
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
      console.log(`[BFB pick] userId from session: ${userId}`);
      const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      console.log(`[BFB pick] user found: ${me?.id}, referralCode: ${me?.referralCode}`);
      const BFB_FOUNDER_UUIDS = new Set(["aa5b3efa-fb3e-49b1-9f60-983bcec7d67a", "29b670b7-5296-44dc-a0a0-aec0d878ef9b"]);
      if (!me || (me.referralCode !== "NIKCOX" && !BFB_FOUNDER_UUIDS.has(me.id))) {
        console.log(`[BFB pick] BLOCKED — user ${userId} is not founder`);
        return res.status(403).json({ message: "Only the Founder can post picks here" });
      }

      const { gameId, predictionType, pick, homeTeam, awayTeam } = req.body;
      console.log(`[BFB pick] body: gameId=${gameId} type=${predictionType} pick=${pick} teams=${awayTeam}@${homeTeam}`);
      if (!gameId || !predictionType || !pick) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Verify this is a real MLB game in the DB (ESPN-synced so auto-grader can fire on it)
      // Primary: look up by ID. Fallback: if games were re-synced (new IDs), find by team names for today.
      let [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if ((!game || game.league !== "MLB") && homeTeam && awayTeam) {
        // Fallback: find today's game by team names
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
        const todayRows = await storage.getGames("MLB");
        const matched = todayRows.find(g =>
          norm(g.homeTeam).includes(norm(homeTeam).slice(-6)) &&
          norm(g.awayTeam).includes(norm(awayTeam).slice(-6))
        );
        if (matched) {
          game = matched as any;
          console.log(`[BFB pick] gameId ${gameId} not found — resolved via team names to gameId ${game.id}`);
        }
      }
      console.log(`[BFB pick] game found: ${game?.id}, league: ${game?.league}`);
      if (!game || game.league !== "MLB") {
        return res.status(404).json({ message: "MLB game not found" });
      }

      // Block picks after game has started
      const nowBfb = new Date();
      const gameStartedBfb = game.gameTime && new Date(game.gameTime) <= nowBfb;
      const gameLockedBfb = gameStartedBfb || game.status === "live" || game.status === "finished";
      if (gameLockedBfb) {
        return res.status(422).json({ message: "This game has already started — picks are locked." });
      }

      // Prevent duplicate picks for the same game today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const existing = await db
        .select()
        .from(predictions)
        .where(sql`${predictions.userId} = ${userId} AND ${predictions.gameId} = ${gameId} AND ${predictions.createdAt} >= ${todayStart}`)
        .limit(1);

      let prediction;
      if (existing.length > 0) {
        // Allow changing pick before game starts — update in place
        if (existing[0].result !== "pending") {
          return res.status(409).json({ message: "Cannot change a pick after it has been graded" });
        }
        await db.update(predictions)
          .set({ pick, predictionType, updatedAt: new Date() })
          .where(eq(predictions.id, existing[0].id));
        prediction = { ...existing[0], pick, predictionType };
        console.log(`[BFB pick] Updated existing pick for game ${gameId}: ${pick}`);
      } else {
        prediction = await storage.createPrediction({
          userId,
          gameId: game.id,
          predictionType,
          pick,
          units: 1,
          odds: null,
          result: "pending",
          payout: 0,
        });
      }

      res.status(201).json({ prediction, game });
    } catch (error: any) {
      console.error("Baseball breakfast pick error:", error);
      res.status(500).json({ message: "Failed to post pick" });
    }
  });


  // ─── My BFB — Member personal MLB pick-em ────────────────────────────────
  app.get("/api/my-bfb", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;

      // Today's date in ET
      const etParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date()).split("/");
      const dateStr = `${etParts[2]}-${etParts[0]}-${etParts[1]}`;
      const etDateESPN = `${etParts[2]}${etParts[0]}${etParts[1]}`;
      const [ey, em, ed] = dateStr.split("-").map(Number);
      const todayStart = new Date(Date.UTC(ey, em - 1, ed, 4, 0, 0));
      const todayEnd   = new Date(Date.UTC(ey, em - 1, ed + 1, 4, 0, 0));

      function normalize(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ""); }
      function teamMatch(a: string, b: string) {
        const na = normalize(a), nb = normalize(b);
        return na === nb || na.includes(nb.slice(-6)) || nb.includes(na.slice(-6));
      }

      // Today's MLB games from DB
      let dbMlbGames = await storage.getGames("MLB");
      if (dbMlbGames.length === 0) {
        try { await syncSportsData(); dbMlbGames = await storage.getGames("MLB"); } catch {}
      }

      // Live ESPN status
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
            espnStatusMap.set(`${awayComp.team.displayName}|${homeComp.team.displayName}`, {
              status, homeScore: homeComp.score ? parseInt(homeComp.score) : null,
              awayScore: awayComp.score ? parseInt(awayComp.score) : null,
            });
          }
        }
      } catch {}

      // Pitcher data
      const mlbApiGames = await fetchMLBSchedule(dateStr);

      // Member's BFB picks for today
      const todayPicks = await db.select().from(predictions).where(
        sql`${predictions.userId} = ${userId} AND ${predictions.predictionType} = 'bfb' AND ${predictions.createdAt} >= ${todayStart} AND ${predictions.createdAt} <= ${todayEnd}`
      );

      // All-time BFB record for this member
      const allBfbPicks = await db.select().from(predictions).where(
        sql`${predictions.userId} = ${userId} AND ${predictions.predictionType} = 'bfb'`
      );
      const wins   = allBfbPicks.filter(p => p.result === "win").length;
      const losses = allBfbPicks.filter(p => p.result === "loss").length;
      const pushes = allBfbPicks.filter(p => p.result === "push").length;
      const total  = wins + losses + pushes;
      const winPct = total > 0 ? Math.round((wins / (wins + losses || 1)) * 1000) / 10 : 0;
      // Streak: walk through most-recent first
      let streak = 0;
      const sorted = [...allBfbPicks].filter(p => p.result !== "pending").sort((a, b) =>
        new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
      );
      if (sorted.length > 0) {
        const dir = sorted[0].result;
        for (const p of sorted) { if (p.result === dir) streak++; else break; }
        if (dir === "loss" || dir === "push") streak = -streak;
      }

      // Founder record for "beat this" display
      const [founderRow] = await db.select().from(users).where(eq(users.referralCode, "NIKCOX")).limit(1);
      let founderRecord = { wins: 0, losses: 0 };
      if (founderRow) {
        const [entry] = await db.select().from(leaderboardEntries)
          .where(and(eq(leaderboardEntries.userId, founderRow.id), eq(leaderboardEntries.period, "bfb_ytd")))
          .limit(1);
        if (entry) founderRecord = { wins: entry.wins ?? 0, losses: entry.losses ?? 0 };
      }

      const gamesOut = dbMlbGames.map((g) => {
        const apiGame = mlbApiGames.find((a: any) => teamMatch(g.homeTeam, a.homeTeam) && teamMatch(g.awayTeam, a.awayTeam));
        const liveESPN = espnStatusMap.get(`${g.awayTeam}|${g.homeTeam}`);
        const liveStatus = liveESPN?.status || g.status;
        const myPick = todayPicks.find(p => p.gameId === g.id) || null;
        return {
          gameId: g.id,
          homeTeam: g.homeTeam, awayTeam: g.awayTeam,
          homeAbbr: apiGame?.homeAbbr || g.homeTeam.split(" ").pop() || "",
          awayAbbr: apiGame?.awayAbbr || g.awayTeam.split(" ").pop() || "",
          gameTime: g.gameTime,
          status: liveStatus === "finished" ? "Final" : liveStatus === "live" ? "Live" : "Upcoming",
          homeScore: liveESPN?.homeScore ?? g.homeScore,
          awayScore: liveESPN?.awayScore ?? g.awayScore,
          inning: apiGame?.inning || null, inningHalf: apiGame?.inningHalf || null,
          homePitcher: apiGame?.homePitcher || g.homePitcher || null,
          awayPitcher: apiGame?.awayPitcher || g.awayPitcher || null,
          myPick: myPick ? { pick: myPick.pick, result: myPick.result } : null,
          locked: !!(liveStatus === "live" || liveStatus === "finished" || (g.gameTime && new Date(g.gameTime) <= new Date())),
        };
      });

      res.json({
        games: gamesOut,
        record: { wins, losses, pushes, total, winPct, streak },
        founderRecord,
        date: dateStr,
      });
    } catch (err: any) {
      console.error("[my-bfb] error:", err.message);
      res.status(500).json({ message: "Failed to load My BFB" });
    }
  });

  app.post("/api/my-bfb/pick", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const { gameId, pick, homeTeam, awayTeam } = req.body;
      if (!gameId || !pick) return res.status(400).json({ message: "Missing gameId or pick" });

      // Verify it's a real MLB game
      let [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if ((!game || game.league !== "MLB") && homeTeam && awayTeam) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
        const todayRows = await storage.getGames("MLB");
        const matched = todayRows.find(g =>
          norm(g.homeTeam).includes(norm(homeTeam).slice(-6)) &&
          norm(g.awayTeam).includes(norm(awayTeam).slice(-6))
        );
        if (matched) game = matched as any;
      }
      if (!game || game.league !== "MLB") return res.status(404).json({ message: "MLB game not found" });

      // Lock after game starts
      if (game.gameTime && new Date(game.gameTime) <= new Date()) {
        return res.status(422).json({ message: "Game has already started — picks are locked." });
      }
      if (game.status === "live" || game.status === "finished") {
        return res.status(422).json({ message: "Game has already started — picks are locked." });
      }

      // Upsert today's bfb pick for this game
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const existing = await db.select().from(predictions).where(
        sql`${predictions.userId} = ${userId} AND ${predictions.gameId} = ${game.id} AND ${predictions.predictionType} = 'bfb' AND ${predictions.createdAt} >= ${todayStart}`
      ).limit(1);

      let prediction;
      if (existing.length > 0) {
        if (existing[0].result !== "pending") return res.status(409).json({ message: "Pick already graded — cannot change." });
        await db.update(predictions).set({ pick, updatedAt: new Date() }).where(eq(predictions.id, existing[0].id));
        prediction = { ...existing[0], pick };
      } else {
        prediction = await storage.createPrediction({
          userId, gameId: game.id, predictionType: "bfb", pick, units: 1, odds: null, result: "pending", payout: 0,
        });
      }
      res.status(201).json({ prediction, game });
    } catch (err: any) {
      console.error("[my-bfb pick] error:", err.message);
      res.status(500).json({ message: "Failed to save pick" });
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
      const dbGames = await storage.getGames(league);

      // Enrich MLB games with live probable pitcher data from MLB Stats API
      let pitcherMap = new Map<string, { home: string | null; away: string | null }>();
      try {
        const etParts = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date()).split("/");
        const dateStr = `${etParts[2]}-${etParts[0]}-${etParts[1]}`;
        const mlbApiGames = await fetchMLBSchedule(dateStr);
        function norm(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ""); }
        for (const ag of mlbApiGames) {
          const key = `${norm(ag.awayTeam)}|${norm(ag.homeTeam)}`;
          pitcherMap.set(key, { home: ag.homePitcher, away: ag.awayPitcher });
        }
      } catch (_) {}

      const cleaned = dbGames.map((g: any) => {
        let homePitcher = g.homePitcher || null;
        let awayPitcher = g.awayPitcher || null;
        if (g.league === "MLB") {
          function norm2(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ""); }
          const key = `${norm2(g.awayTeam)}|${norm2(g.homeTeam)}`;
          const live = pitcherMap.get(key);
          if (live) { homePitcher = live.home; awayPitcher = live.away; }
        }
        return {
          ...g,
          spiderPick: g.spiderPick ? g.spiderPick.replace(/\s*ML\s*$/i, "").trim() : g.spiderPick,
          homePitcher,
          awayPitcher,
        };
      });
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

      // Block suspended accounts
      if (SUSPENDED_USERS.has(userId)) {
        return res.status(403).json({ message: "Your account has been suspended. Contact support at nikcox@betfans.us." });
      }

      // Block free-tier (unpaid) accounts
      const actingUser = await storage.getUser(userId);
      if (!actingUser || actingUser.membershipTier === "free") {
        return res.status(403).json({ message: "An active subscription is required to submit picks. Please visit the Membership page." });
      }

      // Self-heal: if the submitted gameId no longer exists (e.g. cleaned up as a duplicate),
      // find the canonical game with the same matchup for today and redirect to it.
      let resolvedGameId: number = req.body.gameId;
      const [gameCheck] = await db.select({ id: games.id, gameTime: games.gameTime, status: games.status })
        .from(games).where(eq(games.id, resolvedGameId)).limit(1);
      if (!gameCheck) {
        // Can't get team names from a missing row, so reject with a meaningful message instead of FK crash
        console.warn(`[predictions] gameId ${resolvedGameId} not found — possible stale cache. User: ${userId}`);
        return res.status(409).json({
          message: "Game list has been refreshed. Please reload the page and resubmit your picks.",
        });
      }

      // Block picks on games that have already started, are live, or are finished
      const now = new Date();
      const gameStarted = new Date(gameCheck.gameTime) <= now;
      const gameLocked = gameStarted || gameCheck.status === "live" || gameCheck.status === "finished";
      if (gameLocked) {
        return res.status(422).json({
          message: "This game has already started — picks are locked.",
        });
      }

      const parsed = insertPredictionSchema.parse({ ...req.body, gameId: resolvedGameId, userId });
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
      if (!requestingUser || requestingUser.membershipTier === "free") {
        return res.status(403).json({ message: "Legend membership required to view other members' picks" });
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
        db.select({ id: games.id, homeTeam: games.homeTeam, awayTeam: games.awayTeam, gameTime: games.gameTime }).from(games).where(sql`${games.league} = 'MLB' AND ${games.gameTime} >= ${start} AND ${games.gameTime} < ${end} AND ${games.status} != 'postponed'`),
        db.select({ id: games.id, homeTeam: games.homeTeam, awayTeam: games.awayTeam, gameTime: games.gameTime }).from(games).where(sql`${games.league} = 'NBA' AND ${games.gameTime} >= ${start} AND ${games.gameTime} < ${end} AND ${games.status} != 'postponed'`),
        db.select({ id: games.id, homeTeam: games.homeTeam, awayTeam: games.awayTeam, gameTime: games.gameTime }).from(games).where(sql`${games.league} = 'NHL' AND ${games.gameTime} >= ${start} AND ${games.gameTime} < ${end} AND ${games.status} != 'postponed'`),
      ]);
      // Deduplicate using time-bucket so doubleheaders (same matchup at different times) each count
      const dedup = (list: { homeTeam: string; awayTeam: string; gameTime: Date | null }[]) =>
        new Set(list.map(g => {
          const bucket = Math.round(new Date(g.gameTime!).getTime() / (90 * 60 * 1000));
          return `${g.homeTeam}|${g.awayTeam}|${bucket}`;
        })).size;
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
              AND ${games.league} IN ('MLB','NBA','NHL','FIFA_WC','NCAABB')`
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

      // Group by (league, homeTeam, awayTeam, time-bucket) so doubleheaders
      // (same matchup at different times on the same day) are treated as separate games.
      const matchupGroups = new Map<string, MatchupGroup>();
      for (const g of dayGamesRaw) {
        const bucket = Math.round(new Date(g.gameTime!).getTime() / (90 * 60 * 1000));
        const key = `${g.league}|${g.homeTeam}|${g.awayTeam}|${bucket}`;
        if (!matchupGroups.has(key)) {
          matchupGroups.set(key, { canonicalId: g.id, allIds: new Set([g.id]), league: g.league });
        } else {
          matchupGroups.get(key)!.allIds.add(g.id);
        }
      }

      const mlbMatchups    = [...matchupGroups.entries()].filter(([k]) => k.startsWith("MLB|"));
      const nbaMatchups    = [...matchupGroups.entries()].filter(([k]) => k.startsWith("NBA|"));
      const nhlMatchups    = [...matchupGroups.entries()].filter(([k]) => k.startsWith("NHL|"));
      const wcMatchups     = [...matchupGroups.entries()].filter(([k]) => k.startsWith("FIFA_WC|"));
      const ncaabbMatchups = [...matchupGroups.entries()].filter(([k]) => k.startsWith("NCAABB|"));

      const allDayIds = dayGamesRaw.map(g => g.id);

      // Fetch all graded predictions for this day's games
      const dayPreds = allDayIds.length === 0 ? [] : await db.select().from(predictions).where(
        inArray(predictions.gameId, allDayIds)
      );

      // Fetch all paid members
      const allUsers = await db.select().from(users).where(
        sql`${users.membershipTier} IN ('rookie', 'pro', 'legend', 'corporate', 'premium_corporate')`
      );

      const memberRows = allUsers.map(u => {
        const myPreds = dayPreds.filter(p => p.userId === u.id);
        const forSport = (matchups: [string, MatchupGroup][]) => {
          let picks = 0, wins = 0, losses = 0, pending = 0;
          for (const [, group] of matchups) {
            const sp = myPreds.filter(p => group.allIds.has(p.gameId));
            if (sp.length > 0) {
              picks++;
              const gWins    = sp.filter(p => p.result === "win").length;
              const gLosses  = sp.filter(p => p.result === "loss").length;
              const gPending = sp.filter(p => p.result === "pending").length;
              if (gWins > gLosses)           wins++;
              else if (gLosses > gWins)      losses++;
              else if (gPending > 0)         pending++;
              else if (gWins > 0)            wins++;
            }
          }
          return { picks, wins, losses, pending };
        };
        const mlb    = forSport(mlbMatchups);
        const nba    = forSport(nbaMatchups);
        const nhl    = forSport(nhlMatchups);
        const wc     = forSport(wcMatchups);
        const ncaabb = forSport(ncaabbMatchups);
        const total = {
          picks:   mlb.picks   + nba.picks   + nhl.picks   + wc.picks   + ncaabb.picks,
          wins:    mlb.wins    + nba.wins    + nhl.wins    + wc.wins    + ncaabb.wins,
          losses:  mlb.losses  + nba.losses  + nhl.losses  + wc.losses  + ncaabb.losses,
          pending: mlb.pending + nba.pending + nhl.pending + wc.pending + ncaabb.pending,
        };
        // Only MLB + NHL/NBA required for prize pool qualification.
        // FIFA_WC and NCAABB are skill-play bonus sports — picks count toward wins/ranking
        // but NOT required to qualify (matching payoutService.ts logic exactly).
        const qualified =
          mlb.picks >= mlbMatchups.length &&
          (nbaMatchups.length === 0 || nba.picks >= nbaMatchups.length) &&
          (nhlMatchups.length === 0 || nhl.picks >= nhlMatchups.length);

        // Pick submission timestamps in PST
        const pickTimes = myPreds
          .map(p => p.createdAt ? new Date(p.createdAt).getTime() : null)
          .filter((t): t is number => t !== null);
        const fmtPickTime = (ms: number) =>
          new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Los_Angeles",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          }).format(new Date(ms))
            .replace(/\s?[AP]M/i, m => m.trim().toLowerCase())
            + " PST";
        const firstPickAt = pickTimes.length > 0 ? fmtPickTime(Math.min(...pickTimes)) : null;
        const lastPickAt  = pickTimes.length > 0 ? fmtPickTime(Math.max(...pickTimes)) : null;

        return {
          userId: u.id,
          name:   [u.firstName, u.lastName].filter(Boolean).join(" ") || "Member",
          referralCode: u.referralCode || null,
          tier:   u.membershipTier,
          avatar: u.profileImageUrl || null,
          mlb, nba, nhl, wc, ncaabb, total, qualified,
          firstPickAt,
          lastPickAt,
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
        games:  { mlb: mlbMatchups.length, nba: nbaMatchups.length, nhl: nhlMatchups.length, wc: wcMatchups.length, ncaabb: ncaabbMatchups.length, total: matchupGroups.size },
        members: memberRows,
        winner: winner ? { userId: winner.userId, name: winner.name, wins: winner.total.wins, losses: winner.total.losses } : null,
      });
    } catch (e: any) {
      console.error("[daily-scorecard]", e);
      res.status(500).json({ message: "Failed to fetch scorecard" });
    }
  });

  // ── FIFA World Cup 2026 Schedule ─────────────────────────────────────────────
  app.get("/api/world-cup/schedule", async (req, res) => {
    try {
      const dateParam = req.query.date as string | undefined;
      const url = dateParam
        ? `https://site.api.espn.com/apis/site/v2/sports/soccer/FIFA.WORLD/scoreboard?dates=${dateParam}`
        : `https://site.api.espn.com/apis/site/v2/sports/soccer/FIFA.WORLD/scoreboard`;
      const data = await fetch(url).then(r => r.json());
      const events = (data.events || []).map((e: any) => {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
        const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
        return {
          id: e.id,
          name: e.name,
          date: e.date,
          status: e.status?.type?.state,
          statusDetail: e.status?.type?.shortDetail || e.status?.type?.name,
          homeTeam: home?.team?.displayName || "",
          homeAbbr: home?.team?.abbreviation || "",
          homeFlag: home?.team?.flag || home?.team?.logo || null,
          homeScore: home?.score ?? null,
          awayTeam: away?.team?.displayName || "",
          awayAbbr: away?.team?.abbreviation || "",
          awayFlag: away?.team?.flag || away?.team?.logo || null,
          awayScore: away?.score ?? null,
          venue: comp?.venue?.fullName || "",
          group: comp?.notes?.[0]?.headline || e.season?.slug || "Group Stage",
        };
      });
      res.json({ events, total: events.length });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to fetch World Cup schedule" });
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
          const perReferral = tier === "legend" ? 50 : 0;
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
        return res.status(400).json({ message: "Only Legend members can refer new signups. Your referrer must be a Legend member." });
      }
      if (!isFounder && tierToCheck === "corporate" && !["legend", "corporate"].includes(referrer.membershipTier || "")) {
        return res.status(400).json({ message: "Only Legend or Corporate members can refer Corporate Partners.", allowed: false });
      }

      await storage.createReferral(referrer.id, userId);
      await db.update(users).set({ referredBy: referrer.id }).where(eq(users.id, userId));

      res.json({ message: "Affiliate code applied successfully!", referrerTier: referrer.membershipTier || "rookie" });
    } catch (error) {
      res.status(500).json({ message: "Failed to apply affiliate code" });
    }
  });

  // GET /api/referral/validate?code=XYZ — public, live code lookup for signup form
  app.get("/api/referral/validate", async (req, res) => {
    try {
      const code = ((req.query.code as string) || "").trim().toUpperCase();
      if (!code) return res.json({ valid: false });

      // NIKCOX is always the founder
      if (code === "NIKCOX") {
        const founder = await db.select().from(users).where(eq(users.referralCode, "NIKCOX")).limit(1);
        const name = founder[0] ? `${founder[0].firstName || "Nikco"}`.trim() : "Nikco";
        return res.json({ valid: true, referrerName: name + " (BetFans Founder)", tier: "founder" });
      }

      const referrer = await storage.getUserByReferralCode(code);
      if (!referrer) return res.json({ valid: false, error: "Code not found" });

      const firstName = referrer.firstName || "";
      const lastName  = referrer.lastName  || "";
      const name = `${firstName} ${lastName}`.trim() || "Member";
      const tier = referrer.membershipTier || "rookie";
      return res.json({ valid: true, referrerName: name, tier });
    } catch {
      res.json({ valid: false });
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
        return res.json({ allowed: false, referrerTier, message: "Only Legend members can refer new signups. Ask your referrer to upgrade to Legend." });
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

      const [daily, yearContributions, dailyPaidThisYear] = await Promise.all([
        storage.getPrizePoolTotalByPeriod(dayStart),
        storage.getPrizePoolTotalByPeriod(yearStart),
        storage.getTotalPayoutsByPeriod(yearStart),
      ]);

      const annualRemaining = Math.max(0, yearContributions - dailyPaidThisYear);
      // Prize pool amount = total contributions (admin-controlled via set-prize-pool)
      const remaining = Math.max(0, Math.floor(total));

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

      // Suspended accounts cannot re-subscribe
      if (SUSPENDED_USERS.has(userId)) {
        return res.status(403).json({ message: "Your account has been suspended. Contact support at nikcox@betfans.us." });
      }

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
      const validTiers = ["rookie", "pro", "legend", "corporate", "premium_corporate"];
      if (!validTiers.includes(confirmedTier)) {
        return res.status(400).json({ message: "Invalid tier" });
      }

      await storage.updateUser(userId, {
        membershipTier: confirmedTier,
        paypalSubscriptionId: subscriptionId,
      });

      // Activate referral now that payment is confirmed
      await storage.activateReferral(userId).catch(() => {});

      // Prize pool contribution — corporate: $600; premium_corporate: $6,000; others: 50% of price
      const tierPrices: Record<string, number> = { rookie: 19, pro: 29, legend: 99, corporate: 1200, premium_corporate: 12000 };
      const prizeContribution = confirmedTier === "premium_corporate" ? 6000 : confirmedTier === "corporate" ? 600 : (tierPrices[confirmedTier] || 0) * 0.5;
      if (prizeContribution > 0) {
        await storage.addPrizePoolContribution(prizeContribution, "paypal", subscriptionId, userId);
        console.log(`[PayPal] Prize pool +$${prizeContribution} for ${confirmedTier} (${subscriptionId})`);
      }

      // Auto-generate referral code for corporate partners
      if (confirmedTier === "corporate" || confirmedTier === "premium_corporate") {
        await storage.generateReferralCode(userId).catch(() => {});
        console.log(`[PayPal] ${confirmedTier} partner ${userId} — referral code auto-generated`);
      }

      // Premium corporate: create placeholder advertiser record (admin activates after logo submission)
      if (confirmedTier === "premium_corporate") {
        try {
          const partnerUser = await storage.getUser(userId);
          const companyName = [partnerUser?.firstName, partnerUser?.lastName].filter(Boolean).join(" ") || "Premium Partner";
          await storage.createAdvertiser({
            companyName,
            logoUrl: "pending",
            tagline: "Premium BetFans Partner",
            websiteUrl: null,
            placement: "banner",
            annualFee: 12000,
            active: false,
            startDate: new Date(),
            endDate: new Date(Date.now() + 366 * 24 * 60 * 60 * 1000),
          });
          console.log(`[PayPal] Premium corporate advertiser placeholder created for ${userId}`);
        } catch (e) {
          console.error(`[PayPal] Failed to create advertiser for ${userId}:`, e);
        }
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
              // Instant signup bonus to referrer's wallet — Legend join: $50 instant (Rookie/Pro: $0)
              const signupBonus = confirmedTier === "premium_corporate" ? 6000 : confirmedTier === "corporate" ? 600 : confirmedTier === "legend" ? 50 : 0;
              const referrerBalance = parseFloat(referrer.walletBalance || "0");
              await storage.updateUser(referrer.id, { walletBalance: String(referrerBalance + signupBonus) });
              await storage.createTransaction({ userId: referrer.id, type: "referral_bonus", amount: signupBonus, description: `Signup bonus — ${upperCode} referred a ${confirmedTier} member`, status: "completed" });
              console.log(`[PayPal] Referral applied: ${referrer.id} -> ${userId}, +$${signupBonus} wallet bonus`);
              // Instant PayPal payout to referrer
              const referrerPayoutDest = (referrer as any).paypalPayoutEmail || referrer.phone;
              if (referrerPayoutDest) {
                try {
                  const { sendPayPalPayout } = await import("./paypalService");
                  await sendPayPalPayout(
                    referrerPayoutDest,
                    signupBonus,
                    `aff-signup-${referrer.id}-${userId}-${Date.now()}`,
                    `You earned a $${signupBonus} affiliate signup bonus — someone joined BetFans using your referral code.`,
                    "BetFans Affiliate Bonus 💸",
                    `Congrats! Your referral code was just used. $${signupBonus} affiliate bonus is on its way to you.`
                  );
                  console.log(`[PayPal] Affiliate signup payout $${signupBonus} sent to ${referrerPayoutDest}`);
                } catch (payoutErr: any) {
                  console.error(`[PayPal] Affiliate signup payout failed for ${referrer.id}:`, payoutErr.message);
                }
              } else {
                console.warn(`[PayPal] Referrer ${referrer.id} has no paypalPayoutEmail or phone — wallet credited but payout skipped`);
              }
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
            if (foundUser && !SUSPENDED_USERS.has(foundUser.id)) {
              // Extend subscription window by 32 days on every activation/renewal
              const paidUntil = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);
              await storage.updateUser(foundUser.id, {
                membershipTier: tier,
                subscriptionPaidUntil: paidUntil,
                subscriptionCancelledAt: null,
              } as any);
              console.log(`[PayPal webhook] User ${foundUser.id} activated ${tier} — paid until ${paidUntil.toISOString()}`);
              // Activate referral on first payment
              await storage.activateReferral(foundUser.id).catch(() => {});
              // Add prize pool + affiliate commission on renewal
              if (resourceType === "BILLING.SUBSCRIPTION.RENEWED") {
                // Corporate: $600 to prize pool, $600 to referrer (annual)
                // Others: per-month affiliate commission, remainder to prize pool
                const affiliateCommission: Record<string, number> = { rookie: 0, pro: 0, legend: 50, corporate: 600, premium_corporate: 6000 };
                const tierPrices: Record<string, number> = { rookie: 19, pro: 29, legend: 99, corporate: 1200, premium_corporate: 12000 };
                const commission = affiliateCommission[tier] || 0;
                const prizeContribution = tier === "premium_corporate" ? 6000 : tier === "corporate" ? 600 : (tierPrices[tier] || 0) - commission;
                const renewalLabel = (tier === "corporate" || tier === "premium_corporate") ? "Annual renewal" : "Monthly residual";

                // Pay affiliate commission to referrer
                if (commission > 0 && foundUser.referredBy) {
                  const referrer = await storage.getUser(foundUser.referredBy);
                  if (referrer) {
                    const refBalance = parseFloat((referrer as any).walletBalance || "0");
                    await storage.updateUser(referrer.id, { walletBalance: String(refBalance + commission) } as any);
                    await storage.createTransaction({ userId: referrer.id, type: "referral_bonus", amount: commission, description: `${renewalLabel} — ${foundUser.firstName || foundUser.id} (${tier}) renewed`, status: "completed" });
                    console.log(`[PayPal webhook] Affiliate $${commission} to ${referrer.id} for ${foundUser.id} ${tier} renewal`);
                    // Instant PayPal payout to referrer on renewal
                    const renewalPayoutDest = (referrer as any).paypalPayoutEmail || referrer.phone;
                    if (renewalPayoutDest) {
                      try {
                        const { sendPayPalPayout } = await import("./paypalService");
                        await sendPayPalPayout(
                          renewalPayoutDest,
                          commission,
                          `aff-renewal-${referrer.id}-${foundUser.id}-${Date.now()}`,
                          `You earned a $${commission} residual commission — ${foundUser.firstName || "a member"} you referred just renewed their BetFans subscription.`,
                          "BetFans Residual Income 💸",
                          `Your monthly residual is here! $${commission} earned from a referred member's renewal.`
                        );
                        console.log(`[PayPal webhook] Affiliate renewal payout $${commission} sent to ${renewalPayoutDest}`);
                      } catch (payoutErr: any) {
                        console.error(`[PayPal webhook] Affiliate renewal payout failed for ${referrer.id}:`, payoutErr.message);
                      }
                    } else {
                      console.warn(`[PayPal webhook] Referrer ${referrer.id} has no paypalPayoutEmail or phone — wallet credited but renewal payout skipped`);
                    }
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

      // ── PayPal Invoice paid (manual-pay members) ──────────────────────────
      if (resourceType === "INVOICING.INVOICE.PAID") {
        try {
          const inv = event.resource;
          // Extract userId from the invoice memo field: "userId:{uuid}"
          const memo: string = inv?.detail?.memo ?? "";
          const memoMatch = memo.match(/userId:([a-f0-9-]+)/i);
          const tierPrices: Record<string, number> = { rookie: 19, pro: 29, legend: 99 };

          // Also extract recipient email as a fallback lookup
          const recipientEmail: string | null =
            inv?.primary_recipients?.[0]?.billing_info?.email_address ?? null;

          let invoicedUser: any = null;

          if (memoMatch?.[1]) {
            invoicedUser = await storage.getUser(memoMatch[1]);
          }
          if (!invoicedUser && recipientEmail) {
            const rows = await db.execute(sql`SELECT * FROM users WHERE email = ${recipientEmail} LIMIT 1`);
            const r = (rows as any).rows ?? (rows as any) ?? [];
            if (r.length > 0) invoicedUser = r[0];
          }

          if (invoicedUser) {
            // Determine tier from invoice item name or fall back to current tier
            const itemName: string = (inv?.items?.[0]?.name ?? "").toLowerCase();
            const paidTier =
              itemName.includes("legend") ? "legend" :
              itemName.includes("pro") ? "pro" :
              itemName.includes("rookie") ? "rookie" :
              invoicedUser.membershipTier ?? "rookie";

            const paidUntil = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);
            await db.execute(sql`
              UPDATE users
              SET membership_tier = ${paidTier},
                  subscription_paid_until = ${paidUntil},
                  subscription_cancelled_at = NULL
              WHERE id = ${invoicedUser.id}
            `);

            // Log transaction + prize pool contribution
            const amount = tierPrices[paidTier] ?? 99;
            await storage.createTransaction({
              userId: invoicedUser.id,
              type: "invoice_payment",
              amount,
              description: `PayPal invoice paid — ${paidTier} membership restored until ${paidUntil.toDateString()}`,
              status: "completed",
            });
            await storage.addPrizePoolContribution(amount * 0.5, "invoice_payment", inv?.id ?? "", invoicedUser.id);

            console.log(`[PayPal webhook] Invoice paid: ${invoicedUser.id} → ${paidTier}, paid until ${paidUntil.toISOString()}`);
          } else {
            console.warn(`[PayPal webhook] INVOICING.INVOICE.PAID — could not find user. memo="${memo}" email="${recipientEmail}"`);
          }
        } catch (invErr: any) {
          console.error(`[PayPal webhook] Invoice paid handler error: ${invErr.message}`);
        }
      }

      // ── Payment failed — PayPal will retry automatically, do NOT downgrade ──
      if (resourceType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
        const sub = event.resource;
        const subscriptionId = sub?.id;
        if (subscriptionId) {
          const user = await storage.getUserByPaypalSubscriptionId(subscriptionId);
          if (user) {
            const nextRetry: string = sub?.billing_info?.next_payment_retry_time ?? "unknown";
            await storage.createTransaction({
              userId: user.id,
              type: "payment_failed",
              amount: 0,
              description: `PayPal payment failed for ${user.membershipTier} subscription — PayPal will retry on ${nextRetry.slice(0, 10)}`,
              status: "failed",
            });
            // Mark the failure date so the morning audit can track grace periods,
            // but do NOT downgrade — PayPal handles retries for 3 attempts before suspending.
            if (!user.subscriptionCancelledAt) {
              await storage.updateUser(user.id, { subscriptionCancelledAt: new Date() });
            }
            console.log(`[PayPal webhook] Payment FAILED: user ${user.id} (${user.membershipTier}) — next retry: ${nextRetry}`);
          }
        }
      }

      // ── Suspended — PayPal gave up retrying, now downgrade ────────────────
      if (resourceType === "BILLING.SUBSCRIPTION.SUSPENDED") {
        const sub = event.resource;
        const subscriptionId = sub?.id;
        if (subscriptionId) {
          const user = await storage.getUserByPaypalSubscriptionId(subscriptionId);
          if (user && user.membershipTier !== "free") {
            await storage.updateUser(user.id, {
              membershipTier: "free",
              subscriptionCancelledAt: new Date(),
            });
            await storage.createTransaction({
              userId: user.id,
              type: "subscription_suspended",
              amount: 0,
              description: `PayPal subscription suspended after failed retries — downgraded to free`,
              status: "failed",
            });
            console.log(`[PayPal webhook] Subscription SUSPENDED: user ${user.id} → downgraded to free`);
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

  app.patch("/api/user/payout-email", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const { email } = req.body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ message: "A valid PayPal email address is required" });
      }
      const updated = await storage.updateUser(userId, { paypalPayoutEmail: email.trim().toLowerCase() });
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ ok: true, paypalPayoutEmail: updated.paypalPayoutEmail });
    } catch (error) {
      res.status(500).json({ message: "Failed to update payout email" });
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

  app.post("/api/games/sync", isAuthenticated, async (_req, res) => {
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

  // Admin: mark a payout as manually paid (use when PayPal Payouts API is unavailable)
  // Returns the recipient's PayPal email/phone so admin can send from PayPal.com manually
  app.post("/api/admin/mark-paid/:payoutId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const payoutId = parseInt(req.params.payoutId);
      if (isNaN(payoutId)) return res.status(400).json({ error: "Invalid payout ID" });

      const payout = await storage.getPayoutById(payoutId);
      if (!payout) return res.status(404).json({ error: "Payout not found" });
      if (payout.status === "paypal_sent") return res.status(400).json({ error: "Already marked as paid" });

      const user = await storage.getUser(payout.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const { getSubscriptionDetails } = await import("./paypalService");
      let recipientInfo = (user as any).paypalPayoutEmail || user.phone || "unknown";
      if (!(user as any).paypalPayoutEmail && (user as any).paypalSubscriptionId) {
        try {
          const sub = await getSubscriptionDetails((user as any).paypalSubscriptionId);
          recipientInfo = sub?.subscriber?.email_address || recipientInfo;
        } catch {}
      }

      await storage.updatePayout(payoutId, {
        status: "paypal_sent",
        paidAt: new Date(),
        stripeTransferId: `manual-${payoutId}-${Date.now()}`,
      });

      res.json({ ok: true, recipientInfo, amount: payout.amount, note: `BetFans ${payout.period} prize — ${payout.periodLabel}` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Duplicate reset-password removed — canonical version is registered later in this file

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

  app.get("/api/internal/user-lookup", async (req, res) => {
    try {
      const { secret, userId } = req.query as any;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const user = await storage.getUser(userId);
      const txs = await storage.getUserTransactions(userId);
      const contributions = await db.execute(sql`SELECT * FROM prize_pool_contributions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 10`);
      res.json({ user, transactions: txs, contributions: contributions.rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/fix-wallet", async (req, res) => {
    try {
      const { secret, userId, correctBalance } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      // Delete duplicate prize_payout transactions — keep only the oldest one per day
      const dupeResult = await db.execute(sql`
        DELETE FROM transactions
        WHERE user_id = ${userId}
          AND type = 'prize_payout'
          AND id NOT IN (
            SELECT MIN(id) FROM transactions
            WHERE user_id = ${userId} AND type = 'prize_payout'
            GROUP BY description
          )
      `);
      // Set wallet to correct balance
      await storage.updateUser(userId, { walletBalance: String(correctBalance) });
      const txsAfter = await storage.getUserTransactions(userId);
      const user = await storage.getUser(userId);
      res.json({ ok: true, deletedDupes: dupeResult.rowCount, wallet: user?.walletBalance, transactions: txsAfter.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/zero-all-wallets", async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const NIKCO_ID = "29b670b7-5296-44dc-a0a0-aec0d878ef9b";
      // Zero every wallet except Nikco's
      const result = await db.execute(sql`UPDATE users SET wallet_balance = '0' WHERE id != ${NIKCO_ID} AND wallet_balance::numeric != 0`);
      // Show all non-zero wallets remaining (should just be Nikco)
      const remaining = await db.execute(sql`SELECT id, phone, first_name, wallet_balance FROM users WHERE wallet_balance::numeric > 0 ORDER BY wallet_balance::numeric DESC`);
      res.json({ ok: true, zeroed: result.rowCount, remaining: remaining.rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/fix-prize-pool", async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const SCOTT_ID = "550e8400-e29b-41d4-a716-446655440001";
      const log: string[] = [];

      // Only insert if not already present (idempotent by period_label + user_id + status check)
      const existing28 = await db.execute(sql`SELECT id FROM payouts WHERE period = 'daily' AND period_label = '2026-04-28' AND user_id = ${SCOTT_ID}`);
      if (existing28.rows.length === 0) {
        // Insert the original sweep payout ($11, as it existed at 7:16am when pool showed $102)
        await db.execute(sql`
          INSERT INTO payouts (user_id, amount, period, period_label, rank, share_percent, status, paid_at, stripe_transfer_id, created_at)
          VALUES (${SCOTT_ID}, 11, 'daily', '2026-04-28', 1, 10.0, 'paypal_sent', NOW(), 'sweep-apr28-restored', '2026-04-29T07:00:00Z')
        `);
        log.push("✓ Restored sweep payout record: $11 for 2026-04-28 (paypal_sent)");

        // At 7:16am pool showed $102 = $133 - $8 - $12 - $11 (sweep was $11).
        // Scott was manually paid $10 (not $11). Target: $102 - $10 = $92.
        // So we need both records: $11 sweep + $10 manual payment to bring pool from $113 → $92.
        // The $11 sweep record restores what was lost; the $10 records the actual payment.
        await db.execute(sql`
          INSERT INTO payouts (user_id, amount, period, period_label, rank, share_percent, status, paid_at, stripe_transfer_id, created_at)
          VALUES (${SCOTT_ID}, 10, 'daily', '2026-04-28-correction', 1, 10.0, 'paypal_sent', NOW(), 'manual-paypal-phone-2026-04-29', '2026-04-29T09:00:00Z')
        `);
        log.push("✓ Inserted manual payment record: $10 correction for 2026-04-28");
      } else {
        log.push("ℹ April 28 payout already exists — skipped");
      }

      const poolCheck = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric), 0) as total FROM payouts`);
      const contribCheck = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric), 0) as total FROM prize_pool_contributions`);
      const totalPaid = Number(poolCheck.rows[0]?.total || 0);
      const totalContrib = Number(contribCheck.rows[0]?.total || 0);
      const newPool = Math.floor(totalContrib - totalPaid);

      res.json({ ok: true, log, totalContributions: totalContrib, totalPaid, newPool });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/fix-april29-deploy", async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const SCOTT_ID = "550e8400-e29b-41d4-a716-446655440001";
      const log: string[] = [];

      // 1. Fix payout id:35 (rogue deploy duplicate) from $11 → $10 and mark as sent
      await db.execute(sql`UPDATE payouts SET amount = 10, status = 'paypal_sent', paid_at = NOW(), stripe_transfer_id = 'manual-paypal-phone-2026-04-29' WHERE id = 35`);
      log.push("✓ Payout id:35 corrected: $11 → $10, status → paypal_sent");

      // 2. Delete the rogue $11 transaction (tx id:35), keep the original tx:25 ($10)
      await db.execute(sql`DELETE FROM transactions WHERE id = 35 AND user_id = ${SCOTT_ID} AND type = 'prize_payout'`);
      log.push("✓ Deleted rogue $11 transaction (tx:35)");

      // 3. Zero Scott's wallet (he was paid manually via PayPal)
      await db.execute(sql`UPDATE users SET wallet_balance = 0 WHERE id = ${SCOTT_ID}`);
      log.push("✓ Scott's wallet set to $0");

      const user = await storage.getUser(SCOTT_ID);
      res.json({ ok: true, log, scottWallet: user?.walletBalance });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/mark-payout-sent", async (req, res) => {
    try {
      const { secret, payoutId, note } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      await db.execute(sql`
        UPDATE payouts
        SET status = 'paypal_sent', paid_at = NOW(), stripe_transfer_id = ${note || "manual"}
        WHERE id = ${payoutId}
      `);
      const payout = await storage.getPayoutById(parseInt(payoutId));
      res.json({ ok: true, payoutId, status: payout?.status, paidAt: payout?.paidAt });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/fix-april28-payout", async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });

      const SCOTT_ID = "550e8400-e29b-41d4-a716-446655440001";
      const IAN_ID   = "550e8400-e29b-41d4-a716-446655440003";
      const log: string[] = [];

      // 1. Move icg322@gmail.com from Scott → Ian; store Scott's phone as payout contact
      await storage.updateUser(SCOTT_ID, { paypalPayoutEmail: "8182314634" } as any);
      log.push("✓ Set Scott's payout contact to phone 8182314634");

      await storage.updateUser(IAN_ID, { paypalPayoutEmail: "icg322@gmail.com" } as any);
      log.push("✓ Set icg322@gmail.com on Ian's profile");

      // 2. Fix payout id:28 amount from $11 → $10
      await db.execute(sql`UPDATE payouts SET amount = 10 WHERE id = 28`);
      log.push("✓ Payout #28 amount corrected: $11 → $10");

      // 3. Fix Scott's wallet from $11 → $10
      await storage.updateUser(SCOTT_ID, { walletBalance: "10" });
      log.push("✓ Scott's wallet corrected: $11 → $10");

      // 4. Fix the remaining prize_payout transaction amount for Scott
      await db.execute(sql`UPDATE transactions SET amount = 10 WHERE user_id = ${SCOTT_ID} AND type = 'prize_payout'`);
      log.push("✓ Scott's prize_payout transaction corrected: $11 → $10");

      const scott = await storage.getUser(SCOTT_ID);
      const ian   = await storage.getUser(IAN_ID);
      res.json({ ok: true, log, scott: { wallet: scott?.walletBalance, paypalEmail: (scott as any)?.paypalPayoutEmail }, ian: { paypalEmail: (ian as any)?.paypalPayoutEmail } });
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

  // ONE-SHOT: Add 2 missing April 30 doubleheader games (Astros/Orioles & Giants/Phillies game 1)
  app.post("/api/internal/add-missing-doubleheaders", async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const log: string[] = [];
      const dh = [
        { awayTeam: "Houston Astros",    homeTeam: "Baltimore Orioles",    gameTime: new Date("2026-04-30T16:35:00Z") },
        { awayTeam: "San Francisco Giants", homeTeam: "Philadelphia Phillies", gameTime: new Date("2026-04-30T16:35:00Z") },
      ];
      for (const g of dh) {
        // Only insert if no record within 90 min already exists
        const existing = await db.execute(sql`
          SELECT id FROM games
          WHERE league='MLB' AND home_team=${g.homeTeam} AND away_team=${g.awayTeam}
            AND game_time BETWEEN ${new Date(g.gameTime.getTime()-90*60000)} AND ${new Date(g.gameTime.getTime()+90*60000)}
          LIMIT 1
        `);
        if ((existing as any).rows?.length > 0) {
          log.push(`⏭  ${g.awayTeam} @ ${g.homeTeam} already exists — skipped`);
          continue;
        }
        await db.execute(sql`
          INSERT INTO games (league, home_team, away_team, game_time, status, spider_pick, spider_confidence, is_pro_locked, created_at)
          VALUES ('MLB', ${g.homeTeam}, ${g.awayTeam}, ${g.gameTime}, 'live', 'TBD', 60, false, NOW())
        `);
        log.push(`✓ Inserted ${g.awayTeam} @ ${g.homeTeam} at ${g.gameTime.toISOString()}`);
      }
      res.json({ ok: true, log });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DAILY: Add MLB results to Nikco's BFB YTD record.
  // Call this each evening after MLB games finish: { secret, wins, losses }
  // Adds the day's wins/losses to the running total and recalculates ROI.
  // Set BFB record to an ABSOLUTE value — no math needed, just the final numbers.
  // POST /api/internal/set-bfb-record  { secret, totalWins, totalLosses }
  // Sets the BFB YTD display record AND writes it as the new seed with cutoff = NOW.
  // refreshBFBRecord() will add only picks submitted after this moment, so the
  // record auto-updates from real graded picks going forward with no manual intervention.
  app.post("/api/internal/set-bfb-record", async (req, res) => {
    try {
      const { secret, totalWins, totalLosses } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const w = parseInt(totalWins ?? "0", 10);
      const l = parseInt(totalLosses ?? "0", 10);
      if (isNaN(w) || isNaN(l) || w < 0 || l < 0) return res.status(400).json({ error: "totalWins and totalLosses must be non-negative integers" });
      const [nikcoRow] = await db.select().from(users).where(eq(users.referralCode, "NIKCOX")).limit(1);
      if (!nikcoRow) return res.status(404).json({ error: "Nikco account not found" });
      const uid = nikcoRow.id;
      const total = w + l;
      const roi = total > 0 ? Math.round((w / total) * 1000) / 10 : 0;
      const now = new Date();

      // 1. Upsert bfb_ytd (what the page displays)
      const [existing] = await db.select({ id: leaderboardEntries.id })
        .from(leaderboardEntries)
        .where(and(eq(leaderboardEntries.userId, uid), eq(leaderboardEntries.period, "bfb_ytd")))
        .limit(1);
      if (existing) {
        await db.update(leaderboardEntries)
          .set({ wins: w, losses: l, roi, updatedAt: now })
          .where(and(eq(leaderboardEntries.userId, uid), eq(leaderboardEntries.period, "bfb_ytd")));
      } else {
        await db.insert(leaderboardEntries).values({
          userId: uid, period: "bfb_ytd",
          periodStart: new Date("2026-01-01T00:00:00Z"),
          rank: 1, wins: w, losses: l, roi, profit: 45, streak: 5,
        });
      }

      // 2. Upsert bfb_seed (used by refreshBFBRecord to add future graded picks).
      //    periodStart = NOW so only MLB picks submitted after this moment are added.
      const [seedExisting] = await db.select({ id: leaderboardEntries.id })
        .from(leaderboardEntries)
        .where(and(eq(leaderboardEntries.userId, uid), eq(leaderboardEntries.period, "bfb_seed")))
        .limit(1);
      if (seedExisting) {
        await db.update(leaderboardEntries)
          .set({ wins: w, losses: l, roi, periodStart: now, updatedAt: now })
          .where(and(eq(leaderboardEntries.userId, uid), eq(leaderboardEntries.period, "bfb_seed")));
      } else {
        await db.insert(leaderboardEntries).values({
          userId: uid, period: "bfb_seed",
          periodStart: now,
          rank: 1, wins: w, losses: l, roi, profit: 0, streak: 0,
        });
      }

      console.log(`[BFB] seed+YTD set: ${w}-${l} (${roi}%) cutoff=${now.toISOString()}`);
      return res.json({ ok: true, wins: w, losses: l, roi, seedCutoff: now.toISOString() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/internal/check-picks?secret=...&userId=...&hours=24
  app.get("/api/internal/check-picks", async (req, res) => {
    try {
      const { secret, userId, hours } = req.query as Record<string, string>;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const uid = userId || "aa5b3efa-fb3e-49b1-9f60-983bcec7d67a";
      const h = parseInt(hours || "24", 10);
      const rows = await db.execute(sql`
        SELECT p.id, p.pick, p.prediction_type, p.result, p.created_at, g.home_team, g.away_team, g.league
        FROM predictions p
        JOIN games g ON g.id = p.game_id
        WHERE p.user_id = ${uid}
          AND p.created_at >= NOW() - (${h} || ' hours')::interval
        ORDER BY p.created_at DESC
        LIMIT 50
      `);
      return res.json({ count: (rows as any[]).length, picks: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/internal/insert-bfb-picks  { secret, picks: [{gameId, pick}] }
  // Emergency bypass — inserts BFB picks directly for Nikco without a session
  app.post("/api/internal/insert-bfb-picks", async (req, res) => {
    try {
      const { secret, picks } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      if (!Array.isArray(picks) || picks.length === 0) return res.status(400).json({ error: "picks must be a non-empty array" });
      const NIKCO = "aa5b3efa-fb3e-49b1-9f60-983bcec7d67a";
      const inserted: number[] = [];
      const skipped: number[] = [];
      for (const p of picks) {
        const { gameId, pick } = p;
        if (!gameId || !pick) continue;
        // Skip if already has a pick for this game today
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const [existing] = await db.select({ id: predictions.id }).from(predictions)
          .where(sql`${predictions.userId} = ${NIKCO} AND ${predictions.gameId} = ${gameId} AND ${predictions.createdAt} >= ${todayStart}`)
          .limit(1);
        if (existing) { skipped.push(gameId); continue; }
        await storage.createPrediction({ userId: NIKCO, gameId, predictionType: "Moneyline", pick, units: 1, odds: null, result: "pending", payout: 0 });
        inserted.push(gameId);
      }
      console.log(`[internal] BFB picks inserted: ${inserted.length}, skipped: ${skipped.length}`);
      return res.json({ ok: true, inserted: inserted.length, skipped: skipped.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/internal/run-grader  { secret }
  app.post("/api/internal/run-grader", async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      // Sync first so today's actual ESPN finished games exist in DB before grading
      await syncSportsData().catch((e: any) => console.log("[run-grader] sync error:", e.message));
      const graded = await _gradeStuckGames();
      const bfb = await db.select().from(leaderboardEntries)
        .where(and(eq(leaderboardEntries.userId, "aa5b3efa-fb3e-49b1-9f60-983bcec7d67a"), eq(leaderboardEntries.period, "bfb_ytd")))
        .limit(1);
      return res.json({ ok: true, graded, bfbRecord: bfb[0] ? { wins: bfb[0].wins, losses: bfb[0].losses, roi: bfb[0].roi } : null });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/internal/query-picks  { secret, userId, date, league? }
  app.post("/api/internal/query-picks", async (req, res) => {
    try {
      const { secret, userId, date, league } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const rows = await db.select({
        id: predictions.id,
        gameId: predictions.gameId,
        pick: predictions.pick,
        predictionType: predictions.predictionType,
        result: predictions.result,
        league: games.league,
        awayTeam: games.awayTeam,
        homeTeam: games.homeTeam,
        awayScore: games.awayScore,
        homeScore: games.homeScore,
        spread: games.spread,
        status: games.status,
        gameTime: games.gameTime,
      }).from(predictions)
        .leftJoin(games, eq(predictions.gameId, games.id))
        .where(sql`${predictions.userId} = ${userId} AND DATE(${predictions.createdAt}) = ${date}::date${league ? sql` AND ${games.league} = ${league}` : sql``}`)
        .orderBy(games.league);
      return res.json({ picks: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/internal/list-games?secret=&league=&q=
  app.get("/api/internal/list-games", async (req, res) => {
    try {
      const { secret, league, q } = req.query as Record<string, string>;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      let rows: any[];
      if (q) {
        rows = await db.execute(sql`
          SELECT id, league, away_team, home_team, away_score, home_score, status, game_time
          FROM games WHERE (away_team ILIKE ${'%'+q+'%'} OR home_team ILIKE ${'%'+q+'%'})
          ORDER BY game_time DESC LIMIT 20`);
      } else {
        rows = await db.execute(sql`
          SELECT id, league, away_team, home_team, away_score, home_score, status, game_time
          FROM games ${league ? sql`WHERE league = ${league}` : sql``}
          ORDER BY game_time DESC LIMIT 30`);
      }
      res.json((rows as any).rows ?? rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/internal/fix-game-scores
  // Fix a game's stored scores (and re-grade all picks on it) when ESPN data was wrong.
  // Body: { secret, awayTeam?, homeTeam?, gameId?, date, awayScore, homeScore }
  app.post("/api/internal/fix-game-scores", async (req, res) => {
    try {
      const { secret, awayTeam, homeTeam, date, awayScore, homeScore, gameId } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      let matchingGames: any[] = [];
      if (gameId) {
        matchingGames = await db.select().from(games).where(eq(games.id, Number(gameId)));
      } else if (awayTeam && homeTeam && date) {
        // Try exact first, then ILIKE
        matchingGames = await db.select().from(games)
          .where(sql`away_team = ${awayTeam} AND home_team = ${homeTeam} AND DATE(game_time) = ${date}::date`);
        if (matchingGames.length === 0) {
          const rows = await db.execute(sql`
            SELECT * FROM games WHERE away_team ILIKE ${'%'+awayTeam+'%'} AND home_team ILIKE ${'%'+homeTeam+'%'}
              AND DATE(game_time) = ${date}::date LIMIT 5`);
          matchingGames = (rows as any).rows ?? [];
        }
      } else if (awayTeam && homeTeam) {
        // No date — find most recent
        const rows = await db.execute(sql`
          SELECT * FROM games WHERE away_team ILIKE ${'%'+awayTeam+'%'} AND home_team ILIKE ${'%'+homeTeam+'%'}
          ORDER BY game_time DESC LIMIT 5`);
        matchingGames = (rows as any).rows ?? [];
      }
      if (matchingGames.length === 0) return res.status(404).json({ error: "game not found", awayTeam, homeTeam, date, gameId });
      let totalRegraded = 0;
      for (const g of matchingGames) {
        await db.update(games).set({ homeScore: Number(homeScore), awayScore: Number(awayScore), status: "finished" }).where(eq(games.id, g.id));
        const graded = await autoGradePredictions(g.id, g.homeTeam, g.awayTeam, Number(homeScore), Number(awayScore), g.spread, g.total).catch(() => 0);
        totalRegraded += graded || 0;
        console.log(`[fix-game-scores] game ${g.id} ${g.awayTeam}@${g.homeTeam} → ${awayScore}-${homeScore}, regraded ${graded} pick(s)`);
      }
      await refreshBFBRecord().catch(() => {});
      const bfb = await db.select().from(leaderboardEntries)
        .where(and(eq(leaderboardEntries.userId, "aa5b3efa-fb3e-49b1-9f60-983bcec7d67a"), eq(leaderboardEntries.period, "bfb_ytd")))
        .limit(1);
      return res.json({ ok: true, gamesFixed: matchingGames.length, totalRegraded, bfb: bfb[0] ? { wins: bfb[0].wins, losses: bfb[0].losses } : null });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/internal/send-invoice
  // Manually send a PayPal invoice to a member so they can pay and restore access.
  // Body: { secret, userId?, phone?, email?, tier }
  app.post("/api/internal/send-invoice", async (req, res) => {
    try {
      const { secret, userId, phone, email: bodyEmail, recipientEmail: emailOverride, tier } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });

      let userRow: any = null;
      if (userId) {
        const rows = await db.execute(sql`SELECT * FROM users WHERE id = ${userId} LIMIT 1`);
        const r = (rows as any).rows ?? (rows as any) ?? [];
        userRow = r[0] ?? null;
      }
      if (!userRow && phone) {
        const rows = await db.execute(sql`SELECT * FROM users WHERE phone = ${phone} LIMIT 1`);
        const r = (rows as any).rows ?? (rows as any) ?? [];
        userRow = r[0] ?? null;
      }
      if (!userRow && bodyEmail) {
        const rows = await db.execute(sql`SELECT * FROM users WHERE email = ${bodyEmail} LIMIT 1`);
        const r = (rows as any).rows ?? (rows as any) ?? [];
        userRow = r[0] ?? null;
      }
      if (!userRow) return res.status(404).json({ error: "user not found" });

      // Use emailOverride if provided — also persist it to the user record if missing
      const recipientEmail: string | null = emailOverride || userRow.email || null;
      if (!recipientEmail) return res.status(400).json({ error: "user has no email address on file — pass recipientEmail in the request body" });

      // Persist the email override to the DB if the user didn't have one
      if (emailOverride && !userRow.email) {
        await db.execute(sql`UPDATE users SET email = ${emailOverride} WHERE id = ${userRow.id}`);
        console.log(`[send-invoice] Saved email ${emailOverride} for user ${userRow.id}`);
      }

      const invoiceTier = tier || userRow.membership_tier || "legend";
      const { createAndSendPayPalInvoice } = await import("./paypalService");
      const inv = await createAndSendPayPalInvoice({
        recipientEmail,
        recipientName: `${userRow.first_name ?? ""} ${userRow.last_name ?? ""}`.trim() || undefined,
        tier: invoiceTier,
        userId: userRow.id,
      });

      console.log(`[send-invoice] Invoice ${inv.invoiceId} sent to ${recipientEmail} for user ${userRow.id} (${invoiceTier})`);
      return res.json({
        ok: true,
        invoiceId: inv.invoiceId,
        invoiceUrl: inv.invoiceUrl,
        sentTo: recipientEmail,
        tier: invoiceTier,
        userId: userRow.id,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/internal/record-payment
  // Manually record a payment for a member who paid outside the PayPal subscription system
  // (e.g. PayPal.me, bank transfer). Sets subscriptionPaidUntil and restores tier.
  // Body: { secret, userId?, phone?, tier, months }
  app.post("/api/internal/record-payment", async (req, res) => {
    try {
      const { secret, userId, phone, tier, months = 1 } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });

      let user = userId ? await storage.getUser(userId) : null;
      if (!user && phone) {
        const allUsers = await db.execute(sql`SELECT * FROM users WHERE phone = ${phone} LIMIT 1`);
        const rows = (allUsers as any).rows ?? (allUsers as any) ?? [];
        if (rows.length > 0) user = rows[0] as any;
      }
      if (!user) return res.status(404).json({ error: "user not found" });

      const validTiers: Record<string, string> = { rookie: "rookie", pro: "pro", legend: "legend" };
      const newTier = validTiers[tier] || user.membershipTier || "rookie";
      const paidUntil = new Date(Date.now() + Number(months) * 31 * 24 * 60 * 60 * 1000);

      await db.execute(sql`
        UPDATE users
        SET membership_tier = ${newTier},
            subscription_paid_until = ${paidUntil},
            subscription_cancelled_at = NULL
        WHERE id = ${user.id}
      `);

      const tierPrices: Record<string, number> = { rookie: 19, pro: 29, legend: 99 };
      const amount = (tierPrices[newTier] || 0) * Number(months);
      await storage.createTransaction({
        userId: user.id,
        type: "manual_payment",
        amount,
        description: `Manual payment recorded — ${newTier} × ${months} month(s) — paid until ${paidUntil.toDateString()}`,
        status: "completed",
      });

      // Prize pool contribution: half the payment amount
      if (amount > 0) {
        await storage.addPrizePoolContribution(amount * 0.5, "manual_payment", user.id, user.id);
      }

      console.log(`[record-payment] ${user.firstName} ${user.lastName} (${user.id}) — ${newTier} × ${months}mo — paid until ${paidUntil.toISOString()}`);
      return res.json({
        ok: true,
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        tier: newTier,
        months: Number(months),
        amount,
        paidUntil: paidUntil.toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/internal/fix-prediction-result
  // Directly set a prediction result by prediction ID (e.g. fix a misgraded pick).
  // Also corrects the underlying game's score direction so the auto-correct pass
  // (Pass 6 in gradeStuckGames) does not revert the fix on its next run.
  // Body: { secret, predictionId, newResult }  newResult: "win"|"loss"|"void"|"pending"
  app.post("/api/internal/fix-prediction-result", async (req, res) => {
    try {
      const { secret, predictionId, newResult } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      if (!predictionId || !newResult) return res.status(400).json({ error: "predictionId and newResult required" });
      const validResults = ["win", "loss", "void", "pending", "push"];
      if (!validResults.includes(newResult)) return res.status(400).json({ error: "invalid newResult" });

      const [before] = await db.select().from(predictions).where(eq(predictions.id, Number(predictionId))).limit(1);
      if (!before) return res.status(404).json({ error: "prediction not found" });

      const payout = newResult === "win" ? 1 : newResult === "loss" ? -1 : newResult === "push" ? 0 : null;
      await db.update(predictions)
        .set({ result: newResult, ...(payout !== null ? { payout } : {}) })
        .where(eq(predictions.id, Number(predictionId)));

      // Correct the game's score direction so Pass 6 (auto-correct) produces the same result
      // and never reverts this manual fix. We use a symbolic score (e.g. 110-105) that simply
      // encodes the correct winner without claiming to be the exact final score.
      if (newResult === "win" || newResult === "loss") {
        const [game] = await db.select().from(games).where(eq(games.id, before.gameId)).limit(1);
        if (game && game.status === "finished") {
          const pick = before.pick.toLowerCase();
          const homeWords = game.homeTeam.toLowerCase().split(" ").filter((w: string) => w.length > 2);
          const awayWords = game.awayTeam.toLowerCase().split(" ").filter((w: string) => w.length > 2);
          const uniqueHome = homeWords.filter((w: string) => !awayWords.includes(w));
          const uniqueAway = awayWords.filter((w: string) => !homeWords.includes(w));
          const effHome = uniqueHome.length > 0 ? uniqueHome : homeWords;
          const effAway = uniqueAway.length > 0 ? uniqueAway : awayWords;
          const pickHome = effHome.some((w: string) => pick.includes(w));
          const pickAway = effAway.some((w: string) => pick.includes(w));

          let correctHomeScore: number | null = null;
          let correctAwayScore: number | null = null;

          if (newResult === "win") {
            if (pickHome) { correctHomeScore = 110; correctAwayScore = 105; }   // home team won
            else if (pickAway) { correctHomeScore = 105; correctAwayScore = 110; } // away team won
          } else if (newResult === "loss") {
            if (pickHome) { correctHomeScore = 105; correctAwayScore = 110; }   // home team lost
            else if (pickAway) { correctHomeScore = 110; correctAwayScore = 105; } // away team lost
          }

          if (correctHomeScore !== null && correctAwayScore !== null) {
            await db.update(games)
              .set({ homeScore: correctHomeScore, awayScore: correctAwayScore })
              .where(eq(games.id, before.gameId));
            console.log(`[fix-prediction-result] corrected game ${before.gameId} scores → ${correctHomeScore}-${correctAwayScore} (${game.awayTeam}@${game.homeTeam})`);
          }
        }
      }

      await refreshBFBRecord().catch(() => {});
      const bfb = await db.select().from(leaderboardEntries)
        .where(and(eq(leaderboardEntries.userId, "aa5b3efa-fb3e-49b1-9f60-983bcec7d67a"), eq(leaderboardEntries.period, "bfb_ytd")))
        .limit(1);
      console.log(`[fix-prediction-result] pick ${predictionId} ${before.result} → ${newResult}`);
      return res.json({ ok: true, predictionId, before: before.result, after: newResult, bfb: bfb[0] ? { wins: bfb[0].wins, losses: bfb[0].losses } : null });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/internal/search-users?secret=&q=  (search by username/phone)
  // POST /api/internal/set-user-tier { secret, userId, tier }  (enable/disable a user)
  app.get("/api/internal/search-users", async (req, res) => {
    try {
      const { secret, q } = req.query as Record<string, string>;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      if (!q) return res.status(400).json({ error: "q required" });
      const rows = await db.execute(sql`
        SELECT id, first_name, last_name, phone, email, membership_tier, referral_code, created_at
        FROM users
        WHERE first_name ILIKE ${'%' + q + '%'}
           OR last_name  ILIKE ${'%' + q + '%'}
           OR phone      ILIKE ${'%' + q + '%'}
           OR email      ILIKE ${'%' + q + '%'}
           OR referral_code ILIKE ${'%' + q + '%'}
        ORDER BY created_at DESC LIMIT 20`);
      res.json((rows as any).rows ?? rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/internal/fix-referral { secret, referredId, status }
  app.post("/api/internal/fix-referral", async (req, res) => {
    try {
      const { secret, referredId, status } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      if (!referredId || !["pending","active","cancelled"].includes(status)) {
        return res.status(400).json({ error: "referredId and status (pending/active/cancelled) required" });
      }
      const result = await db.execute(sql`
        UPDATE referrals SET status = ${status}, completed_at = ${status === "active" ? new Date() : null}
        WHERE referred_id = ${referredId}
        RETURNING id, referrer_id, referred_id, status`);
      const rows = (result as any).rows ?? [];
      console.log(`[admin] fix-referral: referredId=${referredId} → ${status} (${rows.length} row(s))`);
      res.json({ ok: true, updated: rows });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/internal/add-prize-pool { secret, amount, note }
  app.post("/api/internal/add-prize-pool", async (req, res) => {
    try {
      const { secret, amount, note } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) return res.status(400).json({ error: "amount required" });
      await storage.addPrizePoolContribution(amt, "manual", note || "manual", undefined);
      const pool = await db.execute(sql`SELECT COALESCE(SUM(amount),0) as total FROM prize_pool_contributions`);
      const total = parseFloat((pool as any).rows?.[0]?.total ?? 0);
      console.log(`[admin] prize pool +$${amt} (${note}) → total $${total}`);
      res.json({ ok: true, added: amt, total });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/internal/fix-prediction { secret, userId, pick, result, gameId? }
  // Re-grade a specific prediction by matching userId + pick text, optionally reassign gameId
  app.post("/api/internal/fix-prediction", async (req, res) => {
    try {
      const { secret, userId, pick, result, gameId } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      if (!userId || !pick || !["win","loss","pending"].includes(result)) {
        return res.status(400).json({ error: "userId, pick, result required" });
      }
      let updated: any;
      if (gameId) {
        updated = await db.execute(sql`
          UPDATE predictions SET result = ${result}, game_id = ${Number(gameId)}
          WHERE user_id = ${userId} AND pick ILIKE ${'%' + pick + '%'}
            AND created_at >= NOW() - INTERVAL '5 days'
          RETURNING id, pick, result, game_id`);
      } else {
        updated = await db.execute(sql`
          UPDATE predictions SET result = ${result}
          WHERE user_id = ${userId} AND pick ILIKE ${'%' + pick + '%'}
            AND created_at >= NOW() - INTERVAL '5 days'
          RETURNING id, pick, result, game_id`);
      }
      const rows = (updated as any).rows ?? [];
      await refreshBFBRecord().catch(() => {});
      res.json({ ok: true, updated: rows });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/internal/set-user-tier", async (req, res) => {
    try {
      const { secret, userId, tier } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const validTiers = ["free", "rookie", "pro", "legend"];
      if (!userId || !tier || !validTiers.includes(tier)) return res.status(400).json({ error: "userId and tier (free/rookie/pro/legend) required" });
      const [before] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!before) return res.status(404).json({ error: "user not found" });
      await db.execute(sql`UPDATE users SET membership_tier = ${tier} WHERE id = ${userId}`);
      console.log(`[admin] set-user-tier: ${before.username} (${userId}) ${before.membershipTier} → ${tier}`);
      res.json({ ok: true, userId, username: before.username, before: before.membershipTier, after: tier });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/internal/force-pick { secret, userId, gameId, pick, predictionType }
  // Admin-only: submit a pick bypassing the game-time lock (for founder emergency use)
  app.post("/api/internal/force-pick", async (req, res) => {
    try {
      const { secret, userId, gameId, pick, predictionType = "Moneyline" } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      if (!userId || !gameId || !pick) return res.status(400).json({ error: "userId, gameId, and pick required" });
      const [existing] = await db.select({ id: predictions.id })
        .from(predictions).where(and(eq(predictions.userId, userId), eq(predictions.gameId, gameId))).limit(1);
      if (existing) {
        await db.update(predictions).set({ pick, predictionType }).where(eq(predictions.id, existing.id));
        return res.json({ ok: true, action: "updated", gameId, pick });
      }
      const [created] = await db.insert(predictions).values({ userId, gameId, pick, predictionType, units: 1, result: "pending" }).returning();
      res.json({ ok: true, action: "inserted", id: created.id, gameId, pick });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/internal/update-user { secret, phone, firstName, lastName, createdAt, membershipTier }
  app.post("/api/internal/update-user", async (req, res) => {
    try {
      const { secret, phone, firstName, lastName, createdAt, membershipTier } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const cleanPhone = (phone || "").replace(/\D/g, "");
      if (!cleanPhone) return res.status(400).json({ error: "phone required" });
      let updated = 0;
      if (firstName !== undefined) { const r = await db.execute(sql`UPDATE users SET first_name = ${firstName} WHERE phone = ${cleanPhone}`); updated += (r as any).rowCount ?? 0; }
      if (lastName !== undefined)  { const r = await db.execute(sql`UPDATE users SET last_name = ${lastName} WHERE phone = ${cleanPhone}`); updated += (r as any).rowCount ?? 0; }
      if (createdAt !== undefined) { const dt = new Date(createdAt); const r = await db.execute(sql`UPDATE users SET created_at = ${dt} WHERE phone = ${cleanPhone}`); updated += (r as any).rowCount ?? 0; }
      if (membershipTier !== undefined) { const r = await db.execute(sql`UPDATE users SET membership_tier = ${membershipTier} WHERE phone = ${cleanPhone}`); updated += (r as any).rowCount ?? 0; }
      res.json({ ok: true, phone: cleanPhone, updated });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/internal/find-user { secret, phone }
  app.post("/api/internal/find-user", async (req, res) => {
    try {
      const { secret, phone } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const cleanPhone = (phone || "").replace(/\D/g, "");
      if (!cleanPhone) return res.status(400).json({ error: "phone required" });
      const rows = await db.execute(sql`SELECT id, first_name, last_name, phone, membership_tier, referral_code, (password_hash IS NOT NULL) as has_password FROM users WHERE phone = ${cleanPhone} LIMIT 1`);
      const user = (rows as any).rows?.[0] ?? null;
      if (!user) return res.status(404).json({ found: false, phone: cleanPhone });
      res.json({ found: true, id: user.id, name: `${user.first_name || ""} ${user.last_name || ""}`.trim(), phone: user.phone, tier: user.membership_tier, referralCode: user.referral_code, hasPassword: user.has_password });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/internal/reset-password { secret, phone, newPassword }
  app.post("/api/internal/reset-password", async (req, res) => {
    try {
      const { secret, phone, newPassword } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const cleanPhone = (phone || "").replace(/\D/g, "");
      if (!cleanPhone || !newPassword) return res.status(400).json({ error: "phone and newPassword required" });
      const bcryptMod = await import("bcryptjs");
      const hash = await bcryptMod.default.hash(newPassword, 10);
      const result = await db.execute(sql`UPDATE users SET password_hash = ${hash} WHERE phone = ${cleanPhone}`);
      res.json({ ok: true, phone: cleanPhone, rowsAffected: (result as any).rowCount ?? "unknown" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/internal/create-user { secret, phone, password, firstName, lastName, tier }
  app.post("/api/internal/create-user", async (req, res) => {
    try {
      const { secret, phone, password, firstName, lastName, tier = "legend" } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const cleanPhone = (phone || "").replace(/\D/g, "");
      if (!cleanPhone || !password) return res.status(400).json({ error: "phone and password required" });
      const bcryptMod = await import("bcryptjs");
      const hash = await bcryptMod.default.hash(password, 10);
      const { randomUUID } = await import("crypto");
      const id = randomUUID();
      const result = await db.execute(sql`INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier) VALUES (${id}, ${cleanPhone}, ${hash}, ${firstName ?? null}, ${lastName ?? null}, ${tier}) RETURNING id, phone, membership_tier`);
      const created = (result as any).rows?.[0];
      res.json({ ok: true, created });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/internal/user-predictions
  // List recent predictions for a user (for fixing misgraded picks).
  // Query: ?secret=&userId=&league=&limit=
  app.get("/api/internal/user-predictions", async (req: any, res) => {
    try {
      const { secret, userId, league, limit } = req.query;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      if (!userId) return res.status(400).json({ error: "userId required" });
      let q = db.select({
        id: predictions.id,
        gameId: predictions.gameId,
        pick: predictions.pick,
        predictionType: predictions.predictionType,
        result: predictions.result,
        createdAt: predictions.createdAt,
        league: games.league,
        homeTeam: games.homeTeam,
        awayTeam: games.awayTeam,
        gameTime: games.gameTime,
      }).from(predictions)
        .leftJoin(games, eq(predictions.gameId, games.id))
        .where(eq(predictions.userId, String(userId)))
        .orderBy(sql`${predictions.id} DESC`)
        .limit(Number(limit) || 30) as any;
      const rows = await q;
      const filtered = league ? rows.filter((r: any) => r.league === league) : rows;
      return res.json(filtered);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/internal/payout-correction
  // Reverse a wrong payout and issue a correction payout to the real winner.
  // Body: { secret, reversePayoutId, correctUserId, correctAmount, periodLabel }
  app.post("/api/internal/payout-correction", async (req, res) => {
    try {
      const { secret, reversePayoutId, correctUserId, correctAmount, periodLabel } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const log: string[] = [];
      if (reversePayoutId) {
        await db.execute(sql`UPDATE payouts SET status = 'reversed' WHERE id = ${Number(reversePayoutId)}`);
        log.push(`Reversed payout id=${reversePayoutId}`);
      }
      if (correctUserId && correctAmount && periodLabel) {
        const { payouts: payoutsTable } = await import("@shared/schema");
        const [inserted] = await db.insert(payoutsTable).values({
          userId: correctUserId,
          amount: Number(correctAmount),
          period: "daily",
          periodLabel,
          rank: 1,
          sharePercent: 10,
          status: "wallet_credited",
          wins: 0,
          losses: 0,
          paidAt: new Date(),
        }).returning({ id: payoutsTable.id });
        log.push(`Issued correction payout id=${inserted?.id} to userId=${correctUserId} amount=$${correctAmount} for ${periodLabel}`);
      }
      const pool = await storage.getPrizePoolTotal();
      const allPaid = await storage.getTotalPayoutsByPeriod(new Date(0));
      log.push(`Pool now: $${Math.floor(pool - allPaid)}`);
      console.log("[payout-correction]", log.join(" | "));
      return res.json({ ok: true, log });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/internal/process-daily-payout  { secret, date?: "2026-05-05" }
  // Triggers the daily prize pool payout without requiring an admin session.
  // Defaults to yesterday's date if not specified.
  app.post("/api/internal/process-daily-payout", async (req, res) => {
    try {
      const { secret, date } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const { processPayoutForPeriod } = await import("./payoutService");

      let periodStart: Date, periodEnd: Date, periodLabel: string;
      if (date) {
        const [y, m, d] = date.split("-").map(Number);
        periodStart = new Date(Date.UTC(y, m - 1, d, 4, 0, 0)); // midnight ET
        periodEnd   = new Date(Date.UTC(y, m - 1, d + 1, 4, 0, 0));
        periodLabel = date;
      } else {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 86400000);
        const yStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(yesterday);
        const [y, m, d] = yStr.split("-").map(Number);
        periodStart = new Date(Date.UTC(y, m - 1, d, 4, 0, 0));
        periodEnd   = new Date(Date.UTC(y, m - 1, d + 1, 4, 0, 0));
        periodLabel = yStr;
      }

      const result = await processPayoutForPeriod("daily", periodLabel, periodStart, periodEnd, console.log);

      // Refresh prize pool total after payout
      const pool = await storage.getPrizePoolTotal();
      const paid = await storage.getTotalPayoutsByPeriod(new Date(0));

      return res.json({ ok: true, period: periodLabel, result, poolAfter: Math.max(0, pool - paid) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/internal/mark-payouts-paid  { secret, ids: [46,47,48] }
  app.post("/api/internal/mark-payouts-paid", async (req, res) => {
    try {
      const { secret, ids } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids must be a non-empty array" });
      for (const id of ids) {
        await db.execute(sql`UPDATE payouts SET status = 'paypal_sent', paid_at = NOW() WHERE id = ${id} AND status != 'paypal_sent'`);
      }
      console.log(`[internal] Marked payouts paid: ${ids.join(", ")}`);
      return res.json({ ok: true, marked: ids });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Example: curl -X POST https://betfans.us/api/internal/add-bfb-results \
  //   -H "Content-Type: application/json" \
  //   -d '{"secret":"bf-internal-k9x2m7","wins":7,"losses":4}'
  app.post("/api/internal/add-bfb-results", async (req, res) => {
    try {
      const { secret, wins, losses } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const addW = parseInt(wins ?? "0", 10);
      const addL = parseInt(losses ?? "0", 10);
      if (isNaN(addW) || isNaN(addL) || (addW === 0 && addL === 0)) {
        return res.status(400).json({ error: "Provide wins and/or losses (integers)" });
      }

      const [nikcoRow] = await db.select().from(users).where(eq(users.referralCode, "NIKCOX")).limit(1);
      if (!nikcoRow) return res.status(404).json({ error: "Nikco account not found" });

      const [existing] = await db
        .select()
        .from(leaderboardEntries)
        .where(and(eq(leaderboardEntries.userId, nikcoRow.id), eq(leaderboardEntries.period, "bfb_ytd")))
        .limit(1);

      if (existing) {
        const newW = (existing.wins ?? 0) + addW;
        const newL = (existing.losses ?? 0) + addL;
        const total = newW + newL;
        const roi = total > 0 ? Math.round((newW / total) * 1000) / 10 : 0;
        await db.update(leaderboardEntries)
          .set({ wins: newW, losses: newL, roi, updatedAt: new Date() })
          .where(and(eq(leaderboardEntries.userId, nikcoRow.id), eq(leaderboardEntries.period, "bfb_ytd")));
        console.log(`[BFB] YTD updated: +${addW}W +${addL}L → ${newW}-${newL}`);
        return res.json({ ok: true, wins: newW, losses: newL, roi, added: { wins: addW, losses: addL } });
      } else {
        // No record yet — seed + add today's results
        const BFB_SEED_WINS = 262, BFB_SEED_LOSSES = 214;
        const newW = BFB_SEED_WINS + addW;
        const newL = BFB_SEED_LOSSES + addL;
        const total = newW + newL;
        const roi = total > 0 ? Math.round((newW / total) * 1000) / 10 : 0;
        await db.insert(leaderboardEntries).values({
          userId: nikcoRow.id, period: "bfb_ytd",
          periodStart: new Date("2026-01-01T00:00:00Z"),
          rank: 1, wins: newW, losses: newL, roi, profit: 45, streak: 5,
        });
        console.log(`[BFB] YTD seeded+added: ${newW}-${newL}`);
        return res.json({ ok: true, wins: newW, losses: newL, roi, added: { wins: addW, losses: addL } });
      }
    } catch (e: any) {
      console.error("[add-bfb-results]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ONE-SHOT: Record April 29 payout to Scott ($9, manually sent via PayPal)
  app.post("/api/internal/fix-april29-payout", async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const SCOTT_ID = "550e8400-e29b-41d4-a716-446655440001";
      const log: string[] = [];
      // Insert payout record (status paypal_sent so it counts as paid out)
      await db.execute(sql`
        INSERT INTO payouts (user_id, amount, period, period_label, rank, share_percent, status, stripe_transfer_id, wins, losses, paid_at, created_at)
        VALUES (
          ${SCOTT_ID}, 9, 'daily', '2026-04-29',
          1, 10, 'paypal_sent', 'manual-paypal-apr29', 12, 7, NOW(), NOW()
        )
      `);
      log.push("✓ Inserted April 29 payout for Scott: $9 paypal_sent");
      const newTotal = await storage.getPrizePoolTotal();
      log.push(`✓ Prize pool is now $${newTotal}`);
      res.json({ ok: true, log });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ONE-SHOT v2: Fix April 28 data using exact same deduplication as daily-scorecard
  app.post("/api/internal/fix-april28-v2", async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });

      const log: string[] = [];

      // ── 1. Find Nikco ────────────────────────────────────────────────────
      const [nikcoRow] = await db.select().from(users).where(eq(users.referralCode, "NIKCOX")).limit(1);
      if (!nikcoRow) return res.status(404).json({ error: "Nikco not found" });
      const nikcoId = nikcoRow.id;

      // ── 2. Replicate daily-scorecard's EXACT date window for April 28 ────
      const dt = new Date("2026-04-29T12:00:00.000Z"); // noon UTC April 29 → daysBack=1 → April 28
      dt.setUTCDate(dt.getUTCDate() - 1);
      const pstStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(dt);
      const [y, m, d] = pstStr.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, d, 8, 0, 0, 0));
      const end   = new Date(Date.UTC(y, m - 1, d + 1, 8, 0, 0, 0));
      log.push(`Window: ${start.toISOString()} → ${end.toISOString()}`);

      // ── 3. Get all April 28 games (same query as daily-scorecard) ─────────
      const dayGamesRaw = await db.select().from(games).where(
        sql`${games.gameTime} >= ${start} AND ${games.gameTime} < ${end}
            AND ${games.status} != 'postponed'
            AND ${games.league} IN ('MLB','NBA','NHL')`
      );
      log.push(`Raw games in window: ${dayGamesRaw.length}`);

      // ── 4. Deduplicate — identical to daily-scorecard logic ───────────────
      interface MatchupGroup { canonicalId: number; allIds: Set<number>; league: string; game: typeof games.$inferSelect }
      const matchupGroups = new Map<string, MatchupGroup>();
      for (const g of dayGamesRaw) {
        const key = `${g.league}|${g.homeTeam}|${g.awayTeam}`;
        if (!matchupGroups.has(key)) {
          matchupGroups.set(key, { canonicalId: g.id, allIds: new Set([g.id]), league: g.league, game: g });
        } else {
          matchupGroups.get(key)!.allIds.add(g.id);
        }
      }

      const allDayIds = dayGamesRaw.map(g => g.id);
      const mlbMatchups = [...matchupGroups.entries()].filter(([k]) => k.startsWith("MLB|"));
      const nbaMatchups = [...matchupGroups.entries()].filter(([k]) => k.startsWith("NBA|"));
      const nhlMatchups = [...matchupGroups.entries()].filter(([k]) => k.startsWith("NHL|"));
      log.push(`Unique matchups: MLB=${mlbMatchups.length} NBA=${nbaMatchups.length} NHL=${nhlMatchups.length}`);

      // ── 5. Nikco's existing picks for this window ────────────────────────
      const existingPicks = allDayIds.length === 0 ? [] : await db.select().from(predictions).where(
        sql`${predictions.userId} = ${nikcoId} AND ${predictions.gameId} IN (${sql.join(allDayIds.map(id => sql`${id}`), sql`, `)})`
      );
      // Map picks to matchup keys
      const pickedMatchupKeys = new Set<string>();
      for (const p of existingPicks) {
        for (const [key, group] of matchupGroups) {
          if (group.allIds.has(p.gameId)) { pickedMatchupKeys.add(key); break; }
        }
      }
      log.push(`Nikco already picked: ${pickedMatchupKeys.size} matchups (${existingPicks.length} prediction rows)`);

      function teamML(g: typeof games.$inferSelect, win: boolean) {
        const homeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
        if (win) return (homeWon ? g.homeTeam : g.awayTeam).split(" ").pop()! + " ML";
        return (homeWon ? g.awayTeam : g.homeTeam).split(" ").pop()! + " ML";
      }

      // ── 6. Insert MLB missing picks: target 7W-8L, currently 1W-2L ───────
      // Missing: 12 matchups → need 6W + 6L
      const missingMLB = mlbMatchups.filter(([k]) => !pickedMatchupKeys.has(k));
      log.push(`Missing MLB matchups: ${missingMLB.length}`);
      let mlbW = 6, mlbL = 6;
      const toInsert: any[] = [];
      for (const [, group] of missingMLB) {
        const g = group.game;
        const win = mlbW > 0;
        toInsert.push({ userId: nikcoId, gameId: group.canonicalId, predictionType: "moneyline",
          pick: teamML(g, win), units: 1, result: win ? "win" : "loss", payout: win ? 1 : -1 });
        if (win) mlbW--; else mlbL--;
      }

      // ── 7. Insert NBA missing picks: target 2W-1L, currently 1W-0L ───────
      // Missing: 2 matchups → need 1W + 1L
      const missingNBA = nbaMatchups.filter(([k]) => !pickedMatchupKeys.has(k));
      log.push(`Missing NBA matchups: ${missingNBA.length}`);
      let nbaW = 1, nbaL = 1;
      for (const [, group] of missingNBA) {
        const g = group.game;
        const win = nbaW > 0;
        toInsert.push({ userId: nikcoId, gameId: group.canonicalId, predictionType: "moneyline",
          pick: teamML(g, win), units: 1, result: win ? "win" : "loss", payout: win ? 1 : -1 });
        if (win) nbaW--; else nbaL--;
      }

      if (toInsert.length > 0) {
        await db.insert(predictions).values(toInsert);
        log.push(`Inserted ${toInsert.length} picks (${toInsert.filter(p=>p.result==="win").length}W-${toInsert.filter(p=>p.result==="loss").length}L)`);
      }

      // ── 8. Fix Scott's daily leaderboard (id=1): wins 15→16, totalPicks 20→21 ─
      // Use id-based update to avoid period_start mismatch
      await db.update(leaderboardEntries)
        .set({ wins: 16, losses: 5, updatedAt: new Date() })
        .where(sql`${leaderboardEntries.id} = 1 AND ${leaderboardEntries.period} = 'daily'`);
      log.push("Scott daily leaderboard (id=1) updated: wins=16");

      // ── 9. Fix Nikco's annual leaderboard to current YTD ─────────────────────
      log.push("Nikco annual leaderboard update skipped — BFB record now stored in bfb_ytd period");

      res.json({ ok: true, log });
    } catch (e: any) {
      console.error("[fix-april28-v2]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ONE-SHOT: Fix April 28 data — Nikco missing picks, Scott leaderboard off by 1
  app.post("/api/internal/fix-april28", async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });

      const log: string[] = [];

      // ── 1. Resolve user IDs ───────────────────────────────────────────────
      const [nikcoRow] = await db.select().from(users).where(eq(users.referralCode, "NIKCOX")).limit(1);
      if (!nikcoRow) return res.status(404).json({ error: "Nikco not found" });
      const nikcoId = nikcoRow.id;

      const [scottRow] = await db.select().from(users)
        .where(eq(users.id, "550e8400-e29b-41d4-a716-446655440001")).limit(1);
      if (!scottRow) return res.status(404).json({ error: "Scott not found" });

      // ── 2. April 28 PST window (= UTC 08:00 Apr28 → UTC 08:00 Apr29) ──────
      const periodStart = new Date("2026-04-28T08:00:00.000Z");
      const periodEnd   = new Date("2026-04-29T08:00:00.000Z");

      const dayGames = await db.select().from(games).where(
        sql`${games.gameTime} >= ${periodStart} AND ${games.gameTime} < ${periodEnd}
            AND ${games.status} = 'finished'
            AND ${games.league} IN ('MLB','NBA','NHL')`
      ).orderBy(asc(games.gameTime));

      const mlbGames = dayGames.filter(g => g.league === "MLB");
      const nbaGames = dayGames.filter(g => g.league === "NBA");
      const nhlGames = dayGames.filter(g => g.league === "NHL");
      log.push(`Games found: MLB=${mlbGames.length} NBA=${nbaGames.length} NHL=${nhlGames.length}`);

      // ── 3. Nikco's existing picks ─────────────────────────────────────────
      const allIds = dayGames.map(g => g.id);
      const existingPicks = allIds.length === 0 ? [] : await db.select().from(predictions).where(
        sql`${predictions.userId} = ${nikcoId} AND ${predictions.gameId} IN (${sql.join(allIds.map(id => sql`${id}`), sql`, `)})`
      );
      const pickedGameIds = new Set(existingPicks.map(p => p.gameId));
      log.push(`Nikco existing picks: ${existingPicks.length} (games: ${[...pickedGameIds].join(",")})`);

      function winningTeamML(g: typeof games.$inferSelect): { winner: string; loser: string } {
        const homeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
        const winner = homeWon ? g.homeTeam.split(" ").pop()! : g.awayTeam.split(" ").pop()!;
        const loser  = homeWon ? g.awayTeam.split(" ").pop()! : g.homeTeam.split(" ").pop()!;
        return { winner, loser };
      }

      // ── 4. Insert missing MLB picks: target 7W-8L, have 1W-2L ─────────────
      // Need 6 more wins + 6 more losses across 12 remaining games
      const missingMLB = mlbGames.filter(g => !pickedGameIds.has(g.id));
      log.push(`Missing MLB games: ${missingMLB.length}`);
      let mlbWinsNeeded = 6, mlbLossesNeeded = 6;
      const mlbInserts: any[] = [];
      for (const g of missingMLB) {
        const { winner, loser } = winningTeamML(g);
        if (mlbWinsNeeded > 0) {
          mlbInserts.push({ userId: nikcoId, gameId: g.id, predictionType: "moneyline", pick: `${winner} ML`, units: 1, result: "win", payout: 1 });
          mlbWinsNeeded--;
        } else if (mlbLossesNeeded > 0) {
          mlbInserts.push({ userId: nikcoId, gameId: g.id, predictionType: "moneyline", pick: `${loser} ML`, units: 1, result: "loss", payout: -1 });
          mlbLossesNeeded--;
        }
      }
      if (mlbInserts.length > 0) {
        await db.insert(predictions).values(mlbInserts);
        log.push(`Inserted ${mlbInserts.length} MLB picks`);
      }

      // ── 5. Insert missing NBA picks: target 2W-1L ─────────────────────────
      const missingNBA = nbaGames.filter(g => !pickedGameIds.has(g.id));
      log.push(`Missing NBA games: ${missingNBA.length}`);
      let nbaWinsNeeded = 2, nbaLossesNeeded = 1;
      const nbaInserts: any[] = [];
      for (const g of missingNBA) {
        const { winner, loser } = winningTeamML(g);
        if (nbaWinsNeeded > 0) {
          nbaInserts.push({ userId: nikcoId, gameId: g.id, predictionType: "moneyline", pick: `${winner} ML`, units: 1, result: "win", payout: 1 });
          nbaWinsNeeded--;
        } else if (nbaLossesNeeded > 0) {
          nbaInserts.push({ userId: nikcoId, gameId: g.id, predictionType: "moneyline", pick: `${loser} ML`, units: 1, result: "loss", payout: -1 });
          nbaLossesNeeded--;
        }
      }
      if (nbaInserts.length > 0) {
        await db.insert(predictions).values(nbaInserts);
        log.push(`Inserted ${nbaInserts.length} NBA picks`);
      }

      // ── 6. Fix Scott's daily leaderboard: 15-5 (20 picks) → 16-5 (21 picks) ─
      const scottDailyFixed = await db.update(leaderboardEntries)
        .set({ wins: 16, losses: 5, updatedAt: new Date(), roi: 76.19, profit: 11 })
        .where(and(
          eq(leaderboardEntries.userId, scottRow.id),
          eq(leaderboardEntries.period, "daily"),
          sql`${leaderboardEntries.periodStart} = ${periodStart}`
        ));
      log.push(`Scott daily leaderboard updated`);

      // ── 7. Fix Nikco's annual leaderboard to current YTD ────────────────
      log.push(`Nikco annual leaderboard update skipped — BFB record now stored in bfb_ytd period`);

      res.json({ ok: true, log });
    } catch (e: any) {
      console.error("[fix-april28]", e);
      res.status(500).json({ error: e.message, stack: e.stack });
    }
  });

  // POST /api/internal/set-prize-pool { secret, amount }
  // Adjusts the pool to an absolute balance by inserting a delta row — does NOT wipe history.
  // Payout deduction rows are preserved so the auto-deduction cycle stays intact.
  app.post("/api/internal/set-prize-pool", async (req, res) => {
    try {
      const { secret, amount } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const bal = parseFloat(amount);
      if (isNaN(bal)) return res.status(400).json({ error: "amount must be a number" });
      // Compute current total without wiping history
      const current = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric),0) AS total FROM prize_pool_contributions`);
      const currentTotal = Number((current as any).rows?.[0]?.total ?? 0);
      const delta = bal - currentTotal;
      // Insert a delta row so the net total equals the requested balance
      await db.execute(sql`INSERT INTO prize_pool_contributions (user_id, amount, source, created_at) VALUES (NULL, ${delta}, 'admin_adjust', NOW())`);
      const check = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric),0) AS total FROM prize_pool_contributions`);
      res.json({ ok: true, previousTotal: currentTotal, delta, newTotal: Number((check as any).rows?.[0]?.total ?? 0) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Retry a payout using the subscription refund path (bypasses Payouts API)
  app.post("/api/internal/retry-sub-refund", async (req, res) => {
    try {
      const { secret, payoutId, userId, amount, note } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      const { sendPayPalSubscriptionRefund } = await import("./paypalService");
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const subscriptionId = user.paypalSubscriptionId;
      if (!subscriptionId) return res.status(404).json({ error: "No subscription ID on file for user" });
      const result = await sendPayPalSubscriptionRefund(subscriptionId, amount, note || `BetFans prize payout`);
      if (payoutId) {
        await storage.updatePayout(payoutId, { stripeTransferId: result.refundId, status: "paypal_sent", paidAt: new Date() });
      }
      res.json({ ok: true, refundId: result.refundId, status: result.status });
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

  // POST /api/internal/set-counter { secret, key, value }
  app.post("/api/internal/set-counter", async (req, res) => {
    try {
      const { secret, key, value } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      if (!key || value === undefined) return res.status(400).json({ error: "key and value required" });
      await db.execute(sql`
        INSERT INTO site_counters (key, value, updated_at)
        VALUES (${key}, ${Number(value)}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${Number(value)}, updated_at = NOW()
      `);
      res.json({ ok: true, key, value: Number(value) });
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

  // POST /api/internal/retry-subscription { secret, subscriptionId, addToPool }
  app.post("/api/internal/retry-subscription", async (req, res) => {
    try {
      const { secret, subscriptionId, addToPool } = req.body;
      if (secret !== "bf-internal-k9x2m7") return res.status(403).json({ error: "forbidden" });
      if (!subscriptionId) return res.status(400).json({ error: "subscriptionId required" });

      // Look up user by subscription ID
      const userRows = await db.execute(sql`
        SELECT id, first_name, last_name, phone, membership_tier, referral_code, referred_by,
               paypal_subscription_id, paypal_payout_email
        FROM users WHERE paypal_subscription_id = ${subscriptionId} LIMIT 1
      `);
      const user = (userRows as any).rows?.[0] ?? null;

      // Get subscription details from PayPal
      const { getSubscriptionDetails, retrySubscriptionPayment } = await import("./paypalService");
      const subDetails = await getSubscriptionDetails(subscriptionId).catch(() => null);

      // Trigger the retry
      const retryResult = await retrySubscriptionPayment(subscriptionId);

      // Optionally add to prize pool
      let poolResult = null;
      if (addToPool) {
        const amount = parseFloat(addToPool);
        if (!isNaN(amount) && amount > 0) {
          await db.execute(sql`
            INSERT INTO prize_pool_contributions (user_id, amount, source, created_at)
            VALUES (${user?.id ?? null}, ${amount}, 'manual_contribution', NOW())
          `);
          const newTotal = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric),0) AS total FROM prize_pool_contributions`);
          poolResult = { added: amount, newTotal: Number((newTotal as any).rows?.[0]?.total ?? 0) };
        }
      }

      res.json({
        ok: retryResult.ok,
        retryDetail: retryResult.detail,
        user: user ? { id: user.id, name: `${user.first_name || ""} ${user.last_name || ""}`.trim(), tier: user.membership_tier, referredBy: user.referred_by } : null,
        subscription: subDetails ? { status: subDetails.status, planId: subDetails.plan_id, email: subDetails.subscriber?.email_address } : null,
        poolResult,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
