import { Check, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function HomeFreeMembership({ signedIn, tier }: { signedIn: boolean; tier?: string | null }) {
  const enrolled = signedIn && tier && tier !== "free";
  const href = enrolled ? "/daily-picks" : signedIn ? "/membership" : "/auth?mode=signup";
  return <div id="free-membership" data-testid="home-free-membership"
    className="scroll-mt-40 max-w-md mx-auto mb-10 rounded-2xl border-2 border-primary bg-gradient-to-b from-primary/15 to-primary/5 p-6 sm:p-8 shadow-[0_0_30px_rgba(34,197,94,0.18)] text-left">
    <span className="inline-block rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-bold mb-4">FREE PLAY — NO PAYMENT REQUIRED</span>
    <h3 className="text-2xl sm:text-3xl font-display font-bold">Free Membership</h3>
    <p className="mt-3 mb-5 text-5xl font-bold">$0<span className="text-lg text-muted-foreground font-normal">/month</span></p>
    <ul className="space-y-3 mb-5">
      {["Play free Daily Picks", "Predict champions in Master Championships", "See your graded daily results", "Get your own affiliate code to invite players"].map(feature =>
        <li key={feature} className="flex gap-3 items-start text-sm"><Check size={18} className="text-primary shrink-0 mt-0.5" />{feature}</li>)}
    </ul>
    <p className="rounded-lg border border-primary/20 bg-background/40 p-3 text-sm text-muted-foreground mb-5">
      Skill play only. No Prize Pool entries, payouts, or referral cash rewards. Upgrade to Legend for $99/month at any time.
    </p>
    <Link href={href}>
      <Button className="w-full font-bold h-12" data-testid="button-home-free-membership">
        {enrolled ? "Play Free Daily Picks" : "Join Free — $0"}<ArrowRight size={16} className="ml-2" />
      </Button>
    </Link>
  </div>;
}
