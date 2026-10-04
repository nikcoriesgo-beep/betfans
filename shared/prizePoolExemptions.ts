import { pacificDay } from "./prizePoolRules";

// Owner-approved exception: this fixture was unavailable until after kickoff.
// Never change the actual league, kickoff, or live status to implement a waiver.
export function isPrizePoolExempt(game: {
  externalId?: string | null;
  homeTeam: string;
  awayTeam: string;
  gameTime: Date | string;
}): boolean {
  return pacificDay(new Date(game.gameTime)) === "2026-10-04" &&
    (game.externalId === "NFL:401872965" ||
      (game.homeTeam === "Washington Commanders" && game.awayTeam === "Indianapolis Colts"));
}