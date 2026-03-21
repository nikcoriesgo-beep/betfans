import { createCJOrder, getCJOrderTracking, isCJConfigured } from "./cjDropshipping";
import { createPrintifyOrder, getPrintifyOrderTracking, isPrintifyConfigured } from "./printify";

export type FulfillmentProvider = "cj" | "printify" | "manual";

interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  wholesalePrice: number;
  provider: FulfillmentProvider;
  variantId?: string;
}

interface ShippingAddress {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string;
  email?: string;
}

interface FulfillmentResult {
  provider: FulfillmentProvider;
  success: boolean;
  orderId?: string;
  error?: string;
}

export const PRODUCT_PROVIDER_MAP: Record<string, { provider: FulfillmentProvider; dropshipSku: string }> = {
  "bf-basketball": { provider: "cj", dropshipSku: "CJ-BBALL-001" },
  "bf-football": { provider: "cj", dropshipSku: "CJ-FBALL-001" },
  "bf-soccer": { provider: "cj", dropshipSku: "CJ-SOCCER-001" },
  "bf-hockey-pucks": { provider: "cj", dropshipSku: "CJ-HOCKEY-001" },
  "bf-baseball-set": { provider: "cj", dropshipSku: "CJ-BSET-001" },
  "bf-duffle": { provider: "cj", dropshipSku: "CJ-DUFFLE-001" },
  "bf-blanket": { provider: "cj", dropshipSku: "CJ-BLANKET-001" },
  "bf-training-kit": { provider: "cj", dropshipSku: "CJ-TRAIN-001" },
  "bf-water-bottle": { provider: "cj", dropshipSku: "CJ-BOTTLE-001" },
  "bf-jersey": { provider: "printify", dropshipSku: "PRNT-JERSEY-001" },
};

export function getProviderForProduct(productId: string): FulfillmentProvider {
  return PRODUCT_PROVIDER_MAP[productId]?.provider || "manual";
}

function groupByProvider(items: OrderItem[]): Map<FulfillmentProvider, OrderItem[]> {
  const groups = new Map<FulfillmentProvider, OrderItem[]>();
  for (const item of items) {
    const provider = item.provider;
    if (!groups.has(provider)) groups.set(provider, []);
    groups.get(provider)!.push(item);
  }
  return groups;
}

export async function fulfillOrder(
  orderId: string,
  items: OrderItem[],
  shipping: ShippingAddress
): Promise<FulfillmentResult[]> {
  const grouped = groupByProvider(items);
  const results: FulfillmentResult[] = [];

  for (const [provider, providerItems] of grouped) {
    if (provider === "cj") {
      if (!isCJConfigured()) {
        console.log(`[Fulfillment] CJ not configured — logging order for manual fulfillment`);
        logManualOrder(orderId, "cj", providerItems, shipping);
        results.push({ provider: "cj", success: true, orderId: `manual-cj-${orderId}` });
        continue;
      }

      const result = await createCJOrder({
        orderNumber: `BF-${orderId}`,
        items: providerItems.map((i) => ({
          sku: i.sku,
          quantity: i.quantity,
        })),
        shipping: {
          name: shipping.name,
          address: shipping.address,
          city: shipping.city,
          state: shipping.state,
          zip: shipping.zip,
          country: shipping.country || "US",
        },
      });
      results.push({ provider: "cj", ...result });
    } else if (provider === "printify") {
      if (!isPrintifyConfigured()) {
        console.log(`[Fulfillment] Printify not configured — logging order for manual fulfillment`);
        logManualOrder(orderId, "printify", providerItems, shipping);
        results.push({ provider: "printify", success: true, orderId: `manual-printify-${orderId}` });
        continue;
      }

      const result = await createPrintifyOrder({
        externalId: `BF-${orderId}`,
        items: providerItems.map((i) => ({
          productId: i.sku,
          quantity: i.quantity,
        })),
        shipping: {
          name: shipping.name,
          address1: shipping.address,
          city: shipping.city,
          region: shipping.state,
          zip: shipping.zip,
          country: shipping.country || "US",
          email: shipping.email,
          phone: shipping.phone,
        },
      });
      results.push({ provider: "printify", ...result });
    } else {
      logManualOrder(orderId, "manual", providerItems, shipping);
      results.push({ provider: "manual", success: true, orderId: `manual-${orderId}` });
    }
  }

  return results;
}

export async function getOrderTracking(
  provider: FulfillmentProvider,
  providerOrderId: string
): Promise<{ trackingNumber?: string; trackingUrl?: string; status?: string }> {
  if (provider === "cj" && isCJConfigured()) {
    return getCJOrderTracking(providerOrderId);
  } else if (provider === "printify" && isPrintifyConfigured()) {
    return getPrintifyOrderTracking(providerOrderId);
  }
  return { status: "manual" };
}

function logManualOrder(orderId: string, provider: string, items: OrderItem[], shipping: ShippingAddress) {
  console.log(`[Fulfillment] Manual order logged:`, JSON.stringify({
    orderId,
    provider,
    items: items.map((i) => ({ name: i.name, sku: i.sku, qty: i.quantity, wholesale: i.wholesalePrice })),
    shipTo: shipping,
    timestamp: new Date().toISOString(),
  }, null, 2));
}

export function getFulfillmentStatus(): { cj: boolean; printify: boolean } {
  return {
    cj: isCJConfigured(),
    printify: isPrintifyConfigured(),
  };
}
