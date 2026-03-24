import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";
import { db } from "./db";
import { users, referrals } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { insertPredictionSchema, insertChatMessageSchema, insertBraggingPostSchema, insertBraggingCommentSchema, insertMusicTrackSchema, insertThreadSchema, insertThreadReplySchema, insertAdvertiserSchema } from "@shared/schema";
import { stripeService } from "./stripeService";
import { WebhookHandlers } from "./webhookHandlers";
import { WebSocketServer } from "ws";
import multer from "multer";
import { syncSportsData } from "./sportsDataService";
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
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

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
      const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}&hydrate=team,linescore`;
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

      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10);
      const mlbGames = await fetchMLBSchedule(dateStr);

      let picks: any[] = [];
      let stats = { wins: 0, losses: 0, profit: 0, roi: 0, streak: 0, totalPicks: 0 };

      if (founder) {
        const allPredictions = await storage.getUserPredictions(founder.id);
        const allGames = await storage.getGames("MLB");
        const mlbGameIds = new Set(allGames.map((g) => g.id));
        const mlbPredictions = allPredictions.filter((p) => mlbGameIds.has(p.gameId));

        today.setHours(0, 0, 0, 0);
        const todayPicks = mlbPredictions.filter((p) => {
          const d = new Date(p.createdAt!);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === today.getTime();
        });

        picks = todayPicks.map((p) => {
          const game = allGames.find((g) => g.id === p.gameId);
          return { ...p, game: game || null };
        });

        const wins = mlbPredictions.filter((p) => p.result === "win").length;
        const losses = mlbPredictions.filter((p) => p.result === "loss").length;
        const profit = mlbPredictions.reduce((acc, p) => acc + (p.payout || 0), 0);
        const total = wins + losses;
        const roi = total > 0 ? (profit / total) * 100 : 0;
        let streak = 0;
        const sorted = [...mlbPredictions].sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
        for (const p of sorted) { if (p.result === "win") streak++; else break; }
        stats = { wins, losses, profit: Math.round(profit * 100) / 100, roi: Math.round(roi * 100) / 100, streak, totalPicks: total };
      }

      const gamesWithAnalysis = mlbGames.map((g, i) => {
        const spider = spiderAnalysis(g.awayTeam, g.homeTeam, i + g.mlbGamePk);
        const founderPick = picks.find((p) => p.game?.homeTeam === g.homeTeam && p.game?.awayTeam === g.awayTeam);
        return { ...g, spider, founderPick: founderPick || null };
      });

      res.json({
        founder: founder ? { id: founder.id, firstName: founder.firstName, lastName: founder.lastName, profileImageUrl: founder.profileImageUrl } : null,
        games: gamesWithAnalysis,
        picks,
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

      const { homeTeam, awayTeam, gameTime, predictionType, pick, odds } = req.body;
      if (!homeTeam || !awayTeam || !predictionType || !pick) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      let game = (await storage.getGames("MLB")).find(
        (g) => g.homeTeam === homeTeam && g.awayTeam === awayTeam
      );

      if (!game) {
        game = await storage.createGame({
          league: "MLB",
          homeTeam,
          awayTeam,
          gameTime: gameTime ? new Date(gameTime) : new Date(),
          status: "upcoming",
          isProLocked: false,
        });
      }

      const prediction = await storage.createPrediction({
        userId,
        gameId: game.id,
        predictionType,
        pick,
        units: 1,
        odds: odds?.toString() || null,
        result: "pending",
        payout: 0,
      });

      res.status(201).json({ prediction, game });
    } catch (error: any) {
      console.error("Baseball breakfast pick error:", error);
      res.status(500).json({ message: "Failed to post pick" });
    }
  });

  app.patch("/api/baseball-breakfast/pick/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!me || me.referralCode !== "NIKCOX") {
        return res.status(403).json({ message: "Only the Founder can update picks" });
      }

      const { result } = req.body;
      if (!["win", "loss", "push", "pending"].includes(result)) {
        return res.status(400).json({ message: "Invalid result" });
      }

      const payout = result === "win" ? 1 : result === "push" ? 0 : -1;
      const updated = await storage.updatePrediction(parseInt(req.params.id), { result, payout });
      res.json(updated);
    } catch (error) {
      console.error("Pick update error:", error);
      res.status(500).json({ message: "Failed to update pick" });
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

  // ===== MERCH / DROPSHIP ROUTES =====

  const MERCH_CATALOG: Record<string, { wholesalePrice: number; retailPrice: number; name: string; dropshipSku: string; provider: "cj" | "printify" }> = {
    "bf-basketball-1": { wholesalePrice: 18.00, retailPrice: 49.99, name: "BetFans Pro Basketball", dropshipSku: "CJ-BBALL-001", provider: "cj" },
    "bf-football-1": { wholesalePrice: 15.00, retailPrice: 44.99, name: "Spider AI Game Football", dropshipSku: "CJ-FBALL-001", provider: "cj" },
    "bf-soccer-1": { wholesalePrice: 12.00, retailPrice: 39.99, name: "BetFans Match Soccer Ball", dropshipSku: "CJ-SOCCER-001", provider: "cj" },
    "bf-jersey-1": { wholesalePrice: 25.00, retailPrice: 89.99, name: "Legend Tier Basketball Jersey", dropshipSku: "PRNT-JERSEY-001", provider: "printify" },
    "bf-hockey-1": { wholesalePrice: 8.00, retailPrice: 29.99, name: "BetFans Ice Hockey Puck Set", dropshipSku: "CJ-HOCKEY-001", provider: "cj" },
    "bf-baseball-1": { wholesalePrice: 7.00, retailPrice: 24.99, name: "Spider AI Training Baseball Set", dropshipSku: "CJ-BSET-001", provider: "cj" },
    "bf-sportsbag-1": { wholesalePrice: 20.00, retailPrice: 59.99, name: "Gameday Sports Duffle", dropshipSku: "CJ-DUFFLE-001", provider: "cj" },
    "bf-stadium-1": { wholesalePrice: 10.00, retailPrice: 34.99, name: "BetFans Stadium Blanket", dropshipSku: "CJ-BLANKET-001", provider: "cj" },
    "bf-training-1": { wholesalePrice: 18.00, retailPrice: 54.99, name: "Pro Picks Training Gear Kit", dropshipSku: "CJ-TRAIN-001", provider: "cj" },
    "bf-waterbottle-1": { wholesalePrice: 8.00, retailPrice: 29.99, name: "BetFans Hydro Sports Bottle", dropshipSku: "CJ-BOTTLE-001", provider: "cj" },
  };

  app.get("/api/merch/catalog", (_req, res) => {
    const catalog = Object.entries(MERCH_CATALOG).map(([id, item]) => ({
      id,
      name: item.name,
      retailPrice: item.retailPrice,
      dropshipSku: item.dropshipSku,
    }));
    res.json(catalog);
  });

  app.post("/api/merch/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const { items, shipping } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }
      if (!shipping || !shipping.name || !shipping.address || !shipping.city || !shipping.state || !shipping.zip) {
        return res.status(400).json({ message: "Shipping address required" });
      }

      let subtotal = 0;
      let wholesaleCost = 0;
      const orderItems: any[] = [];

      for (const item of items) {
        const catalogItem = MERCH_CATALOG[item.id];
        if (!catalogItem) return res.status(400).json({ message: `Unknown product: ${item.id}` });

        const qty = item.quantity || 1;
        subtotal += catalogItem.retailPrice * qty;
        wholesaleCost += catalogItem.wholesalePrice * qty;
        orderItems.push({
          id: item.id,
          name: catalogItem.name,
          sku: catalogItem.dropshipSku,
          provider: catalogItem.provider,
          quantity: qty,
          size: item.size || "",
          color: item.color || "",
          retailPrice: catalogItem.retailPrice,
          wholesalePrice: catalogItem.wholesalePrice,
        });
      }

      const shippingCost = subtotal >= 75 ? 0 : 7.99;
      const totalCharged = subtotal + shippingCost;
      const platformProfit = subtotal - wholesaleCost;

      const stripe = (await import("./stripeClient")).getUncachableStripeClient();
      const stripeClient = await stripe;

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeClient.customers.create({
          email: user.email || undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await storage.updateUser(userId, { stripeCustomerId: customer.id });
      }

      const session = await stripeClient.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: orderItems.map((oi) => ({
          price_data: {
            currency: "usd",
            product_data: { name: oi.name, description: `Size: ${oi.size || "N/A"}, Color: ${oi.color || "N/A"}` },
            unit_amount: Math.round(oi.retailPrice * 100),
          },
          quantity: oi.quantity,
        })).concat(shippingCost > 0 ? [{
          price_data: {
            currency: "usd",
            product_data: { name: "Shipping", description: "Standard shipping (free on orders $75+)" },
            unit_amount: Math.round(shippingCost * 100),
          },
          quantity: 1,
        }] : []),
        mode: "payment",
        success_url: `${req.headers.origin || req.protocol + "://" + req.get("host")}/merch/order-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin || req.protocol + "://" + req.get("host")}/merch`,
      });

      const order = await storage.createMerchOrder({
        userId,
        stripeCheckoutSessionId: session.id,
        status: "pending",
        fulfillmentStatus: "unfulfilled",
        items: JSON.stringify(orderItems),
        shippingName: shipping.name,
        shippingAddress: shipping.address,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingZip: shipping.zip,
        shippingCountry: shipping.country || "US",
        shippingEmail: shipping.email || user.email || null,
        shippingPhone: shipping.phone || null,
        fulfillmentProvider: [...new Set(orderItems.map((oi: any) => oi.provider))].join("+"),
        subtotal,
        wholesaleCost,
        shippingCost,
        totalCharged,
        platformProfit,
      });

      res.json({ checkoutUrl: session.url, orderId: order.id });
    } catch (error: any) {
      console.error("[merch] checkout error:", error);
      res.status(500).json({ message: "Checkout failed" });
    }
  });

  app.get("/api/merch/order-status", isAuthenticated, async (req: any, res) => {
    try {
      const sessionId = req.query.session_id as string;
      if (!sessionId) return res.status(400).json({ message: "session_id required" });

      const order = await storage.getMerchOrderByCheckoutSession(sessionId);
      if (!order) return res.status(404).json({ message: "Order not found" });

      if (order.status === "pending") {
        const stripe = await (await import("./stripeClient")).getUncachableStripeClient();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === "paid") {
          await storage.updateMerchOrder(order.id, {
            status: "paid",
            stripePaymentIntentId: session.payment_intent as string,
          });
          order.status = "paid";
        }
      }

      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get order status" });
    }
  });

  app.get("/api/merch/orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const orders = await storage.getUserMerchOrders(userId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to get orders" });
    }
  });

  app.get("/api/merch/admin/orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (!adminIds.includes(userId)) return res.status(403).json({ message: "Admin only" });

      const orders = await storage.getAllMerchOrders();
      const stats = await storage.getMerchProfitStats();

      const ordersWithMargin = orders.map((o) => ({
        ...o,
        marginPercent: o.subtotal > 0 ? Math.round(((o.platformProfit / o.subtotal) * 100) * 100) / 100 : 0,
      }));

      res.json({ orders: ordersWithMargin, stats });
    } catch (error) {
      res.status(500).json({ message: "Failed to get orders" });
    }
  });

  app.get("/api/merch/admin/profit-margins", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (!adminIds.includes(userId)) return res.status(403).json({ message: "Admin only" });

      const stats = await storage.getMerchProfitStats();

      const catalogMargins = Object.entries(MERCH_CATALOG).map(([id, item]) => ({
        productId: id,
        name: item.name,
        retailPrice: item.retailPrice,
        wholesalePrice: item.wholesalePrice,
        profitPerUnit: Math.round((item.retailPrice - item.wholesalePrice) * 100) / 100,
        marginPercent: Math.round(((item.retailPrice - item.wholesalePrice) / item.retailPrice) * 10000) / 100,
        provider: item.provider,
      }));

      res.json({
        summary: {
          totalRevenue: stats.totalRevenue,
          totalWholesaleCost: stats.totalWholesale,
          totalShippingCollected: stats.totalShipping,
          totalProfit: stats.totalProfit,
          overallMarginPercent: stats.profitMarginPercent,
          totalOrders: stats.totalOrders,
          pendingFulfillment: stats.pendingFulfillment,
          avgOrderValue: stats.totalOrders > 0 ? Math.round((stats.totalRevenue / stats.totalOrders) * 100) / 100 : 0,
          avgProfitPerOrder: stats.totalOrders > 0 ? Math.round((stats.totalProfit / stats.totalOrders) * 100) / 100 : 0,
        },
        catalogMargins,
        productPerformance: stats.byProduct,
        monthlyBreakdown: stats.byMonth,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get profit margins" });
    }
  });

  app.patch("/api/merch/admin/orders/:id/fulfill", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (!adminIds.includes(userId)) return res.status(403).json({ message: "Admin only" });

      const orderId = parseInt(req.params.id);
      const { fulfillmentStatus, trackingNumber, trackingUrl, dropshipperOrderId, notes } = req.body;

      const updated = await storage.updateMerchOrder(orderId, {
        ...(fulfillmentStatus && { fulfillmentStatus }),
        ...(trackingNumber && { trackingNumber }),
        ...(trackingUrl && { trackingUrl }),
        ...(dropshipperOrderId && { dropshipperOrderId }),
        ...(notes && { notes }),
      });

      if (!updated) return res.status(404).json({ message: "Order not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  app.post("/api/merch/admin/forward-to-dropshipper", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (!adminIds.includes(userId)) return res.status(403).json({ message: "Admin only" });

      const { orderId } = req.body;
      const order = await storage.getMerchOrder(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });

      const items = JSON.parse(order.items);

      const fulfillmentItems = items.map((i: any) => {
        const catalogItem = MERCH_CATALOG[i.id];
        return {
          productId: i.id,
          name: i.name || catalogItem?.name || i.id,
          sku: catalogItem?.dropshipSku || i.sku || i.id,
          quantity: i.quantity || 1,
          wholesalePrice: catalogItem?.wholesalePrice || 0,
          provider: catalogItem?.provider || "manual" as const,
          variantId: i.variantId,
        };
      });

      const shipping = {
        name: order.shippingName,
        address: order.shippingAddress,
        city: order.shippingCity,
        state: order.shippingState,
        zip: order.shippingZip,
        country: order.shippingCountry || "US",
        email: order.shippingEmail || undefined,
      };

      const { fulfillOrder, getFulfillmentStatus } = await import("./dropship/fulfillment");
      const results = await fulfillOrder(String(order.id), fulfillmentItems, shipping);

      const allSuccess = results.every((r) => r.success);
      const providerOrderIds = results.map((r) => `${r.provider}:${r.orderId || "pending"}`).join(", ");

      await storage.updateMerchOrder(order.id, {
        fulfillmentStatus: allSuccess ? "processing" : "failed",
        dropshipperOrderId: providerOrderIds,
        notes: `Fulfilled via ${results.map((r) => r.provider).join(" + ")} at ${new Date().toISOString()}${results.some((r) => !r.success) ? ` | Errors: ${results.filter((r) => !r.success).map((r) => `${r.provider}: ${r.error}`).join("; ")}` : ""}`,
      });

      res.json({
        message: allSuccess ? "Order sent to fulfillment providers" : "Some fulfillment providers failed",
        results,
        providerStatus: getFulfillmentStatus(),
      });
    } catch (error: any) {
      console.error("[dropship] Fulfillment error:", error);
      res.status(500).json({ message: "Failed to forward order", error: error.message });
    }
  });

  app.get("/api/merch/admin/fulfillment-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (!adminIds.includes(userId)) return res.status(403).json({ message: "Admin only" });

      const { getFulfillmentStatus } = await import("./dropship/fulfillment");
      const status = getFulfillmentStatus();
      res.json({
        providers: {
          cj: { connected: status.cj, name: "CJ Dropshipping", handles: "Sports equipment (balls, gear, accessories)" },
          printify: { connected: status.printify, name: "Printify", handles: "Branded apparel (jerseys, shirts)" },
        },
        catalog: Object.entries(MERCH_CATALOG).map(([id, item]) => ({
          id,
          name: item.name,
          provider: item.provider,
          sku: item.dropshipSku,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get fulfillment status" });
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
  function isAdmin(req: any, res: any, next: any) {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(403).json({ message: "Admin access required" });
    if (ADMIN_USER_IDS.length > 0 && !ADMIN_USER_IDS.includes(userId)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  }

  app.get("/api/music/tracks", async (req, res) => {
    try {
      const date = req.query.date as string || new Date().toISOString().split("T")[0];
      let tracks = await storage.getMusicTracks(date);
      if (tracks.length === 0) {
        tracks = await storage.getMusicTracks();
      }
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tracks" });
    }
  });

  app.get("/api/music/tracks/all", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const tracks = await storage.getMusicTracks();
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tracks" });
    }
  });

  app.post("/api/music/tracks", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const data = { ...req.body };
      if (data.sunoId && !/^[a-f0-9-]{36}$/i.test(data.sunoId)) {
        try {
          const resp = await fetch(`https://suno.com/s/${data.sunoId}`);
          const html = await resp.text();
          const match = html.match(/cdn[0-9]*\.suno\.ai\/([a-f0-9-]{36})\.mp3/);
          if (match) data.sunoId = match[1];
        } catch {}
      }
      const parsed = insertMusicTrackSchema.parse(data);
      const track = await storage.createMusicTrack(parsed);
      res.status(201).json(track);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Invalid track data" });
    }
  });

  app.patch("/api/music/tracks/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const track = await storage.updateMusicTrack(parseInt(req.params.id), req.body);
      if (!track) return res.status(404).json({ message: "Track not found" });
      res.json(track);
    } catch (error) {
      res.status(500).json({ message: "Failed to update track" });
    }
  });

  app.delete("/api/music/tracks/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const deleted = await storage.deleteMusicTrack(parseInt(req.params.id));
      if (!deleted) return res.status(404).json({ message: "Track not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete track" });
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

  app.post("/api/user/avatar", isAuthenticated, upload.single("avatar"), async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const url = `/uploads/${req.file.filename}`;
      const updated = await storage.updateUser(userId, { profileImageUrl: url });
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ url, user: updated });
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
      const leaderboard = await storage.getLeaderboard(period, topCount);

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
