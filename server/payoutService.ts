import { storage } from "./storage";

export const PAYOUT_SPLITS: Record<string, number[]> = {
  daily: [0.50, 0.30, 0.20],
  weekly: [0.35, 0.25, 0.20, 0.12, 0.08],
  monthly: [0.40, 0.25, 0.15, 0.12, 0.08],
  annual: [0.30, 0.20, 0.15, 0.10, 0.08, 0.05, 0.04, 0.03, 0.03, 0.02],
};

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

export async function processPayoutForPeriod(
  period: string,
  periodLabel: string,
  periodStart: Date,
  periodEnd: Date,
  log: (msg: string) => void = console.log,
): Promise<{ paid: number; skipped: number; detail: string }> {
  const splits = PAYOUT_SPLITS[period];
  if (!splits) throw new Error(`Unknown period: ${period}`);
  const topCount = splits.length;

  const existing = await storage.getPayoutsByPeriod(period, periodLabel);
  if (existing.length > 0) {
    return { paid: 0, skipped: 0, detail: `Already processed for ${period} ${periodLabel}` };
  }

  const leaderboard = await storage.getMLBLeaderboardForDateRange(periodStart, periodEnd, topCount * 5);
  const topWinners = leaderboard.slice(0, topCount);

  if (topWinners.length === 0) {
    return { paid: 0, skipped: 0, detail: `No MLB winners for ${period} ${periodLabel}` };
  }

  const poolAmount = await storage.getPrizePoolTotalByPeriod(periodStart);
  if (poolAmount <= 0) {
    return { paid: 0, skipped: 0, detail: `No prize pool funds for ${period} ${periodLabel}` };
  }

  let paid = 0;
  let skipped = 0;

  for (let i = 0; i < topWinners.length; i++) {
    const entry = topWinners[i];
    const share = splits[i];
    const payoutAmount = Math.floor(poolAmount * share * 100) / 100;
    if (payoutAmount < 1) continue;

    const entryUser = await storage.getUser(entry.userId);
    if (entryUser?.subscriptionCancelledAt) {
      log(`~ Payout skipped for ${entry.userId} — payment lapsed`);
      skipped++;
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

    await storage.updatePayout(payout.id, {
      stripeTransferId: null,
      status: "wallet_credited",
      paidAt: new Date(),
    });

    const updatedUser = await storage.getUser(entry.userId);
    if (updatedUser) {
      const currentBalance = parseFloat(updatedUser.walletBalance || "0");
      await storage.updateUser(entry.userId, {
        walletBalance: String(currentBalance + payoutAmount),
      });
    }

    await storage.createTransaction({
      userId: entry.userId,
      type: "prize_payout",
      amount: payoutAmount,
      description: `BetFans ${period} prize payout — Rank #${i + 1} (${(share * 100).toFixed(0)}%) — ${periodLabel}`,
      status: "completed",
    });

    log(`✓ Paid $${payoutAmount} to ${entry.userId} (Rank #${i + 1}, ${periodLabel})`);
    paid++;
  }

  return {
    paid,
    skipped,
    detail: `${paid} winner(s) paid $${poolAmount.toFixed(2)} pool — ${skipped} skipped`,
  };
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

  const etDow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
  if (etDow === 1) {
    const lastMonMidnight = getETMidnight(new Date(now.getTime() - 7 * 86400000));
    const thisMonMidnight = getETMidnight(new Date(now.getTime() - 0 * 86400000));
    const weekLabel = `${year}-W${Math.ceil((now.getTime() - new Date(Date.UTC(year, 0, 1)).getTime()) / 604800000) - 1}`;
    results.push({
      period: "weekly",
      periodLabel: weekLabel,
      periodStart: lastMonMidnight,
      periodEnd: thisMonMidnight,
    });
  }

  if (day === 1) {
    const prevMonthYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const firstOfPrevMonth = getETMidnight(new Date(Date.UTC(prevMonthYear, prevMonth - 1, 1)));
    const firstOfThisMonth = yesterdayMidnightET;
    results.push({
      period: "monthly",
      periodLabel: `${prevMonthYear}-${String(prevMonth).padStart(2, "0")}`,
      periodStart: firstOfPrevMonth,
      periodEnd: firstOfThisMonth,
    });
  }

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
