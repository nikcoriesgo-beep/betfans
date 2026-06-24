import { storage } from "./storage";
import { sendPayPalSubscriptionRefund, sendPayPalPayout } from "./paypalService";
import { gradeStuckGames } from "./sportsDataService";
import { db } from "./db";
import { games, predictions, users } from "@shared/schema";
import { sql, inArray } from "drizzle-orm";

// Use PST-based midnight (8 AM UTC) to match the daily scorecard's window exactly.
// The scorecard uses PST boundaries — payout must use the same so it finds the same games.
function getPSTMidnight(date: Date): Date {
  const pstStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(date);
  const [year, month, day] = pstStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 8, 0, 0, 0)); // midnight PST = 08:00 UTC always
}

async function sendAndRecordPayout(
  payoutId: number,
  userId: string,
  amount: number,
  periodLabel: string,
  period: string,
  tiedCount: number,
  log: (msg: string) => void,
): Promise<void> {
  const user = await storage.getUser(userId);
  const note = `BetFans ${period} prize — 10% pool${tiedCount > 1 ? ` split ${tiedCount} ways` : ""} — ${periodLabel}`;

  if (user?.paypalPayoutEmail) {
    try {
      const senderItemId = `betfans-payout-${payoutId}-${Date.now()}`;
      const result = await sendPayPalPayout(user.paypalPayoutEmail, amount, senderItemId, note);
      await storage.updatePayout(payoutId, {
        stripeTransferId: result.batchId,
        status: "paypal_sent",
        paidAt: new Date(),
      });
      log(`✓ PayPal payout sent to ${user.paypalPayoutEmail} — batch ${result.batchId} (${result.status})`);
    } catch (e: any) {
      log(`✗ PayPal payout failed for ${userId}: ${e.message} — wallet still credited`);
      await storage.updatePayout(payoutId, { status: "wallet_credited", paidAt: new Date() });
    }
    return;
  }

  const subscriptionId = user?.paypalSubscriptionId;
  if (!subscriptionId) {
    log(`⚠ No PayPal payout method for ${userId} — wallet credited only`);
    await storage.updatePayout(payoutId, { status: "wallet_credited", paidAt: new Date() });
    return;
  }

  try {
    const result = await sendPayPalSubscriptionRefund(subscriptionId, amount, note);
    await storage.updatePayout(payoutId, {
      stripeTransferId: result.refundId,
      status: "paypal_sent",
      paidAt: new Date(),
    });
    log(`✓ PayPal refund payout sent to subscription ${subscriptionId} — refund ${result.refundId} (${result.status})`);
  } catch (e: any) {
    log(`✗ PayPal refund payout failed for ${userId}: ${e.message} — wallet still credited`);
    await storage.updatePayout(payoutId, { status: "wallet_credited", paidAt: new Date() });
  }
}

