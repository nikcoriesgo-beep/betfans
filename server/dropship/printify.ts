const PRINTIFY_API_BASE = "https://api.printify.com/v1";

interface PrintifyOrderItem {
  productId: string;
  variantId?: number;
  quantity: number;
}

interface PrintifyShippingAddress {
  name: string;
  address1: string;
  city: string;
  region: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

interface PrintifyOrderPayload {
  externalId: string;
  items: PrintifyOrderItem[];
  shipping: PrintifyShippingAddress;
}

function getHeaders(): Record<string, string> {
  const token = process.env.PRINTIFY_API_TOKEN;
  if (!token) throw new Error("PRINTIFY_API_TOKEN not configured");
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

async function getShopId(): Promise<string> {
  const shopId = process.env.PRINTIFY_SHOP_ID;
  if (shopId) return shopId;

  const res = await fetch(`${PRINTIFY_API_BASE}/shops.json`, { headers: getHeaders() });
  const shops = await res.json();
  if (shops && shops.length > 0) return shops[0].id.toString();
  throw new Error("No Printify shop found");
}

export async function createPrintifyOrder(payload: PrintifyOrderPayload): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const shopId = await getShopId();

    const orderData = {
      external_id: payload.externalId,
      label: `BetFans Order ${payload.externalId}`,
      line_items: payload.items.map((item) => ({
        product_id: item.productId,
        variant_id: item.variantId || 1,
        quantity: item.quantity,
      })),
      shipping_method: 1,
      send_shipping_notification: true,
      address_to: {
        first_name: payload.shipping.name.split(" ")[0] || payload.shipping.name,
        last_name: payload.shipping.name.split(" ").slice(1).join(" ") || "",
        email: payload.shipping.email || "",
        phone: payload.shipping.phone || "",
        country: payload.shipping.country,
        region: payload.shipping.region,
        address1: payload.shipping.address1,
        city: payload.shipping.city,
        zip: payload.shipping.zip,
      },
    };

    const res = await fetch(`${PRINTIFY_API_BASE}/shops/${shopId}/orders.json`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(orderData),
    });

    const data = await res.json();

    if (res.ok && data.id) {
      console.log(`[Printify] Order created: ${data.id}`);

      await fetch(`${PRINTIFY_API_BASE}/shops/${shopId}/orders/${data.id}/send_to_production.json`, {
        method: "POST",
        headers: getHeaders(),
      });

      return { success: true, orderId: data.id };
    } else {
      const errorMsg = data.errors ? JSON.stringify(data.errors) : data.message || "Unknown error";
      console.error(`[Printify] Order failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error(`[Printify] Error:`, error.message);
    return { success: false, error: error.message };
  }
}

export async function getPrintifyOrderTracking(orderId: string): Promise<{ trackingNumber?: string; trackingUrl?: string; status?: string }> {
  try {
    const shopId = await getShopId();
    const res = await fetch(`${PRINTIFY_API_BASE}/shops/${shopId}/orders/${orderId}.json`, {
      headers: getHeaders(),
    });
    const data = await res.json();

    if (data && data.shipments && data.shipments.length > 0) {
      const shipment = data.shipments[0];
      return {
        trackingNumber: shipment.tracking?.number,
        trackingUrl: shipment.tracking?.url,
        status: data.status,
      };
    }
    return { status: data?.status };
  } catch (error: any) {
    console.error(`[Printify] Tracking error:`, error.message);
    return {};
  }
}

export function isPrintifyConfigured(): boolean {
  return !!process.env.PRINTIFY_API_TOKEN;
}
