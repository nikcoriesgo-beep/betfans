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
      const date = new Date(startDate.getTime() + i * 82800000); // spread ~23h apart
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

  // Nik: 173W-139L YTD (NBA Jan 1 - Apr 18)
  await seedUserPicks(NIK_ID, 'NBA', 173, 139, new Date('2026-01-01T22:30:00Z'), NBA_MATCHUPS);

  // Scott: 98W-84L YTD (NBA Jan 1 - Mar 15)
  await seedUserPicks(SCOTT_ID, 'NBA', 98, 84, new Date('2026-01-01T21:00:00Z'), NBA_MATCHUPS);

  // Moe: 87W-76L YTD (NBA Jan 1 - Mar 10)
  await seedUserPicks(MOE_ID, 'NBA', 87, 76, new Date('2026-01-01T20:00:00Z'), NBA_MATCHUPS);

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
    const nikPickCount = await client.query(
      `SELECT count(*) as cnt FROM predictions WHERE user_id = $1 AND result IN ('win','loss')`,
      [NIK_ID]
    );
    const nikPicks = parseInt(nikPickCount.rows[0].cnt);
    if (nikPicks !== 312) {
      console.log(`[migration] Nik has ${nikPicks} picks (need 312), clearing and reseeding...`);
      await client.query(`DELETE FROM predictions WHERE created_at < '2026-04-19'`);
      await client.query(`DELETE FROM games WHERE game_time < '2026-04-19' AND status = 'final'`);
      await seedHistoricalGamesAndPredictions(client);
    } else {
      console.log("[migration] Historical data already seeded correctly (312 picks)");
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
          'Nik',
          'Cox',
          'legend',
          'NIKCOX',
          '0',
          '2026-01-01T00:00:00Z',
          NOW()
        )
      `);
      console.log("[migration] Seeded founder account");
    }

    // Seed Scott's account (Pro member) — temp password: BetFans2024!
    const scottCheck = await client.query(`SELECT 1 FROM users WHERE id = $1`, ['61a80e5c-4c0c-484a-87a7-7c1ae92c0991']);
    if (scottCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier, referral_code, wallet_balance, created_at, updated_at)
        VALUES (
          '61a80e5c-4c0c-484a-87a7-7c1ae92c0991',
          '0000000001',
          '$2b$10$c/Wpwe4dfQebNTYaHGja3edrkQESNeamelffoP77hnjRTSGd.setG',
          'Scott',
          '',
          'pro',
          'SCOTT1',
          '0',
          '2026-01-01T00:00:00Z',
          NOW()
        )
      `);
      console.log("[migration] Seeded Scott account");
    }

    // Seed Moe's account (Pro member) — temp password: BetFans2024!
    const moeCheck = await client.query(`SELECT 1 FROM users WHERE id = $1`, ['827bf2c0-df36-4045-b2bf-5650e9aa02a4']);
    if (moeCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO users (id, phone, password_hash, first_name, last_name, membership_tier, referral_code, wallet_balance, created_at, updated_at)
        VALUES (
          '827bf2c0-df36-4045-b2bf-5650e9aa02a4',
          '0000000002',
          '$2b$10$c/Wpwe4dfQebNTYaHGja3edrkQESNeamelffoP77hnjRTSGd.setG',
          'Moe',
          '',
          'pro',
          'MOE1',
          '0',
          '2026-01-01T00:00:00Z',
          NOW()
        )
      `);
      console.log("[migration] Seeded Moe account");
    }

    // Seed YTD leaderboard entries (2026 annual — 173W-139L through Apr 18)
    const lbCheck = await client.query(`SELECT 1 FROM leaderboard_entries WHERE period = $1 AND user_id = $2`, ['annual', '29b670b7-5296-44dc-a0a0-aec0d878ef9b']);
    if (lbCheck.rowCount === 0) {
      const ytdStart = new Date('2026-01-01T00:00:00Z');
      // Nikco YTD
      await client.query(`
        INSERT INTO leaderboard_entries (user_id, period, period_start, wins, losses, roi, profit, streak, rank, updated_at)
        VALUES ('29b670b7-5296-44dc-a0a0-aec0d878ef9b', 'annual', $1, 173, 139, 11.2, 34, 5, 1, NOW())
      `, [ytdStart]);
      // Scott YTD (estimated)
      await client.query(`
        INSERT INTO leaderboard_entries (user_id, period, period_start, wins, losses, roi, profit, streak, rank, updated_at)
        VALUES ('61a80e5c-4c0c-484a-87a7-7c1ae92c0991', 'annual', $1, 98, 84, 8.4, 14, 2, 2, NOW())
      `, [ytdStart]);
      // Moe YTD (estimated)
      await client.query(`
        INSERT INTO leaderboard_entries (user_id, period, period_start, wins, losses, roi, profit, streak, rank, updated_at)
        VALUES ('827bf2c0-df36-4045-b2bf-5650e9aa02a4', 'annual', $1, 87, 76, 6.9, 11, 1, 3, NOW())
      `, [ytdStart]);
      console.log("[migration] Seeded YTD leaderboard entries");
    }

    // Seed prize pool contributions for the year (3 subscribers since Jan 1)
    const ppCheck = await client.query(`SELECT count(*) as cnt FROM prize_pool_contributions`);
    if (parseInt(ppCheck.rows[0].cnt) === 0) {
      // Nikco Legend $99 x 3.5 months + Scott/Moe Pro $29 x 3.5 months each
      // 10% goes to prize pool daily — seeding as a lump historical contribution
      await client.query(`
        INSERT INTO prize_pool_contributions (amount, source, user_id, created_at)
        VALUES (347, 'subscription', '29b670b7-5296-44dc-a0a0-aec0d878ef9b', '2026-01-15T00:00:00Z')
      `);
      await client.query(`
        INSERT INTO prize_pool_contributions (amount, source, user_id, created_at)
        VALUES (102, 'subscription', '61a80e5c-4c0c-484a-87a7-7c1ae92c0991', '2026-01-15T00:00:00Z')
      `);
      await client.query(`
        INSERT INTO prize_pool_contributions (amount, source, user_id, created_at)
        VALUES (102, 'subscription', '827bf2c0-df36-4045-b2bf-5650e9aa02a4', '2026-01-15T00:00:00Z')
      `);
      console.log("[migration] Seeded historical prize pool contributions");
    }

  } catch (err: any) {
    console.error("[migration] Startup migration error:", err.message);
    throw err;
  } finally {
    client.release();
  }
}
