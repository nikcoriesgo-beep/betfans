import { isNhlRequired } from "@shared/prizePoolRules";

type SportScore = { picks: number; wins: number; losses: number; pending?: number };
type PrizeScores = { mlb: SportScore; nfl: SportScore; ncaaf: SportScore; nhl?: SportScore };
export function prizePoolScore(scores: PrizeScores, day?: string) {
  if (!day) throw new Error("Pacific day is required for prize scoring");
  return [scores.mlb, scores.nfl, scores.ncaaf, ...(isNhlRequired(day) ? [scores.nhl ?? { picks: 0, wins: 0, losses: 0 }] : [])].reduce<Required<SportScore>>(
    (sum, score) => ({
      picks: sum.picks + score.picks,
      wins: sum.wins + score.wins,
      losses: sum.losses + score.losses,
      pending: sum.pending + (score.pending ?? 0),
    }),
    { picks: 0, wins: 0, losses: 0, pending: 0 },
  );
}

export function prizePoolQualified(scores: PrizeScores, counts: { mlb: number; nfl: number; ncaaf: number; nhl: number }, day: string): boolean {
  return scores.mlb.picks >= counts.mlb && scores.nfl.picks >= counts.nfl &&
    scores.ncaaf.picks >= counts.ncaaf &&
    (!isNhlRequired(day) || (scores.nhl?.picks ?? 0) >= counts.nhl);
}