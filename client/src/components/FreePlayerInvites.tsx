import { Copy, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function FreePlayerInvites({ code, loading, failed, retry, invited }: {
  code: string; loading: boolean; failed: boolean; retry: () => void; invited: number;
}) {
  const { toast } = useToast();
  const link = code ? `${window.location.origin}/auth?mode=signup&ref=${encodeURIComponent(code)}` : "";
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied! Share it with another player." });
    } catch {
      toast({ title: "Could not copy", description: "Select the code or link below and copy it manually.", variant: "destructive" });
    }
  }
  return <section className="max-w-2xl mx-auto space-y-6">
    <div>
      <p className="text-primary font-semibold mb-2">FREE PLAY</p>
      <h1 className="font-display text-3xl font-bold">Invite Players</h1>
      <p className="text-muted-foreground mt-3">Share your affiliate code so friends can join BetFans for free, play Daily Picks, and select their Master Champions. Each new player gets their own code to invite more players.</p>
    </div>
    <Card><CardContent className="p-6 space-y-5">
      <h2 className="font-bold text-lg">Your Affiliate Code</h2>
      {loading ? <p role="status" className="flex gap-2"><Loader2 className="animate-spin" /> Loading your code…</p> :
        failed || !code ? <div role="alert"><p>Your affiliate code could not be loaded.</p><Button className="mt-3" onClick={retry}>Try again</Button></div> :
          <>
            <div className="flex flex-wrap items-center gap-3">
              <strong className="text-2xl font-mono text-primary select-all break-all" data-testid="text-free-affiliate-code">{code}</strong>
              <Button onClick={() => copy(code)} data-testid="button-copy-free-code"><Copy size={16} className="mr-2" />Copy Code</Button>
            </div>
            <label className="block text-sm font-medium" htmlFor="free-invite-link">Your signup link</label>
            <input id="free-invite-link" className="w-full rounded-md border bg-background p-3 text-sm" readOnly value={link} onFocus={event => event.currentTarget.select()} />
            <Button variant="outline" onClick={() => copy(link)} data-testid="button-copy-free-link"><Copy size={16} className="mr-2" />Copy Invite Link</Button>
          </>}
      <p className="text-sm text-muted-foreground">Your original inviter stays linked to your account. Players who sign up with your code are linked to you.</p>
    </CardContent></Card>
    <p className="flex items-center gap-2"><Users size={18} /> Players invited: <strong>{invited}</strong></p>
    <p className="text-sm text-muted-foreground">Free Play invitations do not earn cash rewards or Prize Pool entries. You can upgrade to Legend for $99/month at any time.</p>
    <a className="inline-block font-semibold text-primary underline" href="/membership">View Legend Membership</a>
  </section>;
}
