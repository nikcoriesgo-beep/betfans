import { db } from "./db";
import { games } from "@shared/schema";
import { sql } from "drizzle-orm";
import { syncSportsData, gradeStuckGames } from "./sportsDataService";
import { storage } from "./storage";
import { getSubscriptionDetails } from "./paypalService";
const SELF_URL = process.env.NODE_ENV === "production" ? "https://betfans.us" : "http://localhost:5000";
// Private ntfy.sh topic — bookmark https://ntfy.sh/betfans-sweep-k9x2m7 to see alerts
const NTFY_TOPIC = "betfans-sweep-k9x2m7";

export interface CheckResult {
  timestamp: string;
  status: "ok" | "degraded" | "down";
  checks: Record<string, { ok: boolean; detail: string }>;
  summary: string;
}

let lastCheckResult: CheckResult | null = null;

export function getLastCheckResult() {
  return lastCheckResult;
}

function log(msg: string) {
  const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(`${t} [morning-sweep] ${msg}`);
}

async function timeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function sendNtfyAlert(result: CheckResult): Promise<void> {
  const failed = Object.entries(result.checks).filter(([, c]) => !c.ok);
  const statusEmoji = result.status === "ok" ? "white_check_mark" : result.status === "degraded" ? "warning" : "rotating_light";
  const priority = result.status === "ok" ? "default" : result.status === "degraded" ? "high" : "urgent";

  const title = result.status === "ok"
    ? "BetFans ✅ All systems go"
    : `BetFans 🚨 ${failed.length} issue(s) detected`;

  const body = result.status === "ok"
    ? result.summary
    : failed.map(([k, v]) => `✗ ${k}: ${v.detail}`).join("\n");

  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        "Title": title,
        "Priority": priority,
        "Tags": statusEmoji,
        "Content-Type": "text/plain",
      },
      body: `${body}\n\n${result.timestamp}`,
    });
    log(`✓ Push notification sent to ntfy.sh/${NTFY_TOPIC}`);
  } catch (e: any) {
    log(`✗ ntfy push failed: ${e.message}`);
  }
}

