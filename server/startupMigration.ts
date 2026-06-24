import { pool } from "./db";
import type { PoolClient } from "pg";

// Real Nikco account (aa5b3efa) — the one he actually logs into.
// The old seeded UUID (29b670b7) is now NIKCOX-SEED and has no picks.
const NIK_ID = 'aa5b3efa-fb3e-49b1-9f60-983bcec7d67a';
const SCOTT_ID = '61a80e5c-4c0c-484a-87a7-7c1ae92c0991';
const MOE_ID = '827bf2c0-df36-4045-b2bf-5650e9aa02a4';

const NBA_MATCHUPS = [
  ['Boston Celtics', 'Miami Heat'], ['Oklahoma City Thunder', 'Golden State Warriors'],
  ['Denver Nuggets', 'Los Angeles Lakers'], ['Milwaukee Bucks', 'Chicago Bulls'],
  ['Cleveland Cavaliers', 'New York Knicks'], ['Indiana Pacers', 'Philadelphia 76ers'],
  ['Memphis Grizzlies', 'San Antonio Spurs'], ['Dallas Mavericks', 'Houston Rockets'],
  ['Phoenix Suns', 'Sacramento Kings'], ['Minnesota Timberwolves', 'Portland Trail Blazers'],
  ['Los Angeles Clippers', 'Utah Jazz'], ['New Orleans Pelicans', 'Orlando Magic'],
  ['Atlanta Hawks', 'Toronto Raptors'], ['Brooklyn Nets', 'Washington Wizards'],
  ['Detroit Pistons', 'Charlotte Hornets'],
];

const MLB_MATCHUPS = [
  ['New York Yankees', 'Boston Red Sox'], ['Los Angeles Dodgers', 'San Francisco Giants'],
  ['Houston Astros', 'Texas Rangers'], ['Atlanta Braves', 'New York Mets'],
  ['Philadelphia Phillies', 'Washington Nationals'], ['Chicago Cubs', 'St. Louis Cardinals'],
  ['Milwaukee Brewers', 'Cincinnati Reds'], ['Seattle Mariners', 'Oakland Athletics'],
  ['Minnesota Twins', 'Cleveland Guardians'], ['San Diego Padres', 'Colorado Rockies'],
  ['Toronto Blue Jays', 'Tampa Bay Rays'], ['Baltimore Orioles', 'Detroit Tigers'],
  ['Miami Marlins', 'Pittsburgh Pirates'], ['Los Angeles Angels', 'Kansas City Royals'],
  ['Arizona Diamondbacks', 'Chicago White Sox'],
];

async function seedHistoricalGamesAndPredictions(client: PoolClient) {
  console.log("[migration] Seeding historical games and predictions...");

  // Build exact W/L result sequence
  function makeResults(wins: number, losses: number): string[] {
    const results: string[] = [];
    let w = wins, l = losses;
    const total = wins + losses;
    for (let i = 0; i < total; i++) {
      // Proportional distribution — guarantees exact W and L totals
      if (w === 0) { results.push('loss'); l--; }
      else if (l === 0) { results.push('win'); w--; }
      else if (w / (w + l) > 0.5) { results.push('win'); w--; }
      else { results.push('loss'); l--; }
    }
    return results;
  }

  // Each user gets their own dedicated game per pick — no sharing, no duplicate results
  async function seedUserPicks(
    userId: string,
    league: string,
    wins: number,
    losses: number,
    startDate: Date,
    matchups: string[][]
  ) {
    const results = makeResults(wins, losses);
    const total = results.length;
    for (let i = 0; i < total; i++) {
      const matchup = matchups[i % matchups.length];
      let date = new Date(startDate.getTime() + i * 28800000); // spread 8h apart (~3 picks/day)
      // Hard cap: seeded games must be at least 14 days old so they never
      // appear in the 7-day scorecard window used by the prize-pool scorecard.
      const cap = new Date(Date.now() - 14 * 24 * 3600000);
      if (date > cap) date = new Date(cap.getTime() - (total - i) * 3600000);
      const isWin = results[i] === 'win';
      const isNba = league === 'NBA';
      const homeScore = isWin
        ? (isNba ? 108 + (i % 15) : 5 + (i % 4))
        : (isNba ? 95 + (i % 10) : 2 + (i % 3));
      const awayScore = isWin
        ? (isNba ? 95 + (i % 10) : 2 + (i % 3))
        : (isNba ? 108 + (i % 12) : 5 + (i % 4));

      const gameResult = await client.query(`
        INSERT INTO games (league, home_team, away_team, game_time, status, home_score, away_score, spider_pick, spider_confidence, is_pro_locked, created_at)
        VALUES ($1, $2, $3, $4, 'final', $5, $6, $7, 75, false, $4)
        RETURNING id
      `, [league, matchup[0], matchup[1], date, homeScore, awayScore, matchup[0]]);

      const gameId = gameResult.rows[0].id;
      await client.query(`
        INSERT INTO predictions (user_id, game_id, prediction_type, pick, units, result, payout, created_at)
        VALUES ($1, $2, 'moneyline', $3, 1, $4, $5, $6)
      `, [userId, gameId, matchup[0], results[i], isWin ? 1 : -1, date]);
    }
    console.log(`[migration] ${userId.slice(0,8)}: seeded ${total} picks (${wins}W-${losses}L) in ${league}`);
  }

  // Nik: 173W-139L YTD (NBA Jan 1 - Apr 18) — only real member with known record
  await seedUserPicks(NIK_ID, 'NBA', 173, 139, new Date('2026-01-01T22:30:00Z'), NBA_MATCHUPS);

  // Historical MLB games (no user predictions — just game data for the feed)
  const mlbStart = new Date('2026-03-28T18:10:00Z');
  for (let day = 0; day < 22; day++) {
    for (let g = 0; g < 3; g++) {
      const matchup = MLB_MATCHUPS[(day * 3 + g) % MLB_MATCHUPS.length];
      const date = new Date(mlbStart.getTime() + day * 86400000 + g * 3600000);
      const homeWins = (day * 3 + g) % 3 !== 0;
      await client.query(`
        INSERT INTO games (league, home_team, away_team, game_time, status, home_score, away_score, spider_pick, spider_confidence, is_pro_locked, created_at)
        VALUES ($1, $2, $3, $4, 'final', $5, $6, $7, 72, false, $4)
      `, ['MLB', matchup[0], matchup[1], date,
          homeWins ? 5 + (day % 4) : 2 + (g % 3),
          homeWins ? 2 + (g % 3) : 5 + (day % 4),
          matchup[0]]);
    }
  }
  console.log(`[migration] Seeded 66 historical MLB game records`);
}

