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
    corporate: process.env.PAYPAL_PLAN_CORPORATE || "",
    premium_corporate: process.env.PAYPAL_PLAN_PREMIUM_CORPORATE || "",
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
      corporate: process.env.PAYPAL_PLAN_CORPORATE || "",
      premium_corporate: process.env.PAYPAL_PLAN_PREMIUM_CORPORATE || "",
    },
  };
}

export function tierFromPlanId(planId: string): string | null {
  const map: Record<string, string> = {
    [process.env.PAYPAL_PLAN_ROOKIE || "__none__"]: "rookie",
    [process.env.PAYPAL_PLAN_PRO || "__none__"]: "pro",
    [process.env.PAYPAL_PLAN_LEGEND || "__none__"]: "legend",
    [process.env.PAYPAL_PLAN_CORPORATE || "__none__corporate"]: "corporate",
    [process.env.PAYPAL_PLAN_PREMIUM_CORPORATE || "__none__premcorp"]: "premium_corporate",
  };
  return map[planId] || null;
}

const TIER_PRICES: Record<string, number> = { rookie: 19, pro: 29, legend: 99, corporate: 1200, premium_corporate: 12000 };

export async function createAndSendPayPalInvoice(opts: {
  recipientEmail: string;
  recipientName?: string;
  tier: string;
  userId: string;
}): Promise<{ invoiceId: string; invoiceUrl: string }> {
  const token = await getAccessToken();
  const price = TIER_PRICES[opts.tier.toLowerCase()] ?? 99;
  const tierLabel = opts.tier.charAt(0).toUpperCase() + opts.tier.slice(1).toLowerCase();
  const invoiceNumber = `BF-${opts.userId.slice(0, 8).toUpperCase()}-${Date.now()}`;

  // Step 1 — create draft invoice
  const createRes = await fetch(`${PAYPAL_BASE}/v2/invoicing/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": invoiceNumber,
    },
    body: JSON.stringify({
      detail: {
        invoice_number: invoiceNumber,
        currency_code: "USD",
        payment_term: { term_type: "DUE_ON_RECEIPT" },
        memo: `userId:${opts.userId}`,
        note: `BetFans ${tierLabel} membership — monthly payment`,
      },
      invoicer: {
        name: { business_name: "BetFans" },
        website: "https://betfans.us",
        logo_url: "https://betfans.us/logo.png",
      },
      primary_recipients: [{
        billing_info: {
          email_address: opts.recipientEmail,
          ...(opts.recipientName ? {
            name: {
              given_name: opts.recipientName.split(" ")[0] ?? opts.recipientName,
              surname: opts.recipientName.split(" ").slice(1).join(" ") || "",
            },
          } : {}),
        },
      }],
      items: [{
        name: `BetFans ${tierLabel} Membership`,
        description: `Monthly ${tierLabel} tier membership. Access BetFans at https://betfans.us`,
        quantity: "1",
        unit_amount: { currency_code: "USD", value: price.toFixed(2) },
        unit_of_measure: "QUANTITY",
      }],
      configuration: {
        allow_tip: false,
        tax_calculated_after_discount: false,
        tax_inclusive: false,
      },
    }),
  });

  // PayPal v2 invoicing: 201 Created with body, OR empty body + Location header
  let created: any = {};
  const createText = await createRes.text();
  if (createText) {
    try { created = JSON.parse(createText); } catch {}
  }
  if (!createRes.ok) {
    const msg = created?.message || created?.details?.[0]?.description || createText.slice(0, 200);
    throw new Error(`PayPal Invoice create error ${createRes.status}: ${msg}`);
  }

  // Extract invoice ID from body or from Location header (PayPal sometimes returns only Location)
  let invoiceId: string = created.id ?? "";
  if (!invoiceId) {
    const loc = createRes.headers.get("Location") ?? "";
    // Location looks like: https://api-m.paypal.com/v2/invoicing/invoices/INV2-XXXX-...
    const locMatch = loc.match(/invoices\/([^/?]+)/);
    if (locMatch) invoiceId = locMatch[1];
  }
  if (!invoiceId) {
    throw new Error(`PayPal Invoice create succeeded but returned no invoice ID. Body: ${createText.slice(0, 300)}`);
  }
  console.log(`[PayPal invoice] Created invoice ${invoiceId} for ${opts.recipientEmail}`);

  // Step 2 — send the invoice to the recipient
  const sendRes = await fetch(`${PAYPAL_BASE}/v2/invoicing/invoices/${invoiceId}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      send_to_recipient: true,
      send_to_invoicer: true,
      subject: `Your BetFans ${tierLabel} membership payment is due`,
      note: `Hi ${opts.recipientName?.split(" ")[0] ?? "there"},\n\nYour monthly BetFans ${tierLabel} membership is due. Click below to pay $${price} and restore your access.\n\nThanks,\nBetFans Team`,
    }),
  });

  if (!sendRes.ok) {
    const sendData = (await sendRes.json()) as any;
    const msg = sendData?.message || sendData?.details?.[0]?.description || JSON.stringify(sendData);
    throw new Error(`PayPal Invoice send error ${sendRes.status}: ${msg}`);
  }

  // Step 3 — fetch invoice to get the payment link
  const detailRes = await fetch(`${PAYPAL_BASE}/v2/invoicing/invoices/${invoiceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const detail = (await detailRes.json()) as any;
  const invoiceUrl: string =
    detail?.detail?.metadata?.payer_view_url ??
    detail?.links?.find((l: any) => l.rel === "payer-view")?.href ??
    `https://www.paypal.com/invoice/p/#${invoiceId}`;

  return { invoiceId, invoiceUrl };
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
  // Sort newest first so we try the most recent billing cycle first
  const completedTxs = transactions
    .filter((t: any) => t.status === "COMPLETED")
    .sort((a: any, b: any) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());
  if (completedTxs.length === 0) throw new Error(`No completed subscription transaction found for ${subscriptionId}`);

  let lastError = "";
  for (const tx of completedTxs) {
    const captureId = tx.id;
    const refundRes = await fetch(`${PAYPAL_BASE}/v2/payments/captures/${captureId}/refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: { value: amount.toFixed(2), currency_code: "USD" },
        note_to_payer: note,
      }),
    });
    const refundData = (await refundRes.json()) as any;
    if (refundRes.ok) {
      return { refundId: refundData.id || "", status: refundData.status || "COMPLETED" };
    }
    const msg = refundData?.message || refundData?.details?.[0]?.description || JSON.stringify(refundData);
    lastError = `capture ${captureId}: ${msg}`;
    // PERMISSION_DENIED or already refunded — try next transaction
    if (!msg.includes("already") && !msg.includes("refund") && !msg.includes("PERMISSION")) break;
  }
  throw new Error(`PayPal Refund failed after trying ${completedTxs.length} transaction(s). Last error — ${lastError}`);
}

export async function sendPayPalPayout(
  receiver: string,
  amount: number,
  senderItemId: string,
  note: string,
  emailSubject = "BetFans Payout 💰",
  emailMessage?: string
): Promise<{ batchId: string; status: string }> {
  const token = await getAccessToken();

  // Auto-detect phone numbers (digits only or E.164 format like +18182314634)
  const isPhone = /^\+?1?\d{10}$/.test(receiver.replace(/\D/g, ""));
  const recipientType = isPhone ? "PHONE" : "EMAIL";
  // Normalize phone to E.164
  const normalizedReceiver = isPhone
    ? "+1" + receiver.replace(/\D/g, "").slice(-10)
    : receiver;

  const res = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: senderItemId,
        email_subject: emailSubject,
        email_message: emailMessage || note,
      },
      items: [{
        recipient_type: recipientType,
        amount: { value: amount.toFixed(2), currency: "USD" },
        receiver: normalizedReceiver,
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

export async function retrySubscriptionPayment(subscriptionId: string): Promise<{ ok: boolean; status: string; detail: string }> {
  const token = await getAccessToken();
  // Step 1: get current status
  const detailRes = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const detail = await detailRes.json() as any;
  const currentStatus = detail.status || "UNKNOWN";

  // Step 2: if ACTIVE (failed billing leaves sub ACTIVE), suspend then reactivate to trigger immediate retry
  if (currentStatus === "ACTIVE" || currentStatus === "SUSPENDED") {
    // Suspend first (no-op if already suspended)
    if (currentStatus === "ACTIVE") {
      await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}/suspend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Retry failed payment" }),
      });
    }
    // Reactivate — triggers immediate billing attempt
    const reactivateRes = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}/activate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Retrying failed payment at merchant request" }),
    });
    if (!reactivateRes.ok) {
      const errData = await reactivateRes.json() as any;
      return { ok: false, status: currentStatus, detail: errData?.message || `activate returned ${reactivateRes.status}` };
    }
    return { ok: true, status: "ACTIVATED", detail: "Subscription suspended then reactivated — PayPal will bill immediately" };
  }

  return { ok: false, status: currentStatus, detail: `Unexpected subscription status: ${currentStatus}` };
}
