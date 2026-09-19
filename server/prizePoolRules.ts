type SportScore = { picks: number; wins: number; losses: number; pending?: number };
export function prizePoolScore(scores: { mlb: SportScore; nfl: SportScore; ncaaf: SportScore }) {
  return [scores.mlb, scores.nfl, scores.ncaaf].reduce<Required<SportScore>>(
    (sum, score) => ({
      picks: sum.picks + score.picks,
      wins: sum.wins + score.wins,
      losses: sum.losses + score.losses,
      pending: sum.pending + (score.pending ?? 0),
    }),
    { picks: 0, wins: 0, losses: 0, pending: 0 },
  );
}