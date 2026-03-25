const PAYPAL_BASE = "https://api-m.paypal.com";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal credentials not configured");

  const credentials = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as any;
  if (!data.access_token) throw new Error("Failed to get PayPal access token");
  return data.access_token;
}

export async function getSubscriptionDetails(subscriptionId: string) {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`PayPal API error: ${res.status}`);
  return res.json() as Promise<any>;
}

export function getPlanId(tier: string): string {
  const plans: Record<string, string> = {
    rookie: process.env.PAYPAL_PLAN_ROOKIE || "",
    pro: process.env.PAYPAL_PLAN_PRO || "",
    legend: process.env.PAYPAL_PLAN_LEGEND || "",
  };
  return plans[tier.toLowerCase()] || "";
}

export function getPayPalConfig() {
  return {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    plans: {
      rookie: process.env.PAYPAL_PLAN_ROOKIE || "",
      pro: process.env.PAYPAL_PLAN_PRO || "",
      legend: process.env.PAYPAL_PLAN_LEGEND || "",
    },
  };
}

export function tierFromPlanId(planId: string): string | null {
  const map: Record<string, string> = {
    [process.env.PAYPAL_PLAN_ROOKIE || "__none__"]: "rookie",
    [process.env.PAYPAL_PLAN_PRO || "__none__"]: "pro",
    [process.env.PAYPAL_PLAN_LEGEND || "__none__"]: "legend",
  };
  return map[planId] || null;
}