async function computeScorecardForPeriod(periodStart: Date, periodEnd: Date, log: (msg: string) => void) {
  type MatchupGroup = { canonicalId: number; allIds: Set<number>; league: string };

  // Use game_time (not prediction.createdAt) to identify games in the period
  const dayGamesRaw = await db.select().from(games).where(
    sql`${games.gameTime} >= ${periodStart} AND ${games.gameTime} < ${periodEnd}
        AND ${games.status} != 'postponed'
        AND ${games.league} IN ('MLB','NBA','NHL','FIFA_WC','NCAABB')`
  );

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

  const mlbMatchups    = [...matchupGroups.entries()].filter(([k]) => k.startsWith("MLB|"));
  const nbaMatchups    = [...matchupGroups.entries()].filter(([k]) => k.startsWith("NBA|"));
  const nhlMatchups    = [...matchupGroups.entries()].filter(([k]) => k.startsWith("NHL|"));
  const wcMatchups     = [...matchupGroups.entries()].filter(([k]) => k.startsWith("FIFA_WC|"));
  const ncaabbMatchups = [...matchupGroups.entries()].filter(([k]) => k.startsWith("NCAABB|"));

  log(`Scorecard: ${mlbMatchups.length} MLB, ${nbaMatchups.length} NBA, ${nhlMatchups.length} NHL, ${wcMatchups.length} FIFA_WC, ${ncaabbMatchups.length} NCAABB games (${matchupGroups.size} total)`);

  const allDayIds = dayGamesRaw.map(g => g.id);
  const dayPreds = allDayIds.length === 0 ? [] : await db.select().from(predictions).where(
    inArray(predictions.gameId, allDayIds)
  );

  const allMembers = await db.select().from(users).where(
    sql`${users.membershipTier} IN ('rookie', 'pro', 'legend', 'corporate', 'premium_corporate')`
  );

  const memberRows = allMembers.map(u => {
    const myPreds = dayPreds.filter(p => p.userId === u.id);
    const forSport = (matchups: [string, MatchupGroup][]) => {
      let picks = 0, wins = 0, losses = 0;
      for (const [, group] of matchups) {
        const sp = myPreds.filter(p => group.allIds.has(p.gameId));
        if (sp.length > 0) {
          picks++;
          const gWins   = sp.filter(p => p.result === "win").length;
          const gLosses = sp.filter(p => p.result === "loss").length;
          if (gWins > gLosses)      wins++;
          else if (gLosses > gWins) losses++;
          else if (gWins > 0)       wins++;
        }
      }
      return { picks, wins, losses };
    };
    const mlb    = forSport(mlbMatchups);
    const nba    = forSport(nbaMatchups);
    const nhl    = forSport(nhlMatchups);
    const wc     = forSport(wcMatchups);
    const ncaabb = forSport(ncaabbMatchups);
    const totalWins   = mlb.wins   + nba.wins   + nhl.wins   + wc.wins   + ncaabb.wins;
    const totalLosses = mlb.losses + nba.losses + nhl.losses + wc.losses + ncaabb.losses;
    const totalPicks  = mlb.picks  + nba.picks  + nhl.picks  + wc.picks  + ncaabb.picks;
    // Only MLB + NHL/NBA are required for prize pool qualification.
    // FIFA_WC and NCAABB are "skill play" bonus sports — picks count toward wins/ranking
    // but members are NOT required to pick them to qualify.
    const qualified =
      mlb.picks >= mlbMatchups.length &&
      (nbaMatchups.length === 0 || nba.picks >= nbaMatchups.length) &&
      (nhlMatchups.length === 0 || nhl.picks >= nhlMatchups.length);
    return { userId: u.id, user: u, wins: totalWins, losses: totalLosses, totalPicks, qualified };
  });

  return { memberRows, mlbCount: mlbMatchups.length, nbaCount: nbaMatchups.length, nhlCount: nhlMatchups.length, wcCount: wcMatchups.length, ncaabbCount: ncaabbMatchups.length, totalCount: matchupGroups.size };
}

