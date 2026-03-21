import { pgTable, text, timestamp, jsonb, real, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey().notNull(),
  email: text("email"),
  passwordHash: text("password_hash"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  membershipTier: text("membership_tier").default("rookie"),
  walletBalance: text("wallet_balance").default("0"),
  city: text("city"),
  state: text("state"),
  country: text("country").default("US"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  phone: text("phone"),
  smsConsent: boolean("sms_consent").default(false),
  smsConsentDate: timestamp("sms_consent_date"),
  referralCode: text("referral_code"),
  referredBy: text("referred_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
