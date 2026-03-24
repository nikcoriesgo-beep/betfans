import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { startSportsDataSync } from "./sportsDataService";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

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
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
  startSportsDataSync(5);

  if (process.env.NODE_ENV === "production") {
    const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
    setInterval(async () => {
      try {
        await fetch(`${selfUrl}/api/member-count`);
        log("Keep-alive ping sent", "keepalive");
      } catch (_) {}
    }, 10 * 60 * 1000);
    log("Keep-alive self-ping started (every 10 min)", "keepalive");
  }

  try {
    const existingTracks = await storage.getMusicTracks();
    if (existingTracks.length === 0) {
      await storage.createMusicTrack({
        sunoId: "52075738-9521-44e5-806f-55bae98f72bd",
        title: "BetFans Opening Day Anthem",
        active: true,
        sortOrder: 0,
      });
      log("Seeded BetFans Daily Anthem track", "music");
    }
  } catch (e: any) {
    log(`Music seed error (non-fatal): ${e.message}`, "music");
  }
})();
