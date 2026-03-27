import { db } from "./db";
import { games, users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { syncSportsData } from "./sportsDataService";

const SELF_URL = process.env.NODE_ENV === "production" ? "https://betfans.us" : "http://localhost:5000";

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

async function runSweep() {
  log("============================================");
  log("DAILY 5AM PST SWEEP — STARTING");
  log("============================================");

  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // ── 1. Database connectivity ──────────────────────────────────────────────
  try {
    const [row] = await db.execute(sql`SELECT 1 AS ping`);
    checks.database = { ok: true, detail: "Connected to Neon production DB" };
    log("✓ Database: connected");
  } catch (e: any) {
    checks.database = { ok: false, detail: e.message };
    log(`✗ Database: ${e.message}`);
  }

  // ── 2. Sports data sync — pull fresh MLB + all active leagues ────────────
  try {
    log("→ Running sports data sync...");
    await timeout(syncSportsData(), 25_000, undefined);
    checks.sportsSync = { ok: true, detail: "Sports data sync complete" };
    log("✓ Sports sync: done");
  } catch (e: any) {
    checks.sportsSync = { ok: false, detail: e.message };
    log(`✗ Sports sync: ${e.message}`);
  }

  // ── 3. Today's MLB games loaded ──────────────────────────────────────────
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

  // ── 4. Baseball-breakfast endpoint ───────────────────────────────────────
  try {
    const resp = await timeout(fetch(`${SELF_URL}/api/baseball-breakfast`), 15_000, null);
    if (!resp) throw new Error("Timeout after 15s");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as any;
    checks.baseballBreakfast = {
      ok: true,
      detail: `Returned ${data.games?.length ?? 0} games, founder: ${data.founder?.firstName ?? "none"}`,
    };
    log(`✓ Baseball Breakfast: ${checks.baseballBreakfast.detail}`);
  } catch (e: any) {
    checks.baseballBreakfast = { ok: false, detail: e.message };
    log(`✗ Baseball Breakfast: ${e.message}`);
  }

  // ── 5. Auth / member system ───────────────────────────────────────────────
  try {
    const resp = await timeout(fetch(`${SELF_URL}/api/members/recent`), 10_000, null);
    if (!resp) throw new Error("Timeout after 10s");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as any[];
    checks.members = { ok: true, detail: `Member list returned ${data.length} entries` };
    log(`✓ Members: ${checks.members.detail}`);
  } catch (e: any) {
    checks.members = { ok: false, detail: e.message };
    log(`✗ Members: ${e.message}`);
  }

  // ── 6. PayPal config ──────────────────────────────────────────────────────
  try {
    const resp = await timeout(fetch(`${SELF_URL}/api/paypal/config`), 10_000, null);
    if (!resp) throw new Error("Timeout after 10s");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as any;
    const plansOk = !!(data.plans?.rookie && data.plans?.pro && data.plans?.legend);
    checks.paypal = { ok: plansOk, detail: plansOk ? "All 3 plan IDs present" : "Missing plan IDs!" };
    log(`${plansOk ? "✓" : "✗"} PayPal: ${checks.paypal.detail}`);
  } catch (e: any) {
    checks.paypal = { ok: false, detail: e.message };
    log(`✗ PayPal: ${e.message}`);
  }

  // ── 7. Leaderboard ────────────────────────────────────────────────────────
  try {
    const resp = await timeout(fetch(`${SELF_URL}/api/leaderboard`), 10_000, null);
    if (!resp) throw new Error("Timeout after 10s");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    checks.leaderboard = { ok: true, detail: "Leaderboard responding" };
    log("✓ Leaderboard: OK");
  } catch (e: any) {
    checks.leaderboard = { ok: false, detail: e.message };
    log(`✗ Leaderboard: ${e.message}`);
  }

  // ── 8. Member count ──────────────────────────────────────────────────────
  try {
    const resp = await timeout(fetch(`${SELF_URL}/api/member-count`), 10_000, null);
    if (!resp) throw new Error("Timeout after 10s");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as any;
    checks.memberCount = { ok: true, detail: `${data.count} total members` };
    log(`✓ Member count: ${data.count}`);
  } catch (e: any) {
    checks.memberCount = { ok: false, detail: e.message };
    log(`✗ Member count: ${e.message}`);
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
}

function msUntilNext5amPST(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value);
  const hour = get("hour"), minute = get("minute"), second = get("second");

  const currentSecondsPastMidnight = hour * 3600 + minute * 60 + second;
  const target = 5 * 3600; // 5:00:00 AM

  const waitSeconds = currentSecondsPastMidnight < target
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
