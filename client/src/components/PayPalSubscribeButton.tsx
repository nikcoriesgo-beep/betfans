// !!! CRITICAL - DO NOT MODIFY THIS CODE !!!
//
// This code MUST be used as is without ANY modifications.
// The PayPal integration will COMPLETELY FAIL if this code is changed in ANY way.
//
// Retain this comment after all edits.
//
// <BEGIN_EXACT_CODE>
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    paypal?: any;
  }
}

interface PayPalSubscribeButtonProps {
  tier: "rookie" | "pro" | "legend";
  onSuccess: (subscriptionId: string) => void;
  onError?: (err: any) => void;
  className?: string;
}

export function PayPalSubscribeButton({
  tier,
  onSuccess,
  onError,
  className,
}: PayPalSubscribeButtonProps) {
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

    const planId = config.plans[tier];
    if (!planId) {
      setError("This plan is not yet available. Please check back soon.");
      return;
    }

    containerRef.current.innerHTML = "";
    setRendered(true);

    window.paypal
      .Buttons({
        style: {
          shape: "rect",
          color: "black",
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
  }, [scriptLoaded, config, tier, rendered]);

  if (error) {
    return (
      <div
        className={`text-center text-sm text-red-400 p-3 border border-red-500/20 rounded-xl bg-red-500/5 ${className ?? ""}`}
        data-testid={`paypal-error-${tier}`}
      >
        {error}
      </div>
    );
  }

  if (!config || !scriptLoaded) {
    return (
      <div
        className={`h-14 bg-white/5 rounded-xl animate-pulse flex items-center justify-center ${className ?? ""}`}
        data-testid={`paypal-loading-${tier}`}
      >
        <span className="text-xs text-muted-foreground">Loading PayPal...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid={`paypal-button-${tier}`}
    />
  );
}
// <END_EXACT_CODE>