async function processDailyPayout(
  periodLabel: string,
  periodStart: Date,
  periodEnd: Date,
  log: (msg: string) => void,
): Promise<{ paid: number; skipped: number; detail: string }> {
  const existing = await storage.getPayoutsByPeriod("daily", periodLabel);
  if (existing.length > 0) {
    return { paid: 0, skipped: 0, detail: `Already processed for daily ${periodLabel}` };
  }

  // Sync game results before calculating — ensures late-finishing games are graded
  try {
    const graded = await gradeStuckGames();
    log(`Pre-payout grade sync: ${graded} picks graded`);
  } catch (e: any) {
    log(`⚠ Pre-payout grade sync failed (continuing anyway): ${e.message}`);
  }

  // Pool = SUM of prize_pool_contributions (positive set rows + negative payout deduction rows)
  // No separate subtraction needed — negative rows inserted at payout time keep this accurate.
  const poolAmount = await storage.getPrizePoolTotal();
  const dailyShare = Math.floor(poolAmount * 0.10); // whole dollars only

  // Use game-time-based scorecard (same logic as /api/daily-scorecard) for correctness
  const { memberRows, totalCount } = await computeScorecardForPeriod(periodStart, periodEnd, log);
  if (memberRows.every(m => m.totalPicks === 0)) {
    return { paid: 0, skipped: 0, detail: `No picks recorded for daily ${periodLabel}` };
  }

  log(`Required: all ${totalCount} MLB+NBA+NHL games. Members scored: ${memberRows.length}`);

  const eligible = memberRows.filter(m => {
    const tier = m.user?.membershipTier;
    const validTier = tier === "legend" || tier === "pro" || tier === "rookie";
    if (!m.qualified) log(`~ ${m.user?.firstName} ${m.user?.lastName} ineligible: picked ${m.totalPicks}/${totalCount} games`);
    return validTier && m.qualified && (m.wins + m.losses) > 0;
  });
  if (eligible.length === 0) {
    return { paid: 0, skipped: 0, detail: `No members qualified (picked all ${totalCount} games) for daily ${periodLabel}` };
  }

  // Rank by most wins; win-rate breaks ties
  const sorted = [...eligible].sort((a, b) => b.wins - a.wins || (b.wins / Math.max(1, b.wins + b.losses)) - (a.wins / Math.max(1, a.wins + a.losses)));
  const topWins = sorted[0].wins;
  const topRate = sorted[0].wins / Math.max(1, sorted[0].wins + sorted[0].losses);
  const tied = sorted.filter(m => m.wins === topWins && (m.wins / Math.max(1, m.wins + m.losses)) === topRate);
  const perWinner = Math.floor(dailyShare / tied.length); // whole dollars

  if (perWinner < 0.01) {
    return { paid: 0, skipped: 0, detail: `Payout amount too small for daily ${periodLabel}` };
  }

  let paid = 0;
  let skipped = 0;

  for (const entry of tied) {
    const entryUser = await storage.getUser(entry.userId);
    if (entryUser?.subscriptionCancelledAt) {
      log(`~ Payout skipped for ${entry.userId} — payment lapsed`);
      skipped++;
      continue;
    }

    const payout = await storage.createPayout({
      userId: entry.userId,
      amount: perWinner,
      period: "daily",
      periodLabel,
      rank: 1,
      sharePercent: (0.10 / tied.length) * 100,
      wins: entry.wins ?? 0,
      losses: entry.losses ?? 0,
    });

    const updatedUser = await storage.getUser(entry.userId);
    if (updatedUser) {
      const currentBalance = parseFloat(updatedUser.walletBalance || "0");
      await storage.updateUser(entry.userId, {
        walletBalance: String(currentBalance + perWinner),
      });
    }

    await storage.createTransaction({
      userId: entry.userId,
      type: "prize_payout",
      amount: perWinner,
      description: `BetFans daily prize — 10% pool${tied.length > 1 ? ` split ${tied.length} ways` : ""} — ${periodLabel}`,
      status: "completed",
    });

    await sendAndRecordPayout(payout.id, entry.userId, perWinner, periodLabel, "daily", tied.length, log);

    log(`✓ Paid $${perWinner} to ${entry.userId} (daily winner, ${periodLabel})`);
    paid++;
  }

  return {
    paid,
    skipped,
    detail: `${paid} winner(s) paid $${perWinner} each from $${poolAmount.toFixed(2)} pool — ${skipped} skipped`,
  };
}

