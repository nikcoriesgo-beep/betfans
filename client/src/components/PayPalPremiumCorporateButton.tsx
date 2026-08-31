import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { paypal?: any; }
}

interface PayPalPremiumCorporateButtonProps {
  onSuccess: (subscriptionId: string) => void;
  onError?: (err: any) => void;
  className?: string;
}

export function PayPalPremiumCorporateButton({ onSuccess, onError, className }: PayPalPremiumCorporateButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<{ clientId: string; plans: Record<string, string> } | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    fetch("/api/paypal/config")
      .then(r => r.json())
      .then(data => { if (data.clientId) setConfig(data); else setError("PayPal is not yet configured."); })
      .catch(() => setError("Failed to load payment options."));
  }, []);

  useEffect(() => {
    if (!config?.clientId) return;
    const existing = document.getElementById("paypal-sdk-script");
    if (existing) { setScriptLoaded(true); return; }
    const script = document.createElement("script");
    script.id = "paypal-sdk-script";
    script.src = `https://www.paypal.com/sdk/js?client-id=${config.clientId}&vault=true&intent=subscription`;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setError("Failed to load PayPal. Please refresh.");
    document.head.appendChild(script);
  }, [config]);

  useEffect(() => {
    if (!scriptLoaded || !config || !containerRef.current || !window.paypal || rendered) return;
    const planId = config.plans["premium_corporate"];
    if (!planId) {
      setError("Premium Corporate plan not yet configured. Contact nikcox@betfans.us.");
      return;
    }
    containerRef.current.innerHTML = "";
    setRendered(true);
    window.paypal.Buttons({
      style: { shape: "rect", color: "gold", layout: "vertical", label: "subscribe" },
      createSubscription: (_data: any, actions: any) => actions.subscription.create({ plan_id: planId }),
      onApprove: (data: any) => onSuccess(data.subscriptionID),
      onError: (err: any) => onError?.(err),
    }).render(containerRef.current);
  }, [scriptLoaded, config, rendered]);

  if (error) {
    return (
      <div className={`text-center text-sm p-4 border border-yellow-500/30 rounded-xl bg-yellow-500/5 ${className ?? ""}`} data-testid="paypal-error-premium-corporate">
        <p className="text-yellow-400 font-medium mb-2">{error}</p>
        <a href="mailto:nikcox@betfans.us" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-bold">Contact nikcox@betfans.us →</a>
      </div>
    );
  }
  if (!config || !scriptLoaded) {
    return (
      <div className={`h-14 bg-white/5 rounded-xl animate-pulse flex items-center justify-center ${className ?? ""}`} data-testid="paypal-loading-premium-corporate">
        <span className="text-xs text-muted-foreground">Loading PayPal...</span>
      </div>
    );
  }
  return <div ref={containerRef} className={className} data-testid="paypal-button-premium-corporate" />;
}