// Run AFTER server starts — seeds historical game/prediction data in background
export async function runHistoricalDataSeed() {
  const client = await pool.connect();
  try {
    // Check if real Nikco has 312 seeded NBA picks (173W+139L) — if not, seed them
    // These are historical NBA picks from Jan-Apr 2026 before daily tracking began.
    const nikPickCount = await client.query(
      `SELECT count(*) as cnt FROM predictions p
       JOIN games g ON p.game_id = g.id
       WHERE p.user_id = $1 AND g.league = 'NBA' AND p.result IN ('win','loss')`,
      [NIK_ID]
    );
    const nikPicks = parseInt(nikPickCount.rows[0].cnt);
    if (nikPicks < 312) {
      console.log(`[migration] Nik has ${nikPicks} NBA picks (need ≥312), clearing and reseeding historical data...`);
      // Only delete historical seeded data — keep any real games/predictions from today onwards
      await client.query(`DELETE FROM predictions WHERE user_id = $1 AND created_at < '2026-04-19'`, [NIK_ID]);
      await client.query(`DELETE FROM games WHERE game_time < '2026-04-19' AND status = 'final'`);
      await seedHistoricalGamesAndPredictions(client);
    } else {
      console.log("[migration] Historical NBA picks already seeded correctly (312 picks for real Nikco)");
    }
  } catch (err: any) {
    console.error("[migration] Historical seed error:", err.message);
  } finally {
    client.release();
  }
}