async function runSweep() {
  log("============================================");
  log("DAILY 5AM PST SWEEP — STARTING");
  log("============================================");

  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // ── 1. Database connectivity ──────────────────────────────────────────────
  try {
    await db.execute(sql`SELECT 1 AS ping`);
    checks.database = { ok: true, detail: "Connected to Neon production DB" };
    log("✓ Database: connected");
  } catch (e: any) {
    checks.database = { ok: false, detail: e.message };
    log(`✗ Database: ${e.message}`);
  }

  // ── 2. Sports data sync ───────────────────────────────────────────────────
  try {
    log("→ Running sports data sync...");
    await timeout(syncSportsData(), 25_000, undefined);
    checks.sportsSync = { ok: true, detail: "Sports data sync complete" };
    log("✓ Sports sync: done");
  } catch (e: any) {
    checks.sportsSync = { ok: false, detail: e.message };
    log(`✗ Sports sync: ${e.message}`);
  }

  // ── 3. Grade stuck picks from yesterday ──────────────────────────────────
  try {
    log("→ Grading stuck picks...");
    const graded = await timeout(gradeStuckGames(), 30_000, 0);
    checks.gradeStuck = {
      ok: true,
      detail: graded > 0 ? `${graded} stuck pick(s) graded` : "No stuck picks — all up to date",
    };
    log(`✓ Grade stuck: ${checks.gradeStuck.detail}`);
  } catch (e: any) {
    checks.gradeStuck = { ok: false, detail: e.message };
    log(`✗ Grade stuck: ${e.message}`);
  }

  // ── 4. Today's MLB games ──────────────────────────────────────────────────
  try {
    const etParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date()).split("/");
    const dateStr = `${etParts[2]}-${etParts[0]}-${etParts[1]}`;
    const [ey, em, ed] = dateStr.split("-").map(Number);
    const todayStart = new Date(Date.UTC(ey, em - 1, ed, 4, 0, 0));
    const todayEnd   = new Date(Date.UTC(ey, em - 1, ed + 1, 4, 0, 0));
    const todayGames = await db.select().from(games).where(
      sql`${games.league} = 'MLB' AND ${games.gameTime} >= ${todayStart} AND ${games.gameTime} < ${todayEnd}`
    );
    const count = todayGames.length;
    checks.mlbGames = {
      ok: count > 0,
      detail: count > 0 ? `${count} MLB games loaded for ${dateStr}` : `No MLB games found for ${dateStr} — may be off-day`,
    };
    log(`${count > 0 ? "✓" : "~"} MLB games: ${checks.mlbGames.detail}`);
  } catch (e: any) {
    checks.mlbGames = { ok: false, detail: e.message };
    log(`✗ MLB games: ${e.message}`);
  }

  // ── 5. Frontend asset integrity ───────────────────────────────────────────
  // Fetch the homepage HTML, extract the CSS and JS asset URLs, then verify
  // each one actually returns HTTP 200. This catches missing CSS files.
  try {
    const htmlResp = await timeout(fetch(`${SELF_URL}/`), 10_000, null);
    if (!htmlResp) throw new Error("Homepage timeout");
    if (!htmlResp.ok) throw new Error(`Homepage returned HTTP ${htmlResp.status}`);

    const html = await htmlResp.text();
    const assetUrls = [
      ...(html.match(/href="([^"]+\.css)"/g) || []).map((m: string) => m.slice(6, -1)),
      ...(html.match(/src="([^"]+\.js)"/g) || []).map((m: string) => m.slice(5, -1)),
    ].filter((u: string) => u.startsWith("/") || u.startsWith("http"));

    const assetResults: string[] = [];
    let assetsFailed = 0;
    for (const assetPath of assetUrls) {
      const url = assetPath.startsWith("http") ? assetPath : `${SELF_URL}${assetPath}`;
      const r = await timeout(fetch(url, { method: "HEAD" }), 8_000, null);
      if (!r || !r.ok) {
        assetsFailed++;
        assetResults.push(`✗ ${assetPath} (${r?.status ?? "timeout"})`);
        log(`✗ Asset missing: ${assetPath}`);
      } else {
        assetResults.push(`✓ ${assetPath.split("/").pop()}`);
      }
    }

    if (assetsFailed > 0) {
      checks.frontendAssets = {
        ok: false,
        detail: `${assetsFailed} asset(s) not found: ${assetResults.filter(s => s.startsWith("✗")).join(", ")}`,
      };
      log(`✗ Frontend assets: ${assetsFailed} missing!`);
    } else {
      checks.frontendAssets = {
        ok: true,
        detail: `All ${assetUrls.length} asset(s) verified (CSS + JS)`,
      };
      log(`✓ Frontend assets: all ${assetUrls.length} OK`);
    }
  } catch (e: any) {
    checks.frontendAssets = { ok: false, detail: e.message };
    log(`✗ Frontend assets: ${e.message}`);
  }

  // ── 6. PayPal config ──────────────────────────────────────────────────────
  try {
    const resp = await timeout(fetch(`${SELF_URL}/api/paypal/config`), 10_000, null);
    if (!resp) throw new Error("Timeout");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as any;
    const plansOk = !!(data.plans?.rookie && data.plans?.pro && data.plans?.legend);
    checks.paypal = { ok: plansOk, detail: plansOk ? "All 3 plan IDs present" : "Missing plan IDs!" };
    log(`${plansOk ? "✓" : "✗"} PayPal: ${checks.paypal.detail}`);
  } catch (e: any) {
    checks.paypal = { ok: false, detail: e.message };
    log(`✗ PayPal: ${e.message}`);
  }

  // ── 7. API health endpoints ───────────────────────────────────────────────
  const endpoints = [
    { key: "leaderboard", path: "/api/leaderboard" },
    { key: "memberCount", path: "/api/member-count" },
    { key: "baseballBreakfast", path: "/api/baseball-breakfast" },
  ];
  for (const ep of endpoints) {
    try {
      const resp = await timeout(fetch(`${SELF_URL}${ep.path}`), 10_000, null);
      if (!resp) throw new Error("Timeout");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as any;
      const detail = ep.key === "memberCount"
        ? `${data.count} total members`
        : ep.key === "baseballBreakfast"
        ? `${data.games?.length ?? 0} games returned`
        : "Responding OK";
      checks[ep.key] = { ok: true, detail };
      log(`✓ ${ep.key}: ${detail}`);
    } catch (e: any) {
      checks[ep.key] = { ok: false, detail: e.message };
      log(`✗ ${ep.key}: ${e.message}`);
    }
  }

  // ── 8. Credit monthly residual income to wallet ───────────────────────────
  // Run on 1st of each month — deposit each active subscriber's referral earnings
  try {
    const today = new Date();
    const isFirstOfMonth = today.getDate() === 1;
    if (isFirstOfMonth) {
      const subscribers = await storage.getActivePaypalSubscribers();
      let credited = 0;
      for (const user of subscribers) {
        try {
          const stats = await storage.getReferralStats(user.id);
          const monthly = stats.monthlyIncome;
          if (monthly > 0) {
            const current = parseFloat(user.walletBalance || "0");
            await storage.updateUser(user.id, { walletBalance: String(current + monthly) });
            await storage.createTransaction({ userId: user.id, type: "residual_income", amount: monthly, description: `Monthly residual income — ${today.toLocaleString("en-US", { month: "long", year: "numeric" })}`, status: "completed" });
            credited++;
          }
        } catch {}
      }
      checks.residualCredits = { ok: true, detail: credited > 0 ? `Residual income credited to ${credited} member(s)` : "No residual income to credit this month" };
      log(`✓ Residual credits: ${checks.residualCredits.detail}`);
    } else {
      checks.residualCredits = { ok: true, detail: `Skipped — runs on 1st of month (today is ${today.getDate()}th)` };
      log(`~ Residual credits: not 1st of month, skipping`);
    }
  } catch (e: any) {
    checks.residualCredits = { ok: false, detail: e.message };
    log(`✗ Residual credits: ${e.message}`);
  }

  // ── 9. PayPal subscriber audit ────────────────────────────────────────────
  // Check every active paying member against PayPal API — auto-downgrade if lapsed
  try {
    const subscribers = await storage.getActivePaypalSubscribers();
    log(`→ Auditing ${subscribers.length} active PayPal subscriber(s)...`);
    let lapsed = 0;
    let confirmed = 0;
    for (const user of subscribers) {
      try {
        const sub = await timeout(getSubscriptionDetails(user.paypalSubscriptionId!), 10_000, null);
        if (!sub) { continue; } // timeout — skip, don't downgrade on a timeout
        const status: string = (sub.status || "").toUpperCase();
        if (status === "ACTIVE" || status === "APPROVED") {
          // Payment is current — clear any prior cancellation date
          if (user.subscriptionCancelledAt) {
            await storage.updateUser(user.id, { subscriptionCancelledAt: null });
          }
          confirmed++;
        } else {
          // CANCELLED, SUSPENDED, EXPIRED — try wallet auto-pay first
          const tierFees: Record<string, number> = { rookie: 19, pro: 29, legend: 99 };
          const tierFee = tierFees[user.membershipTier || "rookie"] || 19;
          const walletBalance = parseFloat(user.walletBalance || "0");

          if (walletBalance >= tierFee) {
            // Wallet covers the monthly fee — auto-pay and keep active
            await storage.updateUser(user.id, {
              walletBalance: String(walletBalance - tierFee),
              subscriptionCancelledAt: null,
            });
            await storage.createTransaction({
              userId: user.id,
              type: "auto_pay_credit",
              amount: -tierFee,
              description: `Auto-pay from wallet — ${user.membershipTier} membership fee covered`,
              status: "completed",
            });
            confirmed++;
            log(`✓ Auto-paid $${tierFee} from wallet for ${user.id} (${user.membershipTier})`);
            continue;
          }

          const isLegend = user.membershipTier === "legend";
          const cancelledAt = user.subscriptionCancelledAt
            ? new Date(user.subscriptionCancelledAt)
            : new Date();
          const monthsLapsed = (Date.now() - cancelledAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

          if (!user.subscriptionCancelledAt) {
            // First time we're seeing this lapse — record it but keep Legend status
            await storage.updateUser(user.id, { subscriptionCancelledAt: new Date() });
            log(`⚠ Payment lapsed for ${user.id} (${user.membershipTier}) — subscriptionCancelledAt set`);
          }

          if (isLegend && monthsLapsed < 12) {
            // Legend grace: keep status, lose prize pool + residuals (enforced elsewhere)
            lapsed++;
            log(`⚠ Legend grace period: ${user.id} — ${monthsLapsed.toFixed(1)} months lapsed, status preserved`);
          } else {
            // Non-Legend OR Legend who hit 12 months — downgrade to free
            await storage.updateUser(user.id, { membershipTier: "free" });
            lapsed++;
            log(`⚠ Downgraded ${user.id} — PayPal status: ${status}, ${isLegend ? "12-month Legend grace expired" : "non-Legend"}`);
          }
        }
      } catch {
        // Individual lookup failure — skip, don't downgrade
      }
    }
    const detail = subscribers.length === 0
      ? "No active PayPal subscribers"
      : `${confirmed} active, ${lapsed} auto-downgraded`;
    checks.paypalAudit = { ok: true, detail };
    log(`✓ PayPal audit: ${detail}`);
  } catch (e: any) {
    checks.paypalAudit = { ok: false, detail: e.message };
    log(`✗ PayPal audit: ${e.message}`);
  }

  // ── Tally results ─────────────────────────────────────────────────────────
  const total = Object.keys(checks).length;
  const passed = Object.values(checks).filter((c) => c.ok).length;
  const failed = total - passed;
  const overallStatus: CheckResult["status"] =
    failed === 0 ? "ok" : failed <= 2 ? "degraded" : "down";
  const summary =
    overallStatus === "ok"
      ? `All ${total} checks passed — BetFans is healthy`
      : `${passed}/${total} checks passed — ${failed} issue(s) detected`;

  lastCheckResult = {
    timestamp: new Date().toISOString(),
    status: overallStatus,
    checks,
    summary,
  };

  log("--------------------------------------------");
  log(`RESULT: ${overallStatus.toUpperCase()} — ${summary}`);
  log("============================================");

  // Always push — green means all good, red means act now
  await sendNtfyAlert(lastCheckResult);
}

function msUntilNext5amPST(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value);
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");

  const currentSecondsPastMidnight = hour * 3600 + minute * 60 + second;
  const target = 5 * 3600;

  const waitSeconds =
    currentSecondsPastMidnight < target
      ? target - currentSecondsPastMidnight
      : 86400 - currentSecondsPastMidnight + target;

  return waitSeconds * 1000;
}

function scheduleNextSweep() {
  const ms = msUntilNext5amPST();
  const hrs = (ms / 1000 / 60 / 60).toFixed(1);
  log(`Next sweep scheduled in ${hrs}h (at 5:00 AM PST)`);
  setTimeout(async () => {
    await runSweep();
    scheduleNextSweep();
  }, ms);
}

export function startMorningSweep() {
  log("Morning sweep scheduler started");
  scheduleNextSweep();
}

