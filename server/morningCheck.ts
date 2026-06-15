import { db } from "./db";
import { games } from "@shared/schema";
import { sql } from "drizzle-orm";
import { syncSportsData, gradeStuckGames } from "./sportsDataService";
import { storage } from "./storage";
import { getSubscriptionDetails } from "./paypalService";
import { processPayoutForPeriod, getPayoutSchedule } from "./payoutService";
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
  log("DAILY MIDNIGHT PST SWEEP — STARTING");
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

  // ── 4. Automatic prize pool payouts ──────────────────────────────────────
  try {
    const schedule = getPayoutSchedule(new Date());
    const payoutSummaries: string[] = [];
    for (const item of schedule) {
      try {
        const result = await timeout(
          processPayoutForPeriod(item.period, item.periodLabel, item.periodStart, item.periodEnd, log),
          60_000,
          { paid: 0, skipped: 0, detail: "Timeout" }
        );
        payoutSummaries.push(`${item.period} (${item.periodLabel}): ${result.detail}`);
        log(`✓ Auto-payout ${item.period}: ${result.detail}`);
      } catch (pe: any) {
        payoutSummaries.push(`${item.period}: ERROR — ${pe.message}`);
        log(`✗ Auto-payout ${item.period}: ${pe.message}`);
      }
    }
    checks.autoPayouts = { ok: true, detail: payoutSummaries.join(" | ") || "No payouts due today" };
  } catch (e: any) {
    checks.autoPayouts = { ok: false, detail: e.message };
    log(`✗ Auto-payouts: ${e.message}`);
  }

  // ── 5. Today's MLB games ──────────────────────────────────────────────────
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

  // ── 6. Frontend asset integrity ───────────────────────────────────────────
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
          // Payment is current — sync tier from plan + update subscriptionPaidUntil from
          // PayPal's actual next billing date. This also RESTORES members who were wrongly
          // downgraded to free while their PayPal subscription is still active.
          const nextBillingRaw: string | undefined = sub.billing_info?.next_billing_time;
          const paidUntil = nextBillingRaw
            ? new Date(new Date(nextBillingRaw).getTime() + 3 * 24 * 60 * 60 * 1000) // +3 day buffer
            : new Date(Date.now() + 35 * 24 * 60 * 60 * 1000); // fallback: 35 days from now

          // Determine correct tier from plan ID
          const { tierFromPlanId } = await import("./paypalService");
          const correctTier = tierFromPlanId(sub.plan_id) ?? user.membershipTier ?? "rookie";

          const wasDowngraded = user.membershipTier === "free";
          await db.execute(sql`
            UPDATE users
            SET membership_tier = ${correctTier},
                subscription_paid_until = ${paidUntil},
                subscription_cancelled_at = NULL
            WHERE id = ${user.id}
          `);
          if (wasDowngraded) {
            log(`✅ Restored ${user.id} (${user.firstName}) from free → ${correctTier} — PayPal subscription ACTIVE, paidUntil ${paidUntil.toISOString().slice(0,10)}`);
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

  // ── 10. Manual-pay member lapse enforcement ───────────────────────────────
  // Members who pay outside the PayPal subscription system (bank transfer, PayPal.me, etc.)
  // have no automatic renewal. We track their expiry via subscription_paid_until.
  // If that date has passed AND they have no active PayPal subscription ID, downgrade them.
  // Founders (NIKCOX, DAMON822) are permanently exempt.
  try {
    const { db: mcDb } = await import("./db");
    const { sql: mcSql } = await import("drizzle-orm");
    const lapsedManual = await mcDb.execute(mcSql`
      SELECT id, first_name, last_name, membership_tier, subscription_paid_until, referral_code
      FROM users
      WHERE membership_tier NOT IN ('free')
        AND (paypal_subscription_id IS NULL OR paypal_subscription_id = '')
        AND referral_code NOT IN ('NIKCOX', 'DAMON822')
        AND (
          subscription_paid_until IS NULL
          OR subscription_paid_until < NOW()
        )
    `);
    const rows = (lapsedManual as any).rows ?? (lapsedManual as any) ?? [];
    let manualLapsed = 0;
    for (const row of rows) {
      await mcDb.execute(mcSql`
        UPDATE users
        SET membership_tier = 'free',
            subscription_cancelled_at = NOW()
        WHERE id = ${row.id}
      `);
      log(`⚠ Manual-pay lapse: ${row.first_name} ${row.last_name} (${row.membership_tier}) — subscription_paid_until=${row.subscription_paid_until ?? 'never set'} → downgraded to free`);
      manualLapsed++;

      // Auto-send a PayPal invoice so they can pay and restore access immediately
      try {
        const { createAndSendPayPalInvoice } = await import("./paypalService");
        const emailRow = await mcDb.execute(mcSql`SELECT email FROM users WHERE id = ${row.id} LIMIT 1`);
        const emailRows = (emailRow as any).rows ?? (emailRow as any) ?? [];
        const email: string | null = emailRows[0]?.email ?? null;
        if (email) {
          const inv = await createAndSendPayPalInvoice({
            recipientEmail: email,
            recipientName: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || undefined,
            tier: row.membership_tier,
            userId: row.id,
          });
          log(`📧 Invoice sent to ${email} — ${inv.invoiceId} — ${inv.invoiceUrl}`);
        } else {
          log(`⚠ No email for ${row.id} — cannot send invoice`);
        }
      } catch (invErr: any) {
        log(`✗ Invoice send failed for ${row.id}: ${invErr.message}`);
      }
    }
    checks.manualPayLapse = {
      ok: true,
      detail: manualLapsed > 0
        ? `${manualLapsed} manual-pay member(s) downgraded (payment overdue)`
        : "All manual-pay members current",
    };
    log(`${manualLapsed > 0 ? "⚠" : "✓"} Manual-pay lapse: ${checks.manualPayLapse.detail}`);
  } catch (e: any) {
    checks.manualPayLapse = { ok: false, detail: e.message };
    log(`✗ Manual-pay lapse check: ${e.message}`);
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

function msUntilNextMidnightPST(): number {
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

  // Always wait until the next midnight (00:00:00 PT)
  const waitSeconds = 86400 - currentSecondsPastMidnight;

  return waitSeconds * 1000;
}

function scheduleNextSweep() {
  const ms = msUntilNextMidnightPST();
  const hrs = (ms / 1000 / 60 / 60).toFixed(1);
  log(`Next sweep scheduled in ${hrs}h (at midnight PST)`);
  setTimeout(async () => {
    await runSweep();
    scheduleNextSweep();
  }, ms);
}

/** Returns ms until the next 1:00 AM PST. Used for the payout retry sweep. */
function msUntil1amPST(): number {
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
  const currentSeconds = hour * 3600 + minute * 60 + second;
  const targetSeconds = 1 * 3600; // 1:00:00 AM
  const waitSeconds = currentSeconds < targetSeconds
    ? targetSeconds - currentSeconds               // later tonight
    : 86400 - currentSeconds + targetSeconds;      // tomorrow night
  return waitSeconds * 1000;
}

/** Runs only the payout portion of the sweep — safe to call multiple times (dedup prevents double-pay). */
async function runPayoutRetry() {
  log("=== PAYOUT RETRY (1 AM PST) ===");
  try {
    // Grade any remaining stuck picks first
    const graded = await gradeStuckGames().catch(() => 0);
    log(`Payout retry — pre-grade: ${graded} picks graded`);

    const schedule = getPayoutSchedule(new Date());
    for (const item of schedule) {
      try {
        const result = await processPayoutForPeriod(
          item.period, item.periodLabel, item.periodStart, item.periodEnd, log
        );
        log(`Payout retry ${item.period} (${item.periodLabel}): ${result.detail}`);
      } catch (e: any) {
        log(`Payout retry ${item.period} ERROR: ${e.message}`);
      }
    }
  } catch (e: any) {
    log(`Payout retry failed: ${e.message}`);
  }
}

function schedulePayoutRetry() {
  const ms = msUntil1amPST();
  const hrs = (ms / 1000 / 60 / 60).toFixed(1);
  log(`Payout retry scheduled in ${hrs}h (at 1 AM PST)`);
  setTimeout(async () => {
    await runPayoutRetry();
    schedulePayoutRetry(); // schedule the next day's retry
  }, ms);
}

// Track the last time we ran the sweep so catch-up logic can check it
let lastSweepRanAt: Date | null = null;

export function startMorningSweep() {
  log("Morning sweep scheduler started");

  // Catch-up: run once shortly after startup so missed midnight sweeps are recovered.
  // Wait 45 seconds for DB connections to settle, then run if it's past 1 AM PDT (08:00 UTC).
  setTimeout(async () => {
    const utcHour = new Date().getUTCHours();
    // Only run catch-up between 08:00–20:00 UTC (1 AM–1 PM PDT) so we don't double-fire
    // near midnight and we only run when yesterday's games are definitely finished.
    if (utcHour >= 8 && utcHour < 20) {
      log("Startup catch-up sweep — running now to recover any missed midnight jobs");
      await runSweep().catch((e: any) => log(`Catch-up sweep error: ${e.message}`));
      lastSweepRanAt = new Date();
    } else {
      log(`Startup catch-up skipped (UTC hour ${utcHour} outside 08–20 window)`);
    }
  }, 45_000);

  scheduleNextSweep();
  schedulePayoutRetry(); // second daily payout check at 10 AM PST
}

