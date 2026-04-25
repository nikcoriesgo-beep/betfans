import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { startSportsDataSync } from "./sportsDataService";
import { startMorningSweep } from "./morningCheck";
import { storage } from "./storage";
import { runStartupMigration, runHistoricalDataSeed } from "./startupMigration";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Prevent any unhandled error from crashing the process
process.on("uncaughtException", (err) => {
  console.error("[crash-guard] Uncaught exception (server kept alive):", err?.message || err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[crash-guard] Unhandled rejection (server kept alive):", reason);
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log("DATABASE_URL not set, skipping Stripe init", "stripe");
    return;
  }

  try {
    log("Initializing Stripe schema...", "stripe");
    await runMigrations({ databaseUrl });
    log("Stripe schema ready", "stripe");

    const stripeSync = await getStripeSync();

    log("Setting up managed webhook...", "stripe");
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    log("Webhook configured", "stripe");

    stripeSync
      .syncBackfill()
      .then(() => log("Stripe data synced", "stripe"))
      .catch((err: any) => log(`Stripe sync error: ${err.message}`, "stripe"));
  } catch (error: any) {
    log(`Stripe init error (non-fatal): ${error.message}`, "stripe");
  }
}

(async () => {
  // Run migration first so routes have DB available, but don't block server start
  // Heavy data seeding runs in background after server is listening
  try {
    await runStartupMigration();
  } catch (migErr: any) {
    console.error("[startup] Migration error (non-fatal):", migErr.message);
  }
  await registerRoutes(httpServer, app);

  // Error handler — log the error but never re-throw (that crashes the process)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("[api-error]", status, message);
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  await initStripe();
  startSportsDataSync();

  // Seed historical leaderboard data in background (non-blocking)
  runHistoricalDataSeed().catch((e: any) => console.error("[startup] Historical seed error:", e.message));

  if (process.env.NODE_ENV === "production") {
    startMorningSweep();

    // Auto-pay yesterday's winners on every server start (non-blocking).
    // The payout service skips if already paid correctly; corrects if only 1 winner
    // was paid when multiple tied (migration already cleared those records above).
    setTimeout(async () => {
      try {
        const { processPayoutForPeriod, getPayoutSchedule } = await import("./payoutService");
        const schedule = getPayoutSchedule(new Date());
        for (const item of schedule) {
          const result = await processPayoutForPeriod(item.period, item.periodLabel, item.periodStart, item.periodEnd);
          console.log(`[startup-payout] ${item.period} ${item.periodLabel}: ${result.detail}`);
        }
      } catch (e: any) {
        console.error("[startup-payout] Error:", e.message);
      }
    }, 15_000); // 15s delay — let sports data sync first
  }

  // Keep the production service alive — ping every 4 minutes in all environments
  const { default: httpsModule } = await import("https");
  const PING_URL = "https://betfans.us/api/health";
  setInterval(() => {
    httpsModule.get(PING_URL, (res) => {
      res.resume();
    }).on("error", () => {});
  }, 4 * 60 * 1000);

})();
