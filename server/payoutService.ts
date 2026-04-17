import { storage } from "./storage";
import { sendPayPalSubscriptionRefund, sendPayPalPayout } from "./paypalService";

function getETMidnight(date: Date): Date {
  const etStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(date);
  const [year, month, day] = etStr.split("-").map(Number);
  const now = new Date();
  const dstStart = new Date(Date.UTC(year, 2, 8 + ((7 - new Date(Date.UTC(year, 2, 8)).getUTCDay()) % 7), 7));
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - new Date(Date.UTC(year, 10, 1)).getUTCDay()) % 7), 6));
  const isDST = now >= dstStart && now < dstEnd;
  const offsetHours = isDST ? 4 : 5;
  return new Date(Date.UTC(year, month - 1, day, offsetHours, 0, 0, 0));
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

  // Current pool = total contributions ever - total already paid out (all time)
  const totalContributions = await storage.getPrizePoolTotal();
  const totalPaidOut = await storage.getTotalPayoutsByPeriod(new Date(0));
  const poolAmount = Math.max(0, totalContributions - totalPaidOut);
  const dailyShare = Math.floor(poolAmount * 0.10); // whole dollars only

  const leaderboard = await storage.getMLBLeaderboardForDateRange(periodStart, periodEnd, 500);
  if (leaderboard.length === 0) {
    return { paid: 0, skipped: 0, detail: `No MLB picks for daily ${periodLabel}` };
  }

  // Total MLB games available to pick that day (based on what was actually picked by anyone)
  const requiredPickCount = await storage.getMLBGameCountForPeriod(periodStart, periodEnd);
  log(`Daily MLB games to qualify: ${requiredPickCount}`);

  const eligible = leaderboard.filter((e: any) => {
    const tier = e.user?.membershipTier;
    const validTier = tier === "legend" || tier === "pro" || tier === "rookie";
    const pickedAll = requiredPickCount === 0 || (e.totalPicks ?? 0) >= requiredPickCount;
    if (!pickedAll) log(`~ ${e.user?.firstName} ${e.user?.lastName} ineligible: picked ${e.totalPicks ?? 0}/${requiredPickCount} MLB games`);
    return validTier && pickedAll;
  });
  if (eligible.length === 0) {
    return { paid: 0, skipped: 0, detail: `No members picked all ${requiredPickCount} MLB games for daily ${periodLabel}` };
  }

  // Rank by most wins first; ROI (win rate) only breaks ties among equal wins
  const sorted = [...eligible].sort((a: any, b: any) => b.wins - a.wins || b.roi - a.roi);
  const topWins = sorted[0].wins;
  const topRoi = sorted[0].roi;
  const tied = sorted.filter((e: any) => e.wins === topWins && e.roi === topRoi);
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

  const yearContributions = await storage.getPrizePoolTotalByPeriod(periodStart);
  const dailyPaidThisYear = await storage.getTotalPayoutsByPeriod(periodStart);
  const remainingPool = Math.max(0, yearContributions - dailyPaidThisYear);

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

  const todayMidnightET = getETMidnight(now);
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayMidnightET = getETMidnight(yesterday);

  const etStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(yesterday);
  const [year, month, day] = etStr.split("-").map(Number);

  results.push({
    period: "daily",
    periodLabel: etStr,
    periodStart: yesterdayMidnightET,
    periodEnd: todayMidnightET,
  });

  if (month === 1 && day === 1) {
    const lastYear = year - 1;
    const firstOfLastYear = getETMidnight(new Date(Date.UTC(lastYear, 0, 1)));
    const firstOfThisYear = yesterdayMidnightET;
    results.push({
      period: "annual",
      periodLabel: `${lastYear}`,
      periodStart: firstOfLastYear,
      periodEnd: firstOfThisYear,
    });
  }

  return results;
}