export async function runStartupMigration() {
  const client = await pool.connect();
  try {
    console.log("[migration] Running startup migration...");

    // Self-heal: delete fake seeded NBA games that are still in the future.
    // Seeded games have created_at = game_time (same timestamp). Real ESPN games
    // have created_at = recent fetch time (very different from game_time).
    // We delete any future NBA game where |created_at - game_time| < 60 seconds.
    try {
      const delPreds = await client.query(`
        DELETE FROM predictions
        WHERE game_id IN (
          SELECT id FROM games
          WHERE league = 'NBA'
            AND game_time > NOW() - INTERVAL '6 hours'
            AND ABS(EXTRACT(EPOCH FROM (created_at - game_time))) < 60
        )
      `);
      if (delPreds.rowCount && delPreds.rowCount > 0) {
        console.log(`[migration] Self-heal: deleted ${delPreds.rowCount} predictions for fake seeded NBA games`);
      }
      const delGames = await client.query(`
        DELETE FROM games
        WHERE league = 'NBA'
          AND game_time > NOW() - INTERVAL '6 hours'
          AND ABS(EXTRACT(EPOCH FROM (created_at - game_time))) < 60
      `);
      if (delGames.rowCount && delGames.rowCount > 0) {
        console.log(`[migration] Self-heal: deleted ${delGames.rowCount} fake seeded NBA games`);
      }

      // Self-heal: DELETE duplicate upcoming games (same league + teams + PST-date + 90-min time bucket).
      // Caused by the MLB series bug where the same matchup plays 3 days in a row.
      // Time bucket ensures doubleheaders (same matchup at different times) are NOT deleted.
      // Strategy: for each duplicate group, keep the game_id with the most picks (or lowest id),
      // reassign any picks from the other copies to the keeper, then delete the extras.
      const dupRows = await client.query(`
        WITH bucketed AS (
          SELECT
            id,
            league,
            home_team,
            away_team,
            DATE(game_time AT TIME ZONE 'America/Los_Angeles') AS pst_date,
            ROUND(EXTRACT(EPOCH FROM game_time) / 5400) AS time_bucket
          FROM games
          WHERE status = 'upcoming'
        ),
        ranked AS (
          SELECT
            id, league, home_team, away_team, pst_date, time_bucket,
            ROW_NUMBER() OVER (
              PARTITION BY league, home_team, away_team, pst_date, time_bucket
              ORDER BY
                (SELECT COUNT(*) FROM predictions WHERE game_id = bucketed.id) DESC,
                id ASC
            ) AS rn
          FROM bucketed
        )
        SELECT id, league, home_team, away_team, pst_date, rn FROM ranked
        WHERE (league, home_team, away_team, pst_date, time_bucket) IN (
          SELECT league, home_team, away_team, pst_date, time_bucket
          FROM bucketed
          GROUP BY league, home_team, away_team, pst_date, time_bucket
          HAVING COUNT(*) > 1
        )
        ORDER BY league, home_team, away_team, pst_date, rn
      `);

      if (dupRows.rowCount && dupRows.rowCount > 0) {
        // Group by (league, home_team, away_team, pst_date, time_bucket) — ids are integers (serial)
        const groups: Record<string, { keeper: number; dupes: number[] }> = {};
        for (const row of dupRows.rows) {
          const key = `${row.league}|${row.home_team}|${row.away_team}|${row.pst_date}|${row.time_bucket}`;
          if (!groups[key]) groups[key] = { keeper: Number(row.id), dupes: [] };
          else groups[key].dupes.push(Number(row.id));
        }
        let totalDupesRemoved = 0;
        for (const [key, { keeper, dupes }] of Object.entries(groups)) {
          if (dupes.length === 0) continue;
          // Reassign any picks from duplicates to the keeper (game_id is integer)
          await client.query(
            `UPDATE predictions SET game_id = $1 WHERE game_id = ANY($2::int[])`,
            [keeper, dupes]
          );
          // Delete duplicate game records (id is integer/serial)
          const del = await client.query(
            `DELETE FROM games WHERE id = ANY($1::int[])`,
            [dupes]
          );
          totalDupesRemoved += del.rowCount ?? 0;
          console.log(`[migration] Dedup: kept game #${keeper} for ${key}, removed ${dupes.length} dupes`);
        }
        console.log(`[migration] Self-heal: removed ${totalDupesRemoved} duplicate upcoming game records`);
      }

      // Ensure subscription_paid_until column exists (added May 2026)
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_paid_until TIMESTAMP`);

      // ── Seed known PayPal subscription IDs that were missing in the prod DB ──
      // Scott Lunny and Ian Glover subscribed before their IDs were properly stored.
      // Without these the lapse sweep downgrades them to free every morning.
      // Idempotent: only runs when paypal_subscription_id is NULL or empty.
      await client.query(`
        UPDATE users
        SET paypal_subscription_id    = 'I-4KGNK2G8FDCG',
            membership_tier           = CASE WHEN membership_tier = 'free' THEN 'legend' ELSE membership_tier END,
            subscription_paid_until   = GREATEST(COALESCE(subscription_paid_until, NOW()), NOW() + INTERVAL '45 days'),
            subscription_cancelled_at = NULL
        WHERE phone = '8182314634'
          AND (paypal_subscription_id IS NULL OR paypal_subscription_id = '')
      `);
      await client.query(`
        UPDATE users
        SET paypal_subscription_id    = 'I-0XKYAP00ULWM',
            membership_tier           = CASE WHEN membership_tier = 'free' THEN 'legend' ELSE membership_tier END,
            subscription_paid_until   = GREATEST(COALESCE(subscription_paid_until, NOW()), NOW() + INTERVAL '45 days'),
            subscription_cancelled_at = NULL
        WHERE phone = '3107367905'
          AND (paypal_subscription_id IS NULL OR paypal_subscription_id = '')
      `);
      console.log("[migration] Subscription IDs seeded for Scott and Ian (no-op if already set)");

      // ── One-time cleanup: remove accidental manual_payment contributions added 2026-05-10 ──
      // record-payment was called to restore tiers but it also added prize pool contributions.
      // Those were erroneous — real contributions come from PayPal webhooks only.
      await client.query(`
        DELETE FROM prize_pool_contributions
        WHERE source = 'manual_payment'
          AND created_at >= '2026-05-10'::date
      `);

      // Founders are permanently exempt — set far future expiry
      await client.query(`
        UPDATE users SET subscription_paid_until = '2099-12-31'
        WHERE referral_code IN ('NIKCOX', 'DAMON822')
          AND (subscription_paid_until IS NULL OR subscription_paid_until < '2099-12-30')
      `);
      // Members with a PayPal subscription plan: refresh their expiry to 31 days from now.
      // The PayPal audit in the daily sweep re-confirms status — this is just the initial window.
      await client.query(`
        UPDATE users SET subscription_paid_until = NOW() + INTERVAL '31 days'
        WHERE paypal_subscription_id IS NOT NULL
          AND referral_code NOT IN ('NIKCOX', 'DAMON822')
          AND (subscription_paid_until IS NULL OR subscription_paid_until < NOW() + INTERVAL '1 day')
      `);

      // Self-heal: reset any predictions graded as win/loss on UPCOMING games that haven't started yet.
      // This happens when the sportsDataService re-uses an old game record (same PST-day matchup)
      // for a new game, carrying over old graded results onto tomorrow's game.
      // CRITICAL: only reset picks on 'upcoming' games — never touch 'finished' or 'live' games.
      // Without the status filter, west-coast evening games (9:30 PM ET = 1:30 AM UTC) get reset
      // to 'pending' during early deploys and then misgraded when the final score comes in.
      const resetFutureGraded = await client.query(`
        UPDATE predictions SET result = 'pending'
        WHERE result != 'pending'
          AND game_id IN (
            SELECT id FROM games
            WHERE game_time > NOW() + INTERVAL '30 minutes'
              AND status = 'upcoming'
          )
      `);
      if (resetFutureGraded.rowCount && resetFutureGraded.rowCount > 0) {
        console.log(`[migration] Self-heal: reset ${resetFutureGraded.rowCount} graded predictions on future games`);
      }

      // Self-heal: clear home_score/away_score on games that are upcoming (ESPN may have stale scores).
      await client.query(`
        UPDATE games SET home_score = NULL, away_score = NULL, status = 'upcoming'
        WHERE status = 'upcoming' AND (home_score IS NOT NULL OR away_score IS NOT NULL)
      `);

      // Self-heal: re-grade misgraded Moneyline picks from the last 72 hours using pure SQL.
      // This catches picks that were graded wrong during partial score updates (e.g. ESPN returns
      // interim scores briefly before the final). Uses the last word of each team name for matching
      // (e.g. 'Thunder' from 'Oklahoma City Thunder') since it is typically unique.
      // Runs synchronously in migration so it fires before the async sportsDataSync starts.
      const fixMoneylineLoss = await client.query(`
        UPDATE predictions p
        SET result = 'win', payout = 1
        FROM games g
        WHERE p.game_id = g.id
          AND g.status = 'finished'
          AND g.home_score IS NOT NULL
          AND g.away_score IS NOT NULL
          AND g.home_score > g.away_score
          AND p.result = 'loss'
          AND lower(p.prediction_type) = 'moneyline'
          AND p.created_at > NOW() - INTERVAL '72 hours'
          AND lower(p.pick) LIKE '%' || lower(regexp_replace(g.home_team, '^.* ', '')) || '%'
      `);
      const fixMoneylineWin = await client.query(`
        UPDATE predictions p
        SET result = 'loss', payout = -1
        FROM games g
        WHERE p.game_id = g.id
          AND g.status = 'finished'
          AND g.home_score IS NOT NULL
          AND g.away_score IS NOT NULL
          AND g.home_score < g.away_score
          AND p.result = 'win'
          AND lower(p.prediction_type) = 'moneyline'
          AND p.created_at > NOW() - INTERVAL '72 hours'
          AND lower(p.pick) LIKE '%' || lower(regexp_replace(g.home_team, '^.* ', '')) || '%'
      `);
      // Away-team variant: pick mentions the away team's last word
      const fixMoneylineAwayLoss = await client.query(`
        UPDATE predictions p
        SET result = 'win', payout = 1
        FROM games g
        WHERE p.game_id = g.id
          AND g.status = 'finished'
          AND g.home_score IS NOT NULL
          AND g.away_score IS NOT NULL
          AND g.away_score > g.home_score
          AND p.result = 'loss'
          AND lower(p.prediction_type) = 'moneyline'
          AND p.created_at > NOW() - INTERVAL '72 hours'
          AND lower(p.pick) LIKE '%' || lower(regexp_replace(g.away_team, '^.* ', '')) || '%'
      `);
      const fixMoneylineAwayWin = await client.query(`
        UPDATE predictions p
        SET result = 'loss', payout = -1
        FROM games g
        WHERE p.game_id = g.id
          AND g.status = 'finished'
          AND g.home_score IS NOT NULL
          AND g.away_score IS NOT NULL
          AND g.away_score < g.home_score
          AND p.result = 'win'
          AND lower(p.prediction_type) = 'moneyline'
          AND p.created_at > NOW() - INTERVAL '72 hours'
          AND lower(p.pick) LIKE '%' || lower(regexp_replace(g.away_team, '^.* ', '')) || '%'
      `);
      const totalFixed = (fixMoneylineLoss.rowCount ?? 0) + (fixMoneylineWin.rowCount ?? 0)
                       + (fixMoneylineAwayLoss.rowCount ?? 0) + (fixMoneylineAwayWin.rowCount ?? 0);
      if (totalFixed > 0) {
        console.log(`[migration] Self-heal: corrected ${totalFixed} misgraded Moneyline pick(s) on finished games`);
      }

      // Self-heal: delete ALL picks for Scott & Moe — they are test accounts and should never
      // have any picks. Any predictions on their accounts are seeded/fake data.
      const delScottMoe = await client.query(`
        DELETE FROM predictions WHERE user_id IN ($1, $2)
      `, [SCOTT_ID, MOE_ID]);
      if (delScottMoe.rowCount && delScottMoe.rowCount > 0) {
        console.log(`[migration] Self-heal: deleted ${delScottMoe.rowCount} fake picks for Scott/Moe`);
      }
      // Also wipe their leaderboard entries so they show 0-0
      await client.query(`DELETE FROM leaderboard_entries WHERE user_id IN ($1, $2)`, [SCOTT_ID, MOE_ID]);
    } catch (e: any) {
      console.log("[migration] Self-heal skipped (tables not yet created):", e.message);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT,
        password_hash TEXT,
        first_name TEXT,
        last_name TEXT,
        profile_image_url TEXT,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        paypal_subscription_id TEXT,
        paypal_payout_email TEXT,
        membership_tier TEXT DEFAULT 'rookie',
        wallet_balance TEXT DEFAULT '0',
        city TEXT,
        state TEXT,
        country TEXT DEFAULT 'US',
        latitude REAL,
        longitude REAL,
        phone TEXT,
        sms_consent BOOLEAN DEFAULT FALSE,
        sms_consent_date TIMESTAMP,
        referral_code TEXT,
        referred_by TEXT,
        subscription_cancelled_at TIMESTAMP,
        subscription_paid_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMP NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        league TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        game_time TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'upcoming',
        home_score INTEGER,
        away_score INTEGER,
        spread TEXT,
        total TEXT,
        moneyline_home TEXT,
        moneyline_away TEXT,
        spider_pick TEXT,
        spider_confidence INTEGER,
        is_pro_locked BOOLEAN DEFAULT FALSE,
        home_pitcher TEXT,
        away_pitcher TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        game_id INTEGER NOT NULL REFERENCES games(id),
        prediction_type TEXT NOT NULL,
        pick TEXT NOT NULL,
        units REAL NOT NULL DEFAULT 1,
        odds TEXT,
        result TEXT DEFAULT 'pending',
        payout REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        channel TEXT NOT NULL DEFAULT 'general',
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'completed',
        stripe_payment_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS leaderboard_entries (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        period TEXT NOT NULL,
        period_start TIMESTAMP NOT NULL,
        rank INTEGER,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        roi REAL DEFAULT 0,
        profit REAL DEFAULT 0,
        streak INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS music_tracks (
        id SERIAL PRIMARY KEY,
        suno_id TEXT NOT NULL,
        title TEXT NOT NULL,
        schedule_date TEXT,
        active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS threads (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        profile_user_id TEXT REFERENCES users(id),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        pinned BOOLEAN DEFAULT FALSE,
        reply_count INTEGER DEFAULT 0,
        last_reply_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS thread_replies (
        id SERIAL PRIMARY KEY,
        thread_id INTEGER NOT NULL REFERENCES threads(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        likes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        amount REAL NOT NULL,
        period TEXT NOT NULL,
        period_label TEXT NOT NULL,
        rank INTEGER NOT NULL,
        share_percent REAL NOT NULL,
        stripe_payout_id TEXT,
        stripe_transfer_id TEXT,
        status TEXT DEFAULT 'pending',
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        wins INTEGER,
        losses INTEGER
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS prize_pool_contributions (
        id SERIAL PRIMARY KEY,
        amount REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'subscription',
        stripe_payment_id TEXT,
        user_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS advertisers (
        id SERIAL PRIMARY KEY,
        company_name TEXT NOT NULL,
        logo_url TEXT NOT NULL,
        tagline TEXT,
        website_url TEXT,
        placement TEXT NOT NULL DEFAULT 'banner',
        annual_fee INTEGER NOT NULL DEFAULT 100000,
        active BOOLEAN DEFAULT TRUE,
        start_date TIMESTAMP DEFAULT NOW(),
        end_date TIMESTAMP,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_id TEXT NOT NULL REFERENCES users(id),
        referred_id TEXT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'signed_up',
        signup_bonus REAL DEFAULT 0,
        prediction_bonus REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS merch_orders (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        stripe_payment_intent_id TEXT,
        stripe_checkout_session_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled',
        dropshipper_order_id TEXT,
        items TEXT NOT NULL,
        shipping_name TEXT NOT NULL,
        shipping_address TEXT NOT NULL,
        shipping_city TEXT NOT NULL,
        shipping_state TEXT NOT NULL,
        shipping_zip TEXT NOT NULL,
        shipping_country TEXT NOT NULL DEFAULT 'US',
        shipping_email TEXT,
        shipping_phone TEXT,
        fulfillment_provider TEXT,
        subtotal REAL NOT NULL,
        wholesale_cost REAL NOT NULL,
        shipping_cost REAL NOT NULL DEFAULT 0,
        total_charged REAL NOT NULL,
        platform_profit REAL NOT NULL,
        tracking_number TEXT,
        tracking_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS site_counters (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log("[migration] All tables created successfully");

    // Ensure the real Nikco account (aa5b3efa) has NIKCOX referral code and legend tier.
    // The old seeded UUID (29b670b7) is now NIKCOX-SEED — do NOT recreate it with NIKCOX.
    const nikCheck = await client.query(
      `SELECT 1 FROM users WHERE id = $1`, ['aa5b3efa-fb3e-49b1-9f60-983bcec7d67a']
    );
    if (nikCheck.rowCount === 0) {
      // Real Nikco doesn't exist yet — create his account
      await client.query(`
        INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier, referral_code, wallet_balance, created_at, updated_at)
        VALUES (
          'aa5b3efa-fb3e-49b1-9f60-983bcec7d67a',
          '2482757932',
          '$2b$10$lvK7ApWKudqKz8ThTrdUJe726Q2qsQap7stfIcFqMuY3O2AUzdFyu',
          'Nikco',
          'X',
          'legend',
          'NIKCOX',
          '0',
          '2026-01-01T00:00:00Z',
          NOW()
        )
      `);
      console.log("[migration] Created real Nikco account (aa5b3efa)");
    } else {
      // Ensure real Nikco always has NIKCOX referral code and correct name
      await client.query(`
        UPDATE users SET first_name = 'Nikco', last_name = 'X', referral_code = 'NIKCOX', membership_tier = 'legend'
        WHERE id = 'aa5b3efa-fb3e-49b1-9f60-983bcec7d67a'
      `);
    }
    // Make sure the old seeded UUID never has the NIKCOX code (to avoid BFB route confusion)
    // Also downgrade it to 'free' and CLEAR its phone so find-user never returns it instead of real Nikco
    await client.query(
      `UPDATE users SET referral_code = 'NIKCOX-SEED', membership_tier = 'free', phone = NULL WHERE id = '29b670b7-5296-44dc-a0a0-aec0d878ef9b'`
    );
    // Remove ALL leaderboard entries for any user tagged NIKCOX-SEED — including bfb_ytd.
    // Delete by referral_code (not UUID) so this catches any account in prod that holds the code.
    // The real Nikco UUID (aa5b3efa) owns the authoritative bfb_ytd entry maintained by refreshBFBRecord().
    await client.query(
      `DELETE FROM leaderboard_entries WHERE user_id IN (SELECT id FROM users WHERE referral_code = 'NIKCOX-SEED')`
    );

    // Seed Scott's real account (Legend)
    const scottPhone = '8182314634';
    const scottCheck = await client.query(`SELECT 1 FROM users WHERE phone = $1`, [scottPhone]);
    if (scottCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier, referral_code, wallet_balance, created_at, updated_at)
        VALUES (
          '550e8400-e29b-41d4-a716-446655440001',
          '8182314634',
          '$2b$10$c/Wpwe4dfQebNTYaHGja3edrkQESNeamelffoP77hnjRTSGd.setG',
          'Scott',
          '',
          'legend',
          'SCOTT699',
          '0',
          '2026-01-01T00:00:00Z',
          NOW()
        )
      `);
      console.log("[migration] Seeded Scott account");
    } else {
      await client.query(`UPDATE users SET membership_tier = 'legend', first_name = 'Scott', referral_code = 'SCOTT699' WHERE phone = $1`, [scottPhone]);
      // Reset to temp password if still using the old Neon hash (user hasn't changed it yet)
      await client.query(`UPDATE users SET password_hash = '$2b$10$WkqjSdvKC9EZlVrP3Je6wuDWlgLvK4ONDg7sfe9bmTQcqq2oxAMu.' WHERE phone = $1 AND password_hash = '$2b$10$c/Wpwe4dfQebNTYaHGja3edrkQESNeamelffoP77hnjRTSGd.setG'`, [scottPhone]);
    }

    // Seed Moe's real account (Legend)
    const moePhone = '2138724448';
    const moeCheck = await client.query(`SELECT 1 FROM users WHERE phone = $1`, [moePhone]);
    if (moeCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier, referral_code, wallet_balance, created_at, updated_at)
        VALUES (
          '550e8400-e29b-41d4-a716-446655440002',
          '2138724448',
          '$2b$10$c/Wpwe4dfQebNTYaHGja3edrkQESNeamelffoP77hnjRTSGd.setG',
          'Moe',
          '',
          'legend',
          'MOE213',
          '0',
          '2026-01-01T00:00:00Z',
          NOW()
        )
      `);
      console.log("[migration] Seeded Moe account");
    } else {
      await client.query(`UPDATE users SET membership_tier = 'legend', first_name = 'Moe' WHERE phone = $1 AND membership_tier != 'legend'`, [moePhone]);
      await client.query(`UPDATE users SET password_hash = '$2b$10$WkqjSdvKC9EZlVrP3Je6wuDWlgLvK4ONDg7sfe9bmTQcqq2oxAMu.' WHERE phone = $1 AND password_hash = '$2b$10$c/Wpwe4dfQebNTYaHGja3edrkQESNeamelffoP77hnjRTSGd.setG'`, [moePhone]);
    }

    // Seed Ian's real account (Legend)
    const ianPhone = '3107367905';
    const ianCheck = await client.query(`SELECT 1 FROM users WHERE phone = $1`, [ianPhone]);
    if (ianCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier, referral_code, wallet_balance, created_at, updated_at)
        VALUES (
          '550e8400-e29b-41d4-a716-446655440003',
          '3107367905',
          '$2b$10$c/Wpwe4dfQebNTYaHGja3edrkQESNeamelffoP77hnjRTSGd.setG',
          'Ian',
          '',
          'legend',
          'IAN310',
          '0',
          '2026-04-20T00:00:00Z',
          NOW()
        )
      `);
      console.log("[migration] Seeded Ian account");
    } else {
      await client.query(`UPDATE users SET membership_tier = 'legend', first_name = 'Ian' WHERE phone = $1 AND membership_tier != 'legend'`, [ianPhone]);
      await client.query(`UPDATE users SET password_hash = '$2b$10$WkqjSdvKC9EZlVrP3Je6wuDWlgLvK4ONDg7sfe9bmTQcqq2oxAMu.' WHERE phone = $1 AND password_hash = '$2b$10$c/Wpwe4dfQebNTYaHGja3edrkQESNeamelffoP77hnjRTSGd.setG'`, [ianPhone]);
    }

    // Seed Jose Cuevas account (Legend — joined May 28 2026, phone 3107102317)
    const josePhone = '3107102317';
    const joseCheck = await client.query(`SELECT 1 FROM users WHERE phone = $1`, [josePhone]);
    if (joseCheck.rowCount === 0) {
      const bcrypt = await import('bcryptjs');
      const joseHash = await bcrypt.default.hash('BetFans2026!', 10);
      await client.query(`
        INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier, referral_code, wallet_balance, created_at, updated_at, subscription_paid_until)
        VALUES (
          '95987539-6932-417d-b3df-5a5350c2bf1a',
          '3107102317',
          $1,
          'Jose',
          'Cuevas',
          'legend',
          'JOSE171',
          '0',
          '2026-05-28T00:00:00Z',
          NOW(),
          NOW() + INTERVAL '1 year'
        )
      `, [joseHash]);
      console.log("[migration] Seeded Jose Cuevas account");
    } else {
      // Ensure Jose stays legend and has subscription_paid_until set (prevents morningCheck lapse)
      await client.query(`
        UPDATE users SET
          membership_tier = 'legend',
          first_name = 'Jose',
          last_name = COALESCE(NULLIF(last_name, ''), 'Cuevas'),
          subscription_paid_until = GREATEST(COALESCE(subscription_paid_until, NOW()), NOW() + INTERVAL '1 year')
        WHERE phone = $1
      `, [josePhone]);
    }
    console.log("[migration] Jose Cuevas subscription_paid_until protected");

    // Seed Jim Campanis account (Legend)
    const jimPhone = '9515295444';
    const jimCheck = await client.query(`SELECT 1 FROM users WHERE phone = $1`, [jimPhone]);
    if (jimCheck.rowCount === 0) {
      const bcrypt = await import('bcryptjs');
      const jimHash = await bcrypt.default.hash('BetFans2026!', 10);
      await client.query(`
        INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier, referral_code, wallet_balance, created_at, updated_at, subscription_paid_until)
        VALUES (
          gen_random_uuid(),
          '9515295444',
          $1,
          'Jim',
          'Campanis',
          'legend',
          'JIMCAMPANIS',
          '0',
          NOW(),
          NOW(),
          NOW() + INTERVAL '1 year'
        )
      `, [jimHash]);
      console.log("[migration] Seeded Jim Campanis account");
    } else {
      await client.query(`
        UPDATE users SET
          membership_tier = 'legend',
          first_name = 'Jim',
          last_name = COALESCE(NULLIF(last_name, ''), 'Campanis'),
          subscription_paid_until = GREATEST(COALESCE(subscription_paid_until, NOW()), NOW() + INTERVAL '1 year')
        WHERE phone = $1
      `, [jimPhone]);
    }
    console.log("[migration] Jim Campanis subscription_paid_until protected");

    // Seed Bryant Nelson account (Legend)
    const bryantPhone = '4803950299';
    const bryantCheck = await client.query(`SELECT 1 FROM users WHERE phone = $1`, [bryantPhone]);
    if (bryantCheck.rowCount === 0) {
      const bcrypt = await import('bcryptjs');
      const bryantHash = await bcrypt.default.hash('BetFans2026!', 10);
      await client.query(`
        INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier, referral_code, wallet_balance, created_at, updated_at, subscription_paid_until)
        VALUES (
          '0ddcc724-0000-0000-0000-000000000000',
          '4803950299',
          $1,
          'Bryant',
          'Nelson',
          'legend',
          'BRYANTNELSON',
          '0',
          NOW(),
          NOW(),
          NOW() + INTERVAL '1 year'
        )
      `, [bryantHash]);
      console.log("[migration] Seeded Bryant Nelson account");
    } else {
      await client.query(`
        UPDATE users SET
          membership_tier = 'legend',
          first_name = 'Bryant',
          last_name = COALESCE(NULLIF(last_name, ''), 'Nelson'),
          subscription_paid_until = GREATEST(COALESCE(subscription_paid_until, NOW()), NOW() + INTERVAL '1 year')
        WHERE phone = $1
      `, [bryantPhone]);
    }
    console.log("[migration] Bryant Nelson subscription_paid_until protected");

    // Ensure all manually-managed members have subscription_paid_until set so morningCheck
    // never downgrades them (affects any member without a real PayPal subscription ID)
    await client.query(`
      UPDATE users
      SET subscription_paid_until = GREATEST(COALESCE(subscription_paid_until, NOW()), NOW() + INTERVAL '1 year')
      WHERE phone IN ('2138724448', '8182314634', '3107367905', '2482757932', '3107102317', '9515295444', '4803950299')
        AND (subscription_paid_until IS NULL OR subscription_paid_until < NOW() + INTERVAL '30 days')
    `);
    console.log("[migration] subscription_paid_until extended for all seeded members");

    // Seed historical leaderboard for Scott and Moe (real YTD stats)
    const scottId = '550e8400-e29b-41d4-a716-446655440001';
    const moeId   = '550e8400-e29b-41d4-a716-446655440002';
    const ytdStart = new Date('2026-01-01T00:00:00Z');
    const scottLbCheck = await client.query(`SELECT 1 FROM leaderboard_entries WHERE user_id = $1 AND period = 'annual'`, [scottId]);
    if (scottLbCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO leaderboard_entries (user_id, period, period_start, wins, losses, roi, profit, streak, rank, updated_at)
        VALUES ($1, 'annual', $2, 98, 84, 8.4, 14, 2, 2, NOW())
      `, [scottId, ytdStart]);
      console.log("[migration] Seeded Scott leaderboard entry");
    }
    const moeLbCheck = await client.query(`SELECT 1 FROM leaderboard_entries WHERE user_id = $1 AND period = 'annual'`, [moeId]);
    if (moeLbCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO leaderboard_entries (user_id, period, period_start, wins, losses, roi, profit, streak, rank, updated_at)
        VALUES ($1, 'annual', $2, 87, 76, 6.9, 11, 1, 3, NOW())
      `, [moeId, ytdStart]);
      console.log("[migration] Seeded Moe leaderboard entry");
    }

    // Ensure Nikco's annual leaderboard entry exists (all-sports YTD from graded picks).
    // Do NOT override if live data is higher — refreshAnnualLeaderboard() keeps this current.
    const nikLbCheck = await client.query(`SELECT wins, losses FROM leaderboard_entries WHERE user_id = $1 AND period = 'annual'`, [NIK_ID]);
    if (nikLbCheck.rowCount === 0) {
      // First boot: seed with known NBA historical baseline (173W-139L = seeded NBA picks)
      await client.query(`
        INSERT INTO leaderboard_entries (user_id, period, period_start, wins, losses, roi, profit, streak, rank, updated_at)
        VALUES ($1, 'annual', $2, 173, 139, 55.4, 37, 5, 1, NOW())
      `, [NIK_ID, ytdStart]);
      console.log("[migration] Nikco annual leaderboard baseline seeded (173W-139L NBA historical)");
    } else {
      console.log(`[migration] Nikco annual leaderboard = ${nikLbCheck.rows[0].wins}W-${nikLbCheck.rows[0].losses}L (live data kept)`);
    }
    // NOTE: Daily leaderboard for Nikco is computed live from today's picks — do NOT hardcode it here.

    // Seed referrals: Nikco referred Scott, Moe, Ian (all active Legend members)
    // Look up by phone so we get the real production UUID regardless of insert order
    const refCheck = await client.query(`SELECT 1 FROM referrals WHERE referrer_id = $1 LIMIT 1`, [NIK_ID]);
    if (refCheck.rowCount === 0) {
      const memberPhones = ['8182314634', '2138724448', '3107367905'];
      for (const phone of memberPhones) {
        const userRow = await client.query(`SELECT id FROM users WHERE phone = $1 LIMIT 1`, [phone]);
        if (userRow.rowCount === 0) continue;
        const referredId = userRow.rows[0].id;
        await client.query(`
          INSERT INTO referrals (referrer_id, referred_id, status, signup_bonus, prediction_bonus, created_at)
          VALUES ($1, $2, 'active', 0, 0, '2026-01-01T00:00:00Z')
          ON CONFLICT DO NOTHING
        `, [NIK_ID, referredId]);
        await client.query(`
          UPDATE users SET referred_by = 'NIKCOX' WHERE id = $1 AND (referred_by IS NULL OR referred_by = '')
        `, [referredId]);
      }
      console.log("[migration] Seeded 3 referrals (Scott, Moe, Ian → Nikco)");
    }

    // Seed BMW as a default advertiser (banner placement) — restore if removed
    const bmwCheck = await client.query(`SELECT 1 FROM advertisers WHERE company_name = 'BMW' LIMIT 1`);
    if (bmwCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO advertisers (company_name, logo_url, tagline, website_url, placement, annual_fee, active)
        VALUES ('BMW', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/BMW.svg/1200px-BMW.svg.png',
                'The Ultimate Driving Machine', 'https://bmwusa.com', 'banner', 1200000, true)
      `);
      console.log("[migration] BMW advertiser seeded");
    }

    // CLEANUP: Remove any fake/demo accounts — placeholder phones OR demo names seeded earlier
    const fakeUsersResult = await client.query(`
      SELECT id FROM users WHERE
        phone IN ('0000000001', '0000000002')
        OR first_name IN ('OverUnder','Spread','Parlay','MoneyLine','Net','Gridiron','CourtSide','Sniper','BetKing','ProPicks')
        OR (DATE(created_at) = '2026-03-15' AND id != '29b670b7-5296-44dc-a0a0-aec0d878ef9b')
    `);
    for (const row of fakeUsersResult.rows) {
      const fakeId = row.id;
      // Delete all replies to threads owned by this fake user (FK: thread_replies.thread_id → threads.id)
      await client.query(`DELETE FROM thread_replies WHERE thread_id IN (SELECT id FROM threads WHERE user_id = $1)`, [fakeId]);
      // Delete replies posted by this fake user on other threads
      await client.query(`DELETE FROM thread_replies WHERE user_id = $1`, [fakeId]);
      await client.query(`DELETE FROM threads WHERE user_id = $1`, [fakeId]);
      await client.query(`DELETE FROM predictions WHERE user_id = $1`, [fakeId]);
      await client.query(`DELETE FROM leaderboard_entries WHERE user_id = $1`, [fakeId]);
      await client.query(`DELETE FROM prize_pool_contributions WHERE user_id = $1`, [fakeId]);
      await client.query(`DELETE FROM chat_messages WHERE user_id = $1`, [fakeId]);
      await client.query(`DELETE FROM payouts WHERE user_id = $1`, [fakeId]);
      await client.query(`DELETE FROM referrals WHERE referrer_id = $1 OR referred_id = $1`, [fakeId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [fakeId]);
      console.log(`[migration] Removed fake/demo account: ${fakeId}`);
    }
    if (fakeUsersResult.rows.length > 0) {
      console.log(`[migration] Removed ${fakeUsersResult.rows.length} fake/demo account(s)`);
    }

    // CLEANUP: Remove fake prize pool contributions (the estimated $347/$102 amounts we fabricated)
    await client.query(
      `DELETE FROM prize_pool_contributions WHERE amount IN (347, 102) AND source = 'subscription' AND created_at = '2026-01-15T00:00:00Z'`
    );
    console.log("[migration] Cleaned up any fake prize pool contributions");

    // RESTORE: Real prize pool balance from PayPal payments lost during DB migration
    // $83 confirmed by founder — real PayPal subscription fees paid by real members
    // This is a one-time restoration marker so webhooks don't double-count going forward
    const ppRestoreCheck = await client.query(
      `SELECT 1 FROM prize_pool_contributions WHERE source = 'migration_restore'`
    );
    if (ppRestoreCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO prize_pool_contributions (amount, source, user_id, created_at)
        VALUES (68, 'migration_restore', '29b670b7-5296-44dc-a0a0-aec0d878ef9b', '2026-04-19T00:00:00Z')
      `);
      console.log("[migration] Restored $68 prize pool balance from real PayPal payments");
    }

    // GUARANTEE minimum pool balance — the founder sets this after each manual payout.
    // If the pool ever drops below $125 on a restart (e.g. admin_adjust rows lost),
    // this top-up row brings it back. It never fires if the pool has grown past $125 organically.
    const POOL_FLOOR = 125;
    const poolTotalRes = await client.query(
      `SELECT COALESCE(SUM(amount::numeric), 0) AS total FROM prize_pool_contributions`
    );
    const poolTotal = Number(poolTotalRes.rows?.[0]?.total ?? 0);
    if (poolTotal < POOL_FLOOR) {
      const topUp = POOL_FLOOR - poolTotal;
      await client.query(`
        INSERT INTO prize_pool_contributions (amount, source, user_id, created_at)
        VALUES ($1, 'admin_floor', NULL, NOW())
      `, [topUp]);
      console.log(`[migration] Prize pool floor top-up: +$${topUp} → $${POOL_FLOOR}`);
    }

    // CLEANUP: Remove seeded historical games that landed in the last 14 days.
    // These are identified by created_at = game_time (the seed always sets them equal).
    // Real ESPN-synced games have created_at = NOW() at time of sync, which differs from game_time.
    // Contaminating seeded games cause double-counting in the prize-pool scorecard.
    const seededInWindow = await client.query(`
      SELECT id FROM games
      WHERE created_at = game_time
        AND game_time >= NOW() - INTERVAL '14 days'
        AND status = 'final'
    `);
    if (seededInWindow.rowCount && seededInWindow.rowCount > 0) {
      const seededIds = seededInWindow.rows.map((r: any) => r.id);
      await client.query(
        `DELETE FROM predictions WHERE game_id = ANY($1::int[])`,
        [seededIds]
      );
      await client.query(
        `DELETE FROM games WHERE id = ANY($1::int[])`,
        [seededIds]
      );
      console.log(`[migration] Removed ${seededIds.length} contaminating seeded game(s) from the last 14 days`);
    }

    // PAYOUT CORRECTION: If yesterday's daily payout only has 1 pending/wallet_credited winner,
    // delete and allow re-run. Never touch paypal_sent records — those are confirmed real payments.
    try {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const pstStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(yesterday);
      const existingPayouts = await client.query(
        `SELECT id, user_id, status FROM payouts WHERE period = 'daily' AND period_label = $1`,
        [pstStr]
      );
      if (existingPayouts.rowCount === 1) {
        const payoutStatus = existingPayouts.rows[0].status;
        // Only clear unsent payouts — if it's already paypal_sent it was actually paid, never delete it
        if (payoutStatus !== 'paypal_sent') {
          await client.query(
            `DELETE FROM payouts WHERE period = 'daily' AND period_label = $1 AND status != 'paypal_sent'`,
            [pstStr]
          );
          console.log(`[migration] Cleared 1-winner pending payout for ${pstStr} to allow correct re-calculation`);
        } else {
          console.log(`[migration] Keeping confirmed paypal_sent payout for ${pstStr} — already paid`);
        }
      }
    } catch (payoutErr: any) {
      console.log(`[migration] Payout correction check skipped: ${payoutErr.message}`);
    }

  } catch (err: any) {
    console.error("[migration] Startup migration error:", err.message);
    throw err;
  } finally {
    client.release();
  }
}