async function processAnnualPayout(
  periodLabel: string,
  periodStart: Date,
  periodEnd: Date,
  log: (msg: string) => void,
): Promise<{ paid: number; skipped: number; detail: string }> {
  const existing = await storage.getPayoutsByPeriod("annual", periodLabel);
  if (existing.length > 0) {
    return { paid: 0, skipped: 0, detail: `Already processed for annual ${periodLabel}` };
  }

  const remainingPool = await storage.getPrizePoolTotal();

  if (remainingPool <= 0) {
    return { paid: 0, skipped: 0, detail: `No remaining prize pool for annual ${periodLabel}` };
  }

  const leaderboard = await storage.getMLBLeaderboardForDateRange(periodStart, periodEnd, 500);
  if (leaderboard.length === 0) {
    return { paid: 0, skipped: 0, detail: `No MLB picks for annual ${periodLabel}` };
  }

  // Rank by most wins first; ROI only breaks ties among equal wins
  const sortedAnnual = [...leaderboard].sort((a: any, b: any) => b.wins - a.wins || b.roi - a.roi);
  const topWins = sortedAnnual[0].wins;
  const topRoi = sortedAnnual[0].roi;
  const tied = sortedAnnual.filter((e: any) => e.wins === topWins && e.roi === topRoi);
  const perWinnerAmount = Math.floor((remainingPool / tied.length) * 100) / 100;

  let paid = 0;
  let skipped = 0;

  for (const entry of tied) {
    const entryUser = await storage.getUser(entry.userId);
    if (entryUser?.subscriptionCancelledAt) {
      log(`~ Annual payout skipped for ${entry.userId} — payment lapsed`);
      skipped++;
      continue;
    }

    const payout = await storage.createPayout({
      userId: entry.userId,
      amount: perWinnerAmount,
      period: "annual",
      periodLabel,
      rank: 1,
      wins: entry.wins ?? 0,
      losses: entry.losses ?? 0,
      sharePercent: 100 / tied.length,
    });

    const updatedUser = await storage.getUser(entry.userId);
    if (updatedUser) {
      const currentBalance = parseFloat(updatedUser.walletBalance || "0");
      await storage.updateUser(entry.userId, {
        walletBalance: String(currentBalance + perWinnerAmount),
      });
    }

    await storage.createTransaction({
      userId: entry.userId,
      type: "prize_payout",
      amount: perWinnerAmount,
      description: `BetFans annual prize — full remaining pool${tied.length > 1 ? ` split ${tied.length} ways` : ""} — ${periodLabel}`,
      status: "completed",
    });

    await sendAndRecordPayout(payout.id, entry.userId, perWinnerAmount, periodLabel, "annual", tied.length, log);

    log(`✓ Annual paid $${perWinnerAmount} to ${entry.userId} (${periodLabel})`);
    paid++;
  }

  return {
    paid,
    skipped,
    detail: `${paid} annual winner(s) paid $${remainingPool.toFixed(2)} remaining pool — ${skipped} skipped`,
  };
}

export async function processPayoutForPeriod(
  period: string,
  periodLabel: string,
  periodStart: Date,
  periodEnd: Date,
  log: (msg: string) => void = console.log,
): Promise<{ paid: number; skipped: number; detail: string }> {
  if (period === "daily") {
    return processDailyPayout(periodLabel, periodStart, periodEnd, log);
  } else if (period === "annual") {
    return processAnnualPayout(periodLabel, periodStart, periodEnd, log);
  }
  throw new Error(`Unknown period: ${period}`);
}

export function getPayoutSchedule(now: Date): Array<{ period: string; periodLabel: string; periodStart: Date; periodEnd: Date }> {
  const results: Array<{ period: string; periodLabel: string; periodStart: Date; periodEnd: Date }> = [];

  // Use PST-based boundaries to match the daily scorecard window exactly (8 AM UTC = midnight PST)
  const yesterday = new Date(now.getTime() - 86400000);
  const periodStart = getPSTMidnight(yesterday);
  const periodEnd   = getPSTMidnight(now);

  const pstStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(yesterday);
  const [year, month, day] = pstStr.split("-").map(Number);

  results.push({
    period: "daily",
    periodLabel: pstStr,
    periodStart,
    periodEnd,
  });

  if (month === 1 && day === 1) {
    const lastYear = year - 1;
    const firstOfLastYear = getPSTMidnight(new Date(Date.UTC(lastYear, 0, 1)));
    const firstOfThisYear = periodStart;
    results.push({
      period: "annual",
      periodLabel: `${lastYear}`,
      periodStart: firstOfLastYear,
      periodEnd: firstOfThisYear,
    });
  }

  return results;
}
