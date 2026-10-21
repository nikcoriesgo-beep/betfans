import type { Express } from "express";
import { pool } from "./db";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { canPlayFreeGames } from "@shared/membershipAccess";
import { championshipIsLocked, finalRoundStart, MLB_2026_CHAMPIONSHIP_LOCK, type ChampionshipLockRule } from "@shared/championshipLocks";

export const MASTER_SEASON = "2026-27";
const SPORTS = [
  { id: "NFL", name: "NFL Football", path: "football/nfl", year: 2026 },
  { id: "NBA", name: "NBA Basketball", path: "basketball/nba", year: 2027 },
  { id: "NHL", name: "NHL Hockey", path: "hockey/nhl", year: 2027 },
  { id: "MLB", name: "MLB 2026 Championship", path: "baseball/mlb", year: 2026 },
  { id: "NCAAF", name: "NCAA FBS Football", path: "football/college-football", year: 2026 },
  { id: "NCAAB", name: "NCAA Men's Basketball", path: "basketball/mens-college-basketball", year: 2027 },
  { id: "NCAABB", name: "NCAA Baseball", path: "baseball/college-baseball", year: 2027 },
  { id: "WNBA", name: "WNBA Basketball", path: "basketball/wnba", year: 2027 },
  { id: "MLS", name: "MLS Soccer", path: "soccer/usa.1", year: 2027 },
  { id: "NWSL", name: "NWSL Soccer", path: "soccer/usa.nwsl", year: 2027 },
  { id: "EPL", name: "Premier League Soccer", path: "soccer/eng.1", year: 2026 },
  { id: "UCL", name: "UEFA Champions League", path: "soccer/uefa.champions", year: 2026 },
  { id: "FIFA_WC", name: "FIFA World Cup", path: "soccer/fifa.world", year: 2026 },
];
type Team = { id: string; name: string; logo?: string };
type Sport = { id: string; name: string; teams: Team[]; lockAt: string | null; lockRule: ChampionshipLockRule; locked: boolean; available: boolean; error?: string };
let cache: { until: number; sports: Sport[] } | undefined;
let pending: Promise<Sport[]> | undefined;
async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Schedule provider returned ${response.status}`);
  return response.json();
}

async function loadSport(config: typeof SPORTS[number]): Promise<Sport> {
  const sport: Sport = { id: config.id, name: config.name, teams: [], lockAt: null, lockRule: config.id === "MLB" ? "world_series_friday" : config.id === "EPL" ? "final_round" : "playoffs", locked: false, available: false };
  try {
    const data = await json(`https://site.api.espn.com/apis/site/v2/sports/${config.path}/teams?limit=1000`);
    sport.teams = (data.sports?.[0]?.leagues?.[0]?.teams ?? []).map(({ team }: any) => ({
      id: String(team.id), name: team.displayName, logo: team.logos?.[0]?.href,
    })).filter((t: Team) => t.id && t.name).sort((a: Team, b: Team) => a.name.localeCompare(b.name));
    if (config.id === "NCAAF") {
      const group = await json(`https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${config.year}/types/2/groups/80/teams?limit=1000`);
      const ids = new Set((group.items ?? []).map((item: any) => item.$ref?.match(/\/teams\/(\d+)/)?.[1]));
      if (!ids.size) throw new Error("FBS team list unavailable");
      sport.teams = sport.teams.filter(t => ids.has(t.id));
    }
    if (!sport.teams.length) throw new Error("Team list unavailable");
    // Do not invent dates. The provider's published competition deadline is
    // persisted, and once reached the season can never be reopened by refresh.
    try {
      let lockAt: string | null = null;
      if (sport.lockRule === "world_series_friday") {
        // Game 1 is Friday October 23; owner requested a Friday cutoff before it.
        // https://www.mlb.com/news/2026-mlb-playoff-and-world-series-schedule
        lockAt = MLB_2026_CHAMPIONSHIP_LOCK;
      } else if (sport.lockRule === "final_round") {
        // Premier League confirms the 2026–27 final round is May 30, 2027:
        // https://www.premierleague.com/en/news/4468487/dates-for-202627-premier-league-season-confirmed
        // Obtain kickoff times from the fixtures; never assume local midnight.
        const round = await json(`https://site.api.espn.com/apis/site/v2/sports/${config.path}/scoreboard?dates=20270530&limit=1000`);
        lockAt = finalRoundStart(round.events ?? [], config.year, 10);
      } else {
        const path = config.path.split("/");
        const schedule = await json(`https://sports.core.api.espn.com/v2/sports/${path[0]}/leagues/${path[1]}/seasons/${config.year}/types/3`);
        if (config.id !== "NCAAF" && schedule.type === 3 && Number.isFinite(Date.parse(schedule.startDate))) lockAt = schedule.startDate;
      }
      if (lockAt) {
        await pool.query(`INSERT INTO master_championship_sports (season,sport_id,lock_at)
          VALUES ($1,$2,$3) ON CONFLICT (season,sport_id) DO UPDATE
          SET lock_at = CASE WHEN master_championship_sports.lock_at <= NOW()
            THEN master_championship_sports.lock_at ELSE EXCLUDED.lock_at END`,
          [MASTER_SEASON, config.id, lockAt]);
      }
    } catch {
      // A previously verified deadline remains valid during provider outages.
    }
    const result = await pool.query("SELECT lock_at FROM master_championship_sports WHERE season=$1 AND sport_id=$2", [MASTER_SEASON, config.id]);
    // ESPN's football "postseason" starts with bowls, not the CFP playoffs.
    sport.lockAt = config.id === "NCAAF" ? null : result.rows[0]?.lock_at?.toISOString() ?? null;
    sport.locked = championshipIsLocked(sport.lockAt);
    sport.available = !!sport.lockAt;
    if (!sport.available) sport.error = `A verified ${sport.lockRule === "final_round" ? "final-round" : "playoff"} lock date is not available for this competition. Selections are not open yet.`;
  } catch {
    sport.error = "Teams could not be loaded. Please try again.";
  }
  return sport;
}

async function catalog() {
  if (cache && cache.until > Date.now()) return cache.sports.map(s => ({ ...s, locked: championshipIsLocked(s.lockAt) }));
  if (!pending) pending = (async () => {
    const sports: Sport[] = [];
    for (let i = 0; i < SPORTS.length; i += 4) sports.push(...await Promise.all(SPORTS.slice(i, i + 4).map(loadSport)));
    cache = { until: Date.now() + 5 * 60000, sports };
    return sports;
  })().finally(() => { pending = undefined; });
  return pending;
}

async function getPicks(userId: string) {
  const result = await pool.query(`SELECT sport_id AS "sportId",team_id AS "teamId",team_name AS "teamName",season
    FROM master_championship_picks WHERE user_id=$1 AND season=$2 ORDER BY sport_id`, [userId, MASTER_SEASON]);
  return result.rows;
}

export async function registerMasterChampionships(app: Express) {
  await pool.query(`CREATE TABLE IF NOT EXISTS master_championship_sports (
    season TEXT NOT NULL, sport_id TEXT NOT NULL, lock_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (season,sport_id));
    CREATE TABLE IF NOT EXISTS master_championship_picks (
    user_id TEXT NOT NULL REFERENCES users(id), season TEXT NOT NULL, sport_id TEXT NOT NULL,
    team_id TEXT NOT NULL, team_name TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id,season,sport_id));`);
  app.get("/api/master-championships", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const user = userId ? await storage.getUser(userId) : null;
      res.setHeader("Cache-Control", "no-store");
      res.json({ season: MASTER_SEASON, sports: await catalog(), picks: user ? await getPicks(user.id) : [], canPlay: canPlayFreeGames(user) });
    } catch { res.status(503).json({ message: "Championships are temporarily unavailable." }); }
  });
  app.get("/api/master-championships/members/:userId", async (req, res) => {
    try { res.json({ season: MASTER_SEASON, picks: await getPicks(req.params.userId) }); }
    catch { res.status(503).json({ message: "Championship selections could not be loaded." }); }
  });
  app.put("/api/master-championships/picks", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!canPlayFreeGames(user)) return res.status(403).json({ message: "Join Free Play with a valid affiliate code or activate Legend to play." });
      const sport = (await catalog()).find(s => s.id === req.body.sportId);
      const team = sport?.teams.find(t => t.id === req.body.teamId);
      if (!sport?.available || sport.locked || !team) return res.status(422).json({ message: "Choose an available team before this sport's championship lock date." });
      // Lock the deadline row with the write to make concurrent edits and
      // schedule changes serialize. The server clock, not the client, decides.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const deadline = await client.query(`SELECT lock_at > clock_timestamp() AS open FROM master_championship_sports
          WHERE season=$1 AND sport_id=$2 FOR UPDATE`, [MASTER_SEASON, sport.id]);
        if (!deadline.rows[0]?.open) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "This sport's lock deadline has passed. Your championship pick is locked." });
        }
        await client.query(`INSERT INTO master_championship_picks (user_id,season,sport_id,team_id,team_name)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id,season,sport_id)
          DO UPDATE SET team_id=EXCLUDED.team_id,team_name=EXCLUDED.team_name,updated_at=NOW()`,
          [user!.id, MASTER_SEASON, sport.id, team.id, team.name]);
        await client.query("COMMIT");
        res.json({ success: true });
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    } catch { res.status(500).json({ message: "Your selection could not be saved. Please try again." }); }
  });
  app.post("/api/membership/free-play", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user) return res.status(401).json({ message: "Please sign in." });
      if (!["free", "free_play"].includes(user.membershipTier ?? "")) return res.status(409).json({ message: "Your paid membership already includes Free Play. No change is needed." });
      const code = typeof req.body.referralCode === "string" ? req.body.referralCode.trim().toUpperCase() : "";
      const ref = await pool.query("SELECT id FROM users WHERE UPPER(referral_code)=$1 AND id<>$2 LIMIT 1", [code, user.id]);
      if (!code || !ref.rows.length) return res.status(400).json({ message: "A valid affiliate code is required." });
      const referrerId = user.referredBy || ref.rows[0].id;
      await pool.query(`UPDATE users SET membership_tier='free_play',referred_by=$2 WHERE id=$1 AND membership_tier IN ('free','free_play')`, [user.id, referrerId]);
      res.json({ membershipTier: "free_play" });
    } catch { res.status(500).json({ message: "Free Play enrollment could not be completed." }); }
  });
}
