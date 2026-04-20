# BetFans - Sports Prediction Platform

## Overview
BetFans is a membership-based sports prediction platform (Rookie $19/mo, Pro $29/mo, Legend $99/mo) featuring Spider AI picks, community chat, leaderboards, a 50% revenue prize pool, residual affiliate income, and a merch store. Live at betfans.us.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, TanStack Query, Wouter, shadcn/ui, Tailwind CSS, Recharts
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM (Render PostgreSQL — free tier, Oregon region, DB ID: dpg-d7inoo1kh4rs73b42b10-a)
- **Auth**: Phone number + password (bcryptjs, express-session with PostgreSQL store)
- **Payments**: PayPal Subscriptions — Client ID + Secret + 3 plan IDs all configured
- **Real-time**: WebSocket for community chat

## PayPal Plan IDs (Live)
- **Rookie** ($19/mo): `P-2JC35064SX962914CNHBT3JA`
- **Pro** ($29/mo): `P-7AJ93147MR053834ANHBT2KY`
- **Legend** ($99/mo): `P-9BK78886HT3554003NHBTV2Q`

## Design
- "Dark Future" aesthetic: deep navy background + electric green primary (`142 70% 50%`)
- Chakra Petch display font + Inter body font
- Glass-morphism cards with backdrop blur

## Architecture

### Key Files
- `shared/schema.ts` - Database schema (users, games, predictions, chatMessages, transactions, leaderboardEntries)
- `shared/models/auth.ts` - Auth-specific user types re-exported through schema
- `server/routes.ts` - All API routes
- `server/paypalService.ts` - PayPal business logic (subscription verification, plan lookup)
- `server/storage.ts` - Database storage interface with Drizzle queries
- `server/replit_integrations/auth/` - Auth module: phone+password signup/login (replitAuth.ts, storage.ts, routes.ts, index.ts)
- `client/src/pages/auth.tsx` - Login/Signup page (phone + password + optional email)
- `client/src/hooks/use-auth.ts` - Client auth hook
- `client/src/components/PayPalSubscribeButton.tsx` - PayPal subscription button component

### API Endpoints
- `GET /api/games` - List games (optional `?league=` filter)
- `GET /api/games/:id` - Single game details
- `POST /api/predictions` - Place prediction (auth required)
- `GET /api/predictions` - User predictions (auth required)
- `GET /api/stats` - User stats (auth required)
- `GET /api/leaderboard` - Leaderboard (`?period=daily|weekly|monthly|annual`)
- `GET /api/chat/:channel` - Chat messages
- `POST /api/chat` - Send message (auth required)
- `GET /api/transactions` - User transactions (auth required)
- `GET /api/prize-pool` - Prize pool amount
- `GET /api/paypal/config` - PayPal client ID + plan IDs for frontend
- `POST /api/paypal/subscription` - Verify and activate subscription after payment
- `POST /api/paypal/webhook` - PayPal webhook (subscription activated/cancelled)
- `GET /api/auth/user` - Current user info (auth required)
- `POST /api/auth/signup` - Create account (phone + password + optional email)
- `POST /api/auth/login` - Login
- `GET /api/logout` - Logout

### Advertising System
- `advertisers` table: company name, logo URL, tagline, website, placement, annual fee, impressions/clicks tracking
- Placements: hero (top banner), banner (inline), sidebar, marquee (scrolling ticker)
- Admin panel at `/advertising` for managing partners
- Ad components: `AdBannerTop`, `AdBannerInline`, `AdSidebar`, `AdMarquee` in `client/src/components/AdBanner.tsx`
- Impression/click tracking via `/api/ads/:id/impression` and `/api/ads/:id/click`
- Default annual fee: $100,000 per placement

### Tier Access Controls
- **Free**: Account created, no access — must pay before using the platform
- **Rookie ($19/mo)**: Basic stats, leaderboard, community forum. Cannot view other members' daily picks.
- **Pro ($29/mo)**: All Rookie features + Spider AI picks, prize pool eligibility, view other members' daily picks, analytics, Pro badge.
- **Legend ($99/mo)**: All Pro features + double prize pool entries, coaching, Legend badge.
- **Founder (NIKCOX / DAMON822)**: Full Legend access, permanently exempt from payment gate.

### Pay-Before-Play Gate
- All new signups start at `membershipTier: "free"` — no access until a PayPal subscription is confirmed
- `PaymentGate` component in `client/src/App.tsx` redirects unpaid users to `/membership`
- Exempt pages: `/`, `/auth`, `/membership`
- Exempt accounts: referralCode `"NIKCOX"` or `"DAMON822"` (founder)
- PayPal webhook + `/api/paypal/subscription` endpoint activate the correct tier on payment

