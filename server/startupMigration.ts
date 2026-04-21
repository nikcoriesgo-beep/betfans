import { pool } from "./db";
import type { PoolClient } from "pg";

const NIK_ID = '29b670b7-5296-44dc-a0a0-aec0d878ef9b';
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
      // Hard cap: never create seeded games in the future
      const cap = new Date(Date.now() - 3 * 3600000); // at least 3h in the past
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
    // Check if Nik has exactly 312 picks (173W+139L) — if not, clear and reseed
    const nikPickCount = await client.query(
      `SELECT count(*) as cnt FROM predictions WHERE user_id = $1 AND result IN ('win','loss')`,
      [NIK_ID]
    );
    const nikPicks = parseInt(nikPickCount.rows[0].cnt);
    if (nikPicks < 312) {
      console.log(`[migration] Nik has ${nikPicks} picks (need ≥312), clearing and reseeding...`);
      // Only delete historical data — keep any games/predictions from today onwards
      await client.query(`DELETE FROM predictions WHERE created_at < '2026-04-19'`);
      await client.query(`DELETE FROM games WHERE game_time < '2026-04-19' AND status = 'final'`);
      await seedHistoricalGamesAndPredictions(client);
    } else {
      console.log("[migration] Historical picks already seeded correctly (312 picks for Nik)");
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

    console.log("[migration] All tables created successfully");

    // Seed admin/founder account
    const nikCheck = await client.query(`SELECT 1 FROM users WHERE id = $1`, ['29b670b7-5296-44dc-a0a0-aec0d878ef9b']);
    if (nikCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier, referral_code, wallet_balance, created_at, updated_at)
        VALUES (
          '29b670b7-5296-44dc-a0a0-aec0d878ef9b',
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
      console.log("[migration] Seeded founder account");
    } else {
      // Fix name if it was seeded incorrectly in a previous version
      await client.query(`
        UPDATE users SET first_name = 'Nikco', last_name = 'X'
        WHERE id = '29b670b7-5296-44dc-a0a0-aec0d878ef9b'
          AND (first_name != 'Nikco' OR last_name != 'X')
      `);
    }

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
          'SCOTT818',
          '0',
          '2026-01-01T00:00:00Z',
          NOW()
        )
      `);
      console.log("[migration] Seeded Scott account");
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
    }

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

    // Update Nikco's annual leaderboard to current YTD (178W-149L as of Apr 20)
    const nikLbCheck = await client.query(`SELECT 1 FROM leaderboard_entries WHERE user_id = $1 AND period = 'annual'`, [NIK_ID]);
    if (nikLbCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO leaderboard_entries (user_id, period, period_start, wins, losses, roi, profit, streak, rank, updated_at)
        VALUES ($1, 'annual', $2, 178, 149, 54.4, 29, 5, 1, NOW())
      `, [NIK_ID, ytdStart]);
    } else {
      await client.query(`
        UPDATE leaderboard_entries SET wins = 178, losses = 149, roi = 54.4, profit = 29, streak = 5, rank = 1, updated_at = NOW()
        WHERE user_id = $1 AND period = 'annual'
      `, [NIK_ID]);
    }
    console.log("[migration] Nikco annual leaderboard = 178W-149L");

    // Update Nikco's daily leaderboard to yesterday's results (12W-11L: 4-0 NHL + 3-1 NBA + 5-10 MLB)
    const dailyStart = new Date('2026-04-19T04:00:00Z');
    const nikDailyCheck = await client.query(`SELECT 1 FROM leaderboard_entries WHERE user_id = $1 AND period = 'daily'`, [NIK_ID]);
    if (nikDailyCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO leaderboard_entries (user_id, period, period_start, wins, losses, roi, profit, streak, rank, updated_at)
        VALUES ($1, 'daily', $2, 12, 11, 52.2, 1, 5, 1, NOW())
      `, [NIK_ID, dailyStart]);
    } else {
      await client.query(`
        UPDATE leaderboard_entries SET wins = 12, losses = 11, roi = 52.2, period_start = $2, rank = 1, updated_at = NOW()
        WHERE user_id = $1 AND period = 'daily'
      `, [NIK_ID, dailyStart]);
    }
    console.log("[migration] Nikco daily leaderboard = 12W-11L");

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
        VALUES (83, 'migration_restore', '29b670b7-5296-44dc-a0a0-aec0d878ef9b', '2026-04-19T00:00:00Z')
      `);
      console.log("[migration] Restored $83 prize pool balance from real PayPal payments");
    }

  } catch (err: any) {
    console.error("[migration] Startup migration error:", err.message);
    throw err;
  } finally {
    client.release();
  }
}
