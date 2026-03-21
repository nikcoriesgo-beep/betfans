import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Package, ArrowRight, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

export default function MerchOrderSuccess() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  const { data: order, isLoading } = useQuery<any>({
    queryKey: ["/api/merch/order-status", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/merch/order-status?session_id=${sessionId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!sessionId,
    refetchInterval: (data) => data?.status === "pending" ? 2000 : false,
  });

  const items = order?.items ? JSON.parse(order.items) : [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-20 max-w-2xl">
        {isLoading ? (
          <div className="text-center py-20">
            <Loader2 size={48} className="mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Confirming your order...</p>
          </div>
        ) : order ? (
          <div className="space-y-6">
            <div className="text-center">
              <CheckCircle size={64} className="mx-auto mb-4 text-primary" />
              <h1 className="text-3xl font-display font-bold mb-2" data-testid="text-order-success">
                Order Confirmed!
              </h1>
              <p className="text-muted-foreground">
                Thank you for your purchase. Your order is being processed.
              </p>
            </div>

            <Card className="bg-card/30 border-white/5">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-bold text-lg">Order #BF-{order.id}</h2>
                  <Badge className={
                    order.status === "paid" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                    "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                  }>
                    {order.status === "paid" ? "Paid" : "Processing"}
                  </Badge>
                </div>

                <div className="space-y-3 mb-6">
                  {items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                      <div>
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Qty: {item.quantity} • {item.size} • {item.color}
                        </p>
                      </div>
                      <span className="font-bold">${(item.retailPrice * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 border-t border-white/10 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${order.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className={order.shippingCost === 0 ? "text-primary" : ""}>
                      {order.shippingCost === 0 ? "FREE" : `$${order.shippingCost.toFixed(2)}`}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t border-white/10 pt-2 mt-2">
                    <span>Total</span>
                    <span>${order.totalCharged.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-6 bg-white/5 rounded-lg p-4">
                  <h3 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <Package size={16} className="text-primary" /> Shipping To
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {order.shippingName}<br />
                    {order.shippingAddress}<br />
                    {order.shippingCity}, {order.shippingState} {order.shippingZip}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground mt-4 text-center">
                  Your order will be fulfilled by our dropship partner and shipped within 3-5 business days.
                  <br />Questions about your order? Contact <a href="mailto:nikcox@betfans.us" className="text-primary hover:underline">nikcox@betfans.us</a>
                </p>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/merch">
                <Button variant="outline" className="gap-2 border-white/10">
                  Continue Shopping <ArrowRight size={16} />
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button className="gap-2">
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">Order not found</p>
            <Link href="/merch">
              <Button className="mt-4">Back to Merch</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
