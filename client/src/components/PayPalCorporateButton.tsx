import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    paypal?: any;
  }
}

interface PayPalCorporateButtonProps {
  onSuccess: (subscriptionId: string) => void;
  onError?: (err: any) => void;
  className?: string;
}

export function PayPalCorporateButton({
  onSuccess,
  onError,
  className,
}: PayPalCorporateButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<{
    clientId: string;
    plans: Record<string, string>;
  } | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    fetch("/api/paypal/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.clientId) setConfig(data);
        else setError("PayPal is not yet configured. Please contact us.");
      })
      .catch(() => setError("Failed to load payment options."));
  }, []);

  useEffect(() => {
    if (!config?.clientId) return;
    const existing = document.getElementById("paypal-sdk-script");
    if (existing) {
      setScriptLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "paypal-sdk-script";
    script.src = `https://www.paypal.com/sdk/js?client-id=${config.clientId}&vault=true&intent=subscription`;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setError("Failed to load PayPal. Please refresh the page.");
    document.head.appendChild(script);
  }, [config]);

  useEffect(() => {
    if (!scriptLoaded || !config || !containerRef.current || !window.paypal || rendered) return;

    const planId = config.plans["corporate"];
    if (!planId) {
      setError("Corporate plan not yet configured. Contact nikcox@betfans.us to set up your partnership.");
      return;
    }

    containerRef.current.innerHTML = "";
    setRendered(true);

    window.paypal
      .Buttons({
        style: {
          shape: "rect",
          color: "gold",
          layout: "vertical",
          label: "subscribe",
        },
        createSubscription: (_data: any, actions: any) => {
          return actions.subscription.create({ plan_id: planId });
        },
        onApprove: (data: any) => {
          onSuccess(data.subscriptionID);
        },
        onError: (err: any) => {
          onError?.(err);
        },
      })
      .render(containerRef.current);
  }, [scriptLoaded, config, rendered]);

  if (error) {
    return (
      <div className={`text-center text-sm p-4 border border-yellow-500/30 rounded-xl bg-yellow-500/5 ${className ?? ""}`}
        data-testid="paypal-error-corporate">
        <p className="text-yellow-400 font-medium mb-2">{error}</p>
        <a href="mailto:nikcox@betfans.us"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-bold">
          Contact nikcox@betfans.us →
        </a>
      </div>
    );
  }

  if (!config || !scriptLoaded) {
    return (
      <div className={`h-14 bg-white/5 rounded-xl animate-pulse flex items-center justify-center ${className ?? ""}`}
        data-testid="paypal-loading-corporate">
        <span className="text-xs text-muted-foreground">Loading PayPal...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="paypal-button-corporate"
    />
  );
}
