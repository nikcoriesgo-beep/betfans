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

export async function sendPayPalSubscriptionRefund(
  subscriptionId: string,
  amount: number,
  note: string
): Promise<{ refundId: string; status: string }> {
  const token = await getAccessToken();
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const txRes = await fetch(
    `${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}/transactions?start_time=${startTime}&end_time=${endTime}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const txData = (await txRes.json()) as any;
  const transactions: any[] = txData?.transactions || [];
  const completedTx = transactions.find((t: any) => t.status === "COMPLETED");
  if (!completedTx) throw new Error(`No completed subscription transaction found for ${subscriptionId}`);
  const captureId = completedTx.id;
  const refundRes = await fetch(`${PAYPAL_BASE}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { value: amount.toFixed(2), currency_code: "USD" },
      note_to_payer: note,
    }),
  });
  const refundData = (await refundRes.json()) as any;
  if (!refundRes.ok) {
    const msg = refundData?.message || refundData?.details?.[0]?.description || JSON.stringify(refundData);
    throw new Error(`PayPal Refund error ${refundRes.status}: ${msg}`);
  }
  return {
    refundId: refundData.id || "",
    status: refundData.status || "COMPLETED",
  };
}

export async function sendPayPalPayout(
  receiverEmail: string,
  amount: number,
  senderItemId: string,
  note: string
): Promise<{ batchId: string; status: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: senderItemId,
        email_subject: "BetFans Prize Pool Payout 🏆",
        email_message: `Congratulations! You've won the BetFans daily prize pool. ${note}`,
      },
      items: [{
        recipient_type: "EMAIL",
        amount: { value: amount.toFixed(2), currency: "USD" },
        receiver: receiverEmail,
        sender_item_id: senderItemId,
        note,
      }],
    }),
  });
  const data = await res.json() as any;
  if (!res.ok) {
    const msg = data?.message || data?.details?.[0]?.issue || JSON.stringify(data);
    throw new Error(`PayPal Payout error ${res.status}: ${msg}`);
  }
  return {
    batchId: data.batch_header?.payout_batch_id || "",
    status: data.batch_header?.batch_status || "PENDING",
  };
}
