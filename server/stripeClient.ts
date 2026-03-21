import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

function getStripeApiKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY not set. Please connect the Stripe integration.");
  }
  return key;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  return new Stripe(getStripeApiKey(), {
    apiVersion: "2025-04-30.basil" as any,
  });
}

let stripeSyncInstance: StripeSync | null = null;

export async function getStripeSync(): Promise<StripeSync> {
  if (!stripeSyncInstance) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL required for StripeSync");
    }

    stripeSyncInstance = new StripeSync({
      databaseUrl,
      stripeSecretKey: getStripeApiKey(),
    });
  }

  return stripeSyncInstance;
}
