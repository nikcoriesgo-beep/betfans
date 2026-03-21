const CJ_API_BASE = "https://developers.cjdropshipping.com/api/v2";

interface CJOrderItem {
  sku: string;
  quantity: number;
  variant?: string;
}

interface CJShippingAddress {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}

interface CJOrderPayload {
  orderNumber: string;
  items: CJOrderItem[];
  shipping: CJShippingAddress;
  remark?: string;
}

async function getAccessToken(): Promise<string> {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("CJ_API_KEY not configured");

  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.CJ_EMAIL, password: process.env.CJ_API_KEY }),
  });

  const data = await res.json();
  if (!data.result) throw new Error(`CJ auth failed: ${data.message}`);
  return data.data?.accessToken || "";
}

export async function createCJOrder(payload: CJOrderPayload): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const token = await getAccessToken();

    const orderData = {
      orderNumber: payload.orderNumber,
      shippingZip: payload.shipping.zip,
      shippingCountryCode: payload.shipping.country,
      shippingCountry: payload.shipping.country,
      shippingProvince: payload.shipping.state,
      shippingCity: payload.shipping.city,
      shippingAddress: payload.shipping.address,
      shippingCustomerName: payload.shipping.name,
      shippingPhone: payload.shipping.phone || "",
      remark: payload.remark || "BetFans merch order",
      products: payload.items.map((item) => ({
        vid: item.sku,
        quantity: item.quantity,
      })),
    };

    const res = await fetch(`${CJ_API_BASE}/shopping/order/createOrder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
      body: JSON.stringify(orderData),
    });

    const data = await res.json();

    if (data.result) {
      console.log(`[CJ] Order created: ${data.data?.orderId}`);
      return { success: true, orderId: data.data?.orderId };
    } else {
      console.error(`[CJ] Order failed: ${data.message}`);
      return { success: false, error: data.message };
    }
  } catch (error: any) {
    console.error(`[CJ] Error:`, error.message);
    return { success: false, error: error.message };
  }
}

export async function getCJOrderTracking(orderId: string): Promise<{ trackingNumber?: string; trackingUrl?: string; status?: string }> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`${CJ_API_BASE}/shopping/order/getOrderDetail?orderId=${orderId}`, {
      headers: { "CJ-Access-Token": token },
    });
    const data = await res.json();

    if (data.result && data.data) {
      return {
        trackingNumber: data.data.trackNumber || undefined,
        trackingUrl: data.data.trackNumber ? `https://t.17track.net/en#nums=${data.data.trackNumber}` : undefined,
        status: data.data.orderStatus,
      };
    }
    return {};
  } catch (error: any) {
    console.error(`[CJ] Tracking error:`, error.message);
    return {};
  }
}

export function isCJConfigured(): boolean {
  return !!(process.env.CJ_API_KEY && process.env.CJ_EMAIL);
}
