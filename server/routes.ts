import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";
import { db } from "./db";
import { users, referrals, games, predictions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { insertPredictionSchema, insertChatMessageSchema, insertBraggingPostSchema, insertBraggingCommentSchema, insertThreadSchema, insertThreadReplySchema, insertAdvertiserSchema } from "@shared/schema";
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

  app.get("/api/baseball-breakfast", async (req, res) => {
    try {
      const [founderRow] = await db.select().from(users).where(eq(users.referralCode, "NIKCOX")).limit(1);
      const founder = founderRow || null;

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

      // --- Read today's MLB games from DB (populated by the 5-min sync) ---
      const dbMlbGames = await db.select().from(games).where(
        sql`${games.league} = 'MLB' AND ${games.gameTime} >= ${todayStart} AND ${games.gameTime} < ${todayEnd}`
      );

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

      // --- Founder stats ---
      let stats = { wins: 0, losses: 0, profit: 0, roi: 0, streak: 0, totalPicks: 0 };
      if (founder) {
        const allDbMlb = await storage.getGames("MLB");
        const allMlbIds = new Set(allDbMlb.map((g) => g.id));
        const allPredictions = await storage.getUserPredictions(founder.id);
        const mlbPredictions = allPredictions.filter((p) => allMlbIds.has(p.gameId));
        const wins = mlbPredictions.filter((p) => p.result === "win").length;
        const losses = mlbPredictions.filter((p) => p.result === "loss").length;
        const profit = mlbPredictions.reduce((acc, p) => acc + (p.payout || 0), 0);
        const total = wins + losses;
        const roi = total > 0 ? (profit / total) * 100 : 0;
        let streak = 0;
        for (const p of [...mlbPredictions].sort((a,b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())) {
          if (p.result === "win") streak++; else break;
        }
        stats = { wins, losses, profit: Math.round(profit*100)/100, roi: Math.round(roi*100)/100, streak, totalPicks: total };
      }

      // --- Today's founder picks ---
      const todayPredictions = founder
        ? await db.select().from(predictions).where(
            sql`${predictions.userId} = ${founder.id} AND ${predictions.createdAt} >= ${todayStart} AND ${predictions.createdAt} <= ${todayEnd}`
          )
        : [];

      const gamesWithAnalysis = dbMlbGames.map((g) => {
        const apiGame = mlbApiGames.find((a: any) => teamMatch(g.homeTeam, a.homeTeam) && teamMatch(g.awayTeam, a.awayTeam));
        // Prefer live ESPN status over potentially-stale DB status
        const liveESPN = espnStatusMap.get(`${g.awayTeam}|${g.homeTeam}`);
        const liveStatus = liveESPN?.status || g.status;
        const liveHomeScore = liveESPN?.homeScore ?? g.homeScore;
        const liveAwayScore = liveESPN?.awayScore ?? g.awayScore;
        const spider = { pick: g.spiderPick || "", confidence: g.spiderConfidence || 60, type: "Moneyline" };
        const founderPick = todayPredictions.find((p) => p.gameId === g.id) || null;
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
          spider, founderPick,
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
      res.json(games);
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
      const predictions = await storage.getUserPredictions(userId);
      res.json(predictions);
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

  app.get("/api/leaderboard", async (req, res) => {
    try {
      const period = (req.query.period as string) || "weekly";
      const league = req.query.league as string | undefined;

      if (league && league !== "ALL") {
        const sportLeaderboard = await storage.getLeaderboardByLeague(period, league);
        return res.json(sportLeaderboard);
      }

      const leaderboard = await storage.getLeaderboard(period);
      res.json(leaderboard);
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
          return {
            userId: r.userId,
            activeReferrals: r.activeReferrals,
            firstName: user?.firstName || null,
            lastName: user?.lastName || null,
            profileImageUrl: user?.profileImageUrl || null,
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
      const weekStart = new Date(dayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      if (weekStart > now) weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const [daily, weekly, monthly, annual] = await Promise.all([
        storage.getPrizePoolTotalByPeriod(dayStart),
        storage.getPrizePoolTotalByPeriod(weekStart),
        storage.getPrizePoolTotalByPeriod(monthStart),
        storage.getPrizePoolTotalByPeriod(yearStart),
      ]);

      res.json({ amount: total, daily, weekly, monthly, annual });
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
              // Instant signup bonus to referrer's wallet ($50 for Legend referrals, $1 otherwise)
              const signupBonus = (confirmedTier === "legend" || referrer.membershipTier === "legend") ? 50 : 1;
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
              // Add prize pool contribution on monthly renewal (not initial — that's handled by /api/paypal/subscription)
              if (resourceType === "BILLING.SUBSCRIPTION.RENEWED") {
                const tierPrices: Record<string, number> = { rookie: 19, pro: 29, legend: 99 };
                const prizeContribution = (tierPrices[tier] || 0) * 0.5;
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

  app.get("/api/bragging", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const posts = await storage.getBraggingPosts(limit, offset);
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  app.get("/api/bragging/liked", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const likedPosts = await storage.getUserLikedPosts(userId);
      res.json(likedPosts);
    } catch (error) {
      res.json([]);
    }
  });

  app.post("/api/bragging", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const user = await storage.getUser(userId);
      if (!user || user.membershipTier === "rookie") {
        return res.status(403).json({ message: "Membership required to post bragging rights" });
      }
      const parsed = insertBraggingPostSchema.parse({ ...req.body, userId });
      const post = await storage.createBraggingPost(parsed);
      res.status(201).json(post);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid post data" });
    }
  });

  app.delete("/api/bragging/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const deleted = await storage.deleteBraggingPost(parseInt(req.params.id), userId);
      if (!deleted) return res.status(404).json({ message: "Post not found or not authorized" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  app.get("/api/bragging/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getBraggingComments(parseInt(req.params.id));
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/bragging/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const user = await storage.getUser(userId);
      if (!user || user.membershipTier === "rookie") {
        return res.status(403).json({ message: "Membership required to comment" });
      }
      const parsed = insertBraggingCommentSchema.parse({
        postId: parseInt(req.params.id),
        userId,
        content: req.body.content,
      });
      const comment = await storage.createBraggingComment(parsed);
      res.status(201).json(comment);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid comment" });
    }
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

  app.post("/api/bragging/:id/like", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const result = await storage.toggleBraggingLike(parseInt(req.params.id), userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle like" });
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

  const PAYOUT_SPLITS: Record<string, number[]> = {
    daily: [0.50, 0.30, 0.20],
    weekly: [0.35, 0.25, 0.20, 0.12, 0.08],
    monthly: [0.40, 0.25, 0.15, 0.12, 0.08],
    annual: [0.30, 0.20, 0.15, 0.10, 0.08, 0.05, 0.04, 0.03, 0.03, 0.02],
  };

  app.post("/api/payouts/process", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { period } = req.body;
      if (!period || !PAYOUT_SPLITS[period]) {
        return res.status(400).json({ message: "Invalid period. Use daily, weekly, monthly, or annual." });
      }

      const splits = PAYOUT_SPLITS[period];
      const topCount = splits.length;
      // Prize pool eligibility: MLB winners only — keeps members focused on daily MLB
      const leaderboard = (await storage.getLeaderboardByLeague(period, "MLB", topCount * 5))
        .filter((e: any) => e.wins > 0)
        .slice(0, topCount);

      if (leaderboard.length === 0) {
        return res.status(400).json({ message: "No leaderboard entries for this period" });
      }

      const now = new Date();
      let periodStart: Date;
      if (period === "daily") {
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === "weekly") {
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodStart.setDate(periodStart.getDate() - periodStart.getDay() + 1);
        if (periodStart > now) periodStart.setDate(periodStart.getDate() - 7);
      } else if (period === "monthly") {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        periodStart = new Date(now.getFullYear(), 0, 1);
      }

      const poolAmount = await storage.getPrizePoolTotalByPeriod(periodStart);
      if (poolAmount <= 0) {
        return res.status(400).json({ message: "No prize pool funds for this period" });
      }

      const periodLabel = period === "daily"
        ? now.toISOString().split("T")[0]
        : period === "weekly"
          ? `${now.getFullYear()}-W${Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 604800000)}`
          : period === "monthly"
            ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
            : `${now.getFullYear()}`;

      const existing = await storage.getPayoutsByPeriod(period, periodLabel);
      if (existing.length > 0) {
        return res.status(400).json({ message: `Payouts already processed for ${period} ${periodLabel}` });
      }

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      const results: any[] = [];

      for (let i = 0; i < Math.min(leaderboard.length, topCount); i++) {
        const entry = leaderboard[i];
        const share = splits[i];
        const payoutAmount = Math.floor(poolAmount * share * 100) / 100;

        if (payoutAmount < 1) continue;

        // Skip members whose payment has lapsed (Legend grace or otherwise)
        const entryUser = await storage.getUser(entry.userId);
        if (entryUser?.subscriptionCancelledAt) {
          results.push({ userId: entry.userId, rank: i + 1, skipped: true, reason: "Payment lapsed — not eligible for prize pool (MLB winners only)" });
          continue;
        }

        const payout = await storage.createPayout({
          userId: entry.userId,
          amount: payoutAmount,
          period,
          periodLabel,
          rank: i + 1,
          sharePercent: share * 100,
        });

        let stripeStatus = "pending";
        let stripeId = null;

        try {
          const user = await storage.getUser(entry.userId);
          if (user?.stripeCustomerId) {
            const customer = await stripe.customers.retrieve(user.stripeCustomerId) as any;
            const defaultPaymentMethod = customer.invoice_settings?.default_payment_method
              || customer.default_source;

            if (defaultPaymentMethod) {
              const paymentMethod = await stripe.paymentMethods.retrieve(
                typeof defaultPaymentMethod === "string" ? defaultPaymentMethod : defaultPaymentMethod.id
              );

              if (paymentMethod.type === "card" && paymentMethod.card) {
                const transfer = await stripe.refunds.create({
                  amount: Math.round(payoutAmount * 100),
                  payment_intent: undefined as any,
                  metadata: {
                    type: "prize_payout",
                    period,
                    periodLabel,
                    rank: String(i + 1),
                    userId: entry.userId,
                  },
                  reason: "requested_by_customer",
                  instructions_email: user.email || undefined,
                } as any).catch(async () => {
                  const balanceTx = await stripe.customers.createBalanceTransaction(
                    user.stripeCustomerId!,
                    {
                      amount: -Math.round(payoutAmount * 100),
                      currency: "usd",
                      description: `BetFans ${period} prize payout - Rank #${i + 1} (${(share * 100).toFixed(0)}% share)`,
                    }
                  );
                  return balanceTx;
                });

                stripeId = (transfer as any).id;
                stripeStatus = "paid";
              } else {
                const balanceTx = await stripe.customers.createBalanceTransaction(
                  user.stripeCustomerId,
                  {
                    amount: -Math.round(payoutAmount * 100),
                    currency: "usd",
                    description: `BetFans ${period} prize payout - Rank #${i + 1} (${(share * 100).toFixed(0)}% share)`,
                  }
                );
                stripeId = balanceTx.id;
                stripeStatus = "credited";
              }
            } else {
              const balanceTx = await stripe.customers.createBalanceTransaction(
                user.stripeCustomerId,
                {
                  amount: -Math.round(payoutAmount * 100),
                  currency: "usd",
                  description: `BetFans ${period} prize payout - Rank #${i + 1} (${(share * 100).toFixed(0)}% share)`,
                }
              );
              stripeId = balanceTx.id;
              stripeStatus = "credited";
            }
          }
        } catch (err: any) {
          console.error(`Payout Stripe error for user ${entry.userId}:`, err.message);
          stripeStatus = "failed";
        }

        await storage.updatePayout(payout.id, {
          stripeTransferId: stripeId,
          status: stripeStatus,
          paidAt: stripeStatus === "paid" || stripeStatus === "credited" ? new Date() : null,
        });

        const updatedUser = await storage.getUser(entry.userId);
        if (updatedUser) {
          const currentBalance = parseFloat(updatedUser.walletBalance || "0");
          await storage.updateUser(entry.userId, {
            walletBalance: String(currentBalance + payoutAmount),
          });
        }

        results.push({
          rank: i + 1,
          userId: entry.userId,
          name: entry.user ? `${entry.user.firstName || ""} ${entry.user.lastName || ""}`.trim() : "Member",
          amount: payoutAmount,
          share: (share * 100).toFixed(0) + "%",
          status: stripeStatus,
        });
      }

      console.log(`Payouts processed for ${period} ${periodLabel}:`, results);
      res.json({ period, periodLabel, poolAmount, payouts: results });
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

  return httpServer;
}
