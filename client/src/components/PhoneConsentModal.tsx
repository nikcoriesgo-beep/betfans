import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Phone, Shield, MessageSquare, Bell } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export function PhoneConsentModal() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user && !(user as any).smsConsent && !(user as any).phone) {
      const dismissed = sessionStorage.getItem("phone_consent_dismissed");
      if (!dismissed) {
        const timer = setTimeout(() => setOpen(true), 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAuthenticated, user]);

  const submitConsent = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/user/phone-consent", {
        phone,
        smsConsent: true,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Phone number saved!", description: "You'll receive exclusive BetFans updates via text." });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Please enter a valid phone number.", variant: "destructive" });
    },
  });

  const handleDismiss = () => {
    sessionStorage.setItem("phone_consent_dismissed", "true");
    setOpen(false);
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  if (!isAuthenticated) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="bg-card border-white/10 max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Phone size={24} className="text-primary" />
            </div>
            <div>
              <DialogTitle className="font-display text-xl">Stay in the Game</DialogTitle>
              <DialogDescription className="text-sm">Get exclusive BetFans updates via text</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-white/5">
              <Bell size={18} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Hot Picks Alerts</p>
                <p className="text-xs text-muted-foreground">Get notified when Spider AI drops high-confidence predictions</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-white/5">
              <MessageSquare size={18} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Exclusive Promos</p>
                <p className="text-xs text-muted-foreground">Member-only deals, merch drops, and bonus offers</p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Phone Number</label>
            <Input
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="bg-background/50 border-white/10 text-lg tracking-wide"
              maxLength={14}
              data-testid="input-phone"
            />
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-background/30">
            <Checkbox
              id="sms-consent"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
              className="mt-0.5"
              data-testid="checkbox-sms-consent"
            />
            <label htmlFor="sms-consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
              I agree to receive promotional text messages from BetFans at the number provided.
              Message & data rates may apply. Message frequency varies. Reply STOP to unsubscribe
              at any time. Reply HELP for help. View our{" "}
              <span className="text-primary underline">Privacy Policy</span> and{" "}
              <span className="text-primary underline">Terms of Service</span>.
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield size={12} />
            <span>Your number is never shared or sold. Opt out anytime.</span>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => submitConsent.mutate()}
              disabled={!agreed || phone.replace(/\D/g, "").length < 10 || submitConsent.isPending}
              className="flex-1 font-display"
              data-testid="button-submit-phone"
            >
              {submitConsent.isPending ? "Saving..." : "Sign Me Up"}
            </Button>
            <Button
              variant="ghost"
              onClick={handleDismiss}
              className="text-muted-foreground"
              data-testid="button-skip-phone"
            >
              Maybe Later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