### Prize Pool & Payouts
- Prize pool starts at $0 and grows in real time as members pay
- 50% of every membership payment → `prize_pool_contributions` table
- PayPal webhook auto-records contributions on `BILLING.SUBSCRIPTION.ACTIVATED` / `BILLING.SUBSCRIPTION.RENEWED`
- API: `GET /api/prize-pool` returns `{ amount, daily, weekly, monthly, annual }` (live totals)
- Payout splits: Daily 5% (top 3), Weekly 10% (top 5), Monthly 35% (top 5), Annual 50% (top 10)
- Admin processes payouts via `POST /api/payouts/process` with `{ period }` body
- Payouts credited to winners via PayPal
- `payouts` table tracks: userId, amount, period, rank, sharePercent, status
- Payout history: `GET /api/payouts/history`, user's own: `GET /api/payouts`
- Winners page at `/winners` with live trackers and countdown timers

### Merch Dropship Store
- `merch_orders` table: tracks all merch orders with wholesale vs retail pricing, shipping info, fulfillment status
- Wholesale catalog in `server/routes.ts` (`MERCH_CATALOG`) maps product IDs to wholesale prices and dropship SKUs
- **Checkout flow**: Cart → Shipping form → PayPal payment → Order recorded with profit margin
- **Profit model**: Platform charges retail price, dropshipper gets wholesale cost, platform keeps the differential
- **Fulfillment**: Admin can forward orders to dropshipper via `POST /api/merch/admin/forward-to-dropshipper`
- **Admin routes**: `GET /api/merch/admin/orders`, `GET /api/merch/admin/profit-margins`, `PATCH /api/merch/admin/orders/:id/fulfill`, `GET /api/merch/admin/fulfillment-status`
- **User routes**: `POST /api/merch/checkout`, `GET /api/merch/orders`, `GET /api/merch/order-status?session_id=`
- Order success page at `/merch/order-success?session_id=`

### Affiliate & Residual Income (Combined)
- Single page at `/referrals` with tabbed UI: "My Affiliate" tab and "Leaderboard" tab
- `/residual-income` redirects to `/referrals` for backward compatibility
- Affiliate tab: share link/code, social share buttons, income stats, milestones, member list, apply code
- Leaderboard tab: top 10 earners, Founder vs Affiliates callout, monthly/yearly projections
- Contact: nikcox@betfans.us shown in footer, merch checkout, order success, membership pages

### Founder Account
- Founder email: `nikcox@betfans.us`
- Signup with that email auto-assigns referralCode `NIKCOX`, membershipTier `legend`, referredBy `null`
- Current DB account: phone `2482757932`, referralCode `DAMON822`, tier `legend` (also founder-exempt)
- To activate Baseball Breakfast admin tools: sign up at betfans.us with email `nikcox@betfans.us`

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string (Neon)
- `SESSION_SECRET` - Express session secret
- `PAYPAL_CLIENT_ID` - PayPal app client ID
- `PAYPAL_CLIENT_SECRET` - PayPal app client secret
- `PAYPAL_PLAN_ROOKIE` - PayPal plan ID for Rookie tier
- `PAYPAL_PLAN_PRO` - PayPal plan ID for Pro tier
- `PAYPAL_PLAN_LEGEND` - PayPal plan ID for Legend tier

### Music
- Track: **"Baseball For Breakfast"** — locked in for the 2025/26 season, do not replace until next season
- File: `client/public/audio/baseball-for-breakfast.mp3` (also at `dist/public/audio/`)
- DB: `music_tracks` table, id=1, `suno_id = "local:audio/baseball-for-breakfast.mp3"`, active=true
- Player auto-starts muted; unmutes on first user interaction (tap/click/scroll)

### Important Notes
- App runs on port 5000
- Session user shape includes `{ claims: { sub: userId }, ...userFields }`
- All payment processing is exclusively through PayPal Subscriptions
- Baseball Breakfast page (`/baseball-breakfast`) is founder-only: pick daily winners, set Spider AI pick
- **CRITICAL**: Dev DB = local Replit postgres (`helium` hostname). Prod DB = Neon. When setting Render env vars, always use the Neon DATABASE_URL, NOT the Replit postgres URL. Previous bug: Render had `postgresql://postgres:password@helium/heliumdb?sslmode=disable` which caused all DB-dependent endpoints to fail with 500.
