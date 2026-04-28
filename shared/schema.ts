export * from "./models/auth";

import { pgTable, text, integer, boolean, timestamp, real, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  gameId: integer("game_id").notNull().references(() => games.id),
  predictionType: text("prediction_type").notNull(),
  pick: text("pick").notNull(),
  units: real("units").notNull().default(1),
  odds: text("odds"),
  result: text("result").default("pending"),
  payout: real("payout").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  league: text("league").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  gameTime: timestamp("game_time").notNull(),
  status: text("status").default("upcoming"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  spread: text("spread"),
  total: text("total"),
  moneylineHome: text("moneyline_home"),
  moneylineAway: text("moneyline_away"),
  spiderPick: text("spider_pick"),
  spiderConfidence: integer("spider_confidence"),
  isProLocked: boolean("is_pro_locked").default(false),
  homePitcher: text("home_pitcher"),
  awayPitcher: text("away_pitcher"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  channel: text("channel").notNull().default("general"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  description: text("description"),
  status: text("status").default("completed"),
  stripePaymentId: text("stripe_payment_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leaderboardEntries = pgTable("leaderboard_entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  period: text("period").notNull(),
  periodStart: timestamp("period_start").notNull(),
  rank: integer("rank"),
  wins: integer("wins").default(0),
  losses: integer("losses").default(0),
  roi: real("roi").default(0),
  profit: real("profit").default(0),
  streak: integer("streak").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const musicTracks = pgTable("music_tracks", {
  id: serial("id").primaryKey(),
  sunoId: text("suno_id").notNull(),
  title: text("title").notNull(),
  scheduleDate: text("schedule_date"),
  active: boolean("active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const threads = pgTable("threads", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  profileUserId: text("profile_user_id").references(() => users.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").default("general"),
  pinned: boolean("pinned").default(false),
  replyCount: integer("reply_count").default(0),
  lastReplyAt: timestamp("last_reply_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const threadReplies = pgTable("thread_replies", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => threads.id),
  userId: text("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  likes: integer("likes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  amount: real("amount").notNull(),
  period: text("period").notNull(),
  periodLabel: text("period_label").notNull(),
  rank: integer("rank").notNull(),
  sharePercent: real("share_percent").notNull(),
  stripePayoutId: text("stripe_payout_id"),
  stripeTransferId: text("stripe_transfer_id"),
  status: text("status").default("pending"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  wins: integer("wins"),
  losses: integer("losses"),
});

export type Payout = typeof payouts.$inferSelect;

export const prizePoolContributions = pgTable("prize_pool_contributions", {
  id: serial("id").primaryKey(),
  amount: real("amount").notNull(),
  source: text("source").notNull().default("subscription"),
  stripePaymentId: text("stripe_payment_id"),
  userId: text("user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const advertisers = pgTable("advertisers", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  logoUrl: text("logo_url").notNull(),
  tagline: text("tagline"),
  websiteUrl: text("website_url"),
  placement: text("placement").notNull().default("banner"),
  annualFee: integer("annual_fee").notNull().default(100000),
  active: boolean("active").default(true),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdvertiserSchema = createInsertSchema(advertisers).omit({ id: true, createdAt: true, impressions: true, clicks: true });

export const insertThreadSchema = createInsertSchema(threads).omit({ id: true, createdAt: true, replyCount: true, lastReplyAt: true, pinned: true });
export const insertThreadReplySchema = createInsertSchema(threadReplies).omit({ id: true, createdAt: true, likes: true });

export const insertMusicTrackSchema = createInsertSchema(musicTracks).omit({ id: true, createdAt: true });

export const insertPredictionSchema = createInsertSchema(predictions).omit({ id: true, createdAt: true });
export const insertGameSchema = createInsertSchema(games).omit({ id: true, createdAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type Prediction = typeof predictions.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type LeaderboardEntry = typeof leaderboardEntries.$inferSelect;
export type MusicTrack = typeof musicTracks.$inferSelect;
export type InsertMusicTrack = z.infer<typeof insertMusicTrackSchema>;
export type Thread = typeof threads.$inferSelect;
export type InsertThread = z.infer<typeof insertThreadSchema>;
export type ThreadReply = typeof threadReplies.$inferSelect;
export type InsertThreadReply = z.infer<typeof insertThreadReplySchema>;
export type Advertiser = typeof advertisers.$inferSelect;
export type InsertAdvertiser = z.infer<typeof insertAdvertiserSchema>;

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: text("referrer_id").notNull().references(() => users.id),
  referredId: text("referred_id").notNull().references(() => users.id),
  status: text("status").notNull().default("signed_up"),
  signupBonus: real("signup_bonus").default(0),
  predictionBonus: real("prediction_bonus").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export type Referral = typeof referrals.$inferSelect;

export const merchOrders = pgTable("merch_orders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  status: text("status").notNull().default("pending"),
  fulfillmentStatus: text("fulfillment_status").notNull().default("unfulfilled"),
  dropshipperOrderId: text("dropshipper_order_id"),
  items: text("items").notNull(),
  shippingName: text("shipping_name").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  shippingCity: text("shipping_city").notNull(),
  shippingState: text("shipping_state").notNull(),
  shippingZip: text("shipping_zip").notNull(),
  shippingCountry: text("shipping_country").notNull().default("US"),
  shippingEmail: text("shipping_email"),
  shippingPhone: text("shipping_phone"),
  fulfillmentProvider: text("fulfillment_provider"),
  subtotal: real("subtotal").notNull(),
  wholesaleCost: real("wholesale_cost").notNull(),
  shippingCost: real("shipping_cost").notNull().default(0),
  totalCharged: real("total_charged").notNull(),
  platformProfit: real("platform_profit").notNull(),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMerchOrderSchema = createInsertSchema(merchOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type MerchOrder = typeof merchOrders.$inferSelect;
export type InsertMerchOrder = z.infer<typeof insertMerchOrderSchema>;

export const siteCounters = pgTable("site_counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});
