# BetFans - Sports Prediction Platform

## Overview
BetFans is a membership-based sports prediction platform (Rookie $19/mo, Pro $29/mo, Legend $99/mo) featuring Spider AI picks, community chat, leaderboards, a 50% revenue prize pool, residual affiliate income, and a merch store. Live at betfans.us.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, TanStack Query, Wouter, shadcn/ui, Tailwind CSS, Recharts
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM (Neon)
- **Auth**: Phone number + password (bcryptjs, express-session with PostgreSQL store)
- **Payments**: PayPal Subscriptions (replaces Stripe) — Client ID + Secret + 3 plan IDs all configured
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
- `server/routes.ts` - All API routes (webhook route BEFORE express.json())
- `server/stripeClient.ts` - Stripe client using STRIPE_SECRET_KEY env var
- `server/stripeService.ts` - Stripe business logic (checkout, portal, customer)
- `server/webhookHandlers.ts` - Stripe webhook processing + subscription lifecycle
- `server/storage.ts` - Database storage interface with Drizzle queries
- `server/replit_integrations/auth/` - Auth module: phone+password signup/login (replitAuth.ts, storage.ts, routes.ts, index.ts)
- `client/src/pages/auth.tsx` - Login/Signup page (phone + password)
- `client/src/hooks/use-auth.ts` - Client auth hook
- `scripts/seed-products.ts` - Script to create Stripe products (already run, products exist)

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
- `POST /api/stripe/checkout` - Create Stripe checkout session (auth required)
- `POST /api/stripe/portal` - Create Stripe customer portal (auth required)
- `GET /api/stripe/products` - List products with prices from stripe schema
- `GET /api/stripe/subscription` - User's subscription status (auth required)
- `POST /api/stripe/webhook` - Stripe webhook (raw body, before express.json)
- `GET /api/auth/user` - Current user info (auth required)
- `GET /api/login` - Initiate OIDC login
- `GET /api/callback` - OIDC callback
- `GET /api/logout` - Logout

### Advertising System
- `advertisers` table: company name, logo URL, tagline, website, placement, annual fee, impressions/clicks tracking
- Placements: hero (top banner), banner (inline), sidebar, marquee (scrolling ticker)
- Admin panel at `/advertising` for managing partners
- Ad components: `AdBannerTop`, `AdBannerInline`, `AdSidebar`, `AdMarquee` in `client/src/components/AdBanner.tsx`
- Impression/click tracking via `/api/ads/:id/impression` and `/api/ads/:id/click`
- Default annual fee: $100,000 per placement

### Stripe Products (Seeded)
- BetFans Rookie: $19/month (price_1TBNTPBN1rLreuOWjB1mvEk8), $190/year
- BetFans Pro: $29/month (price_1TB3bZBN1rLreuOWFHlQfwO2), $290/year
- BetFans Legend: $99/month (price_1TB3baBN1rLreuOWhpmGLLR1), $990/year

### Tier Access Controls
- **Rookie ($19/mo)**: Basic stats, leaderboard, community forum. Cannot view other members' daily picks.
- **Pro ($29/mo)**: All Rookie features + Spider AI picks, prize pool eligibility, view other members' daily picks, analytics, Pro badge.
- **Legend ($99/mo)**: All Pro features + double prize pool entries, coaching, Legend badge.

### Prize Pool & Payouts
- Prize pool starts at $0 and grows in real time as members pay
- 50% of every membership payment → `prize_pool_contributions` table
- Webhook (`invoice.payment_succeeded`) auto-records contributions
- API: `GET /api/prize-pool` returns `{ amount, daily, weekly, monthly, annual }` (live totals)
- Payout splits: Daily 5% (top 3), Weekly 10% (top 5), Monthly 35% (top 5), Annual 50% (top 10)
- Admin processes payouts via `POST /api/payouts/process` with `{ period }` body
- Payouts credit winners via Stripe to their signup card/payment method
- `payouts` table tracks: userId, amount, period, rank, sharePercent, status, stripeTransferId
- Payout history: `GET /api/payouts/history`, user's own: `GET /api/payouts`
- Winners page at `/winners` with live trackers and countdown timers

### Merch Dropship Store
- `merch_orders` table: tracks all merch orders with wholesale vs retail pricing, shipping info, fulfillment status
- Wholesale catalog in `server/routes.ts` (`MERCH_CATALOG`) maps product IDs to wholesale prices and dropship SKUs
- **Checkout flow**: Cart → Shipping form → Stripe one-time payment → Order recorded with profit margin
- **Profit model**: Platform charges retail price, dropshipper gets wholesale cost, platform keeps the differential
- **Fulfillment**: Admin can forward orders to dropshipper via `POST /api/merch/admin/forward-to-dropshipper`
- **Admin routes**: `GET /api/merch/admin/orders` (all orders + per-order margin %), `GET /api/merch/admin/profit-margins` (full profit breakdown by product/month), `PATCH /api/merch/admin/orders/:id/fulfill` (update tracking), `GET /api/merch/admin/fulfillment-status` (CJ/Printify connection status)
- **User routes**: `POST /api/merch/checkout`, `GET /api/merch/orders`, `GET /api/merch/order-status?session_id=`
- Order success page at `/merch/order-success?session_id=`
- Dropship integration point: `POST /api/merch/admin/forward-to-dropshipper` logs payload for external API hookup

### Affiliate & Residual Income (Combined)
- Single page at `/referrals` with tabbed UI: "My Affiliate" tab and "Leaderboard" tab
- `/residual-income` redirects to `/referrals` for backward compatibility
- Affiliate tab: share link/code, social share buttons, income stats, milestones, member list, apply code
- Leaderboard tab: top 10 earners, Founder vs Affiliates callout, monthly/yearly projections
- Contact: nikcox@betfans.us shown in footer, merch checkout, order success, membership pages

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Express session secret
- `STRIPE_SECRET_KEY` - Stripe API secret key (from connector)
- `STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (from connector)

### Important Notes
- Stripe webhook route must be registered BEFORE `express.json()` middleware
- Session user shape includes `{ claims: { sub: userId }, ...userFields }`
- `stripe-replit-sync` manages the `stripe` schema automatically - never create tables in it
- App runs on port 5000
