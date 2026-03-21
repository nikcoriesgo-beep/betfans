import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Share2, Twitter, Facebook, Link2, Download, Trophy, TrendingUp, Target, Instagram, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function TikTokIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}

interface ShareablePickData {
  username: string;
  record: string;
  winRate: string;
  streak: string;
  picks: { game: string; pick: string; result: string; odds: string }[];
  profileImage?: string;
}

function ShareButtons({ text, url }: { text: string; url: string }) {
  const { toast } = useToast();

  const shareToTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank"
    );
  };

  const shareToFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`,
      "_blank"
    );
  };

  const shareToInstagram = () => {
    navigator.clipboard.writeText(`${text}\n${url}`);
    toast({ title: "Caption copied! Opening Instagram...", description: "Paste the caption into your Instagram post or story." });
    window.open("https://www.instagram.com/", "_blank");
  };

  const shareToTikTok = () => {
    navigator.clipboard.writeText(`${text}\n${url}`);
    toast({ title: "Caption copied! Opening TikTok...", description: "Paste the caption into your TikTok post." });
    window.open("https://www.tiktok.com/upload", "_blank");
  };

  const copyTextMessage = () => {
    const smsText = `Hey! Check out BetFans 🏆 ${text}\n\n${url}\n\n#BetFans #SportsPicks #WinningPicks #FreeMoney #ResidualIncome #SportsBetting #AIpicks #SpiderAI`;
    navigator.clipboard.writeText(smsText);
    toast({ title: "Text message copied!", description: "Paste into your text messages, WhatsApp, or any messaging app." });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${text}\n${url}`);
    toast({ title: "Copied to clipboard!" });
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "BetFans Picks", text, url });
      } catch (e) {}
    } else {
      copyLink();
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-white/10 hover:bg-blue-500/20 hover:text-blue-400 hover:border-blue-500/30"
        onClick={shareToTwitter}
        data-testid="button-share-twitter"
      >
        <Twitter size={14} /> Post
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-white/10 hover:bg-blue-600/20 hover:text-blue-300 hover:border-blue-600/30"
        onClick={shareToFacebook}
        data-testid="button-share-facebook"
      >
        <Facebook size={14} /> Share
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-white/10 hover:bg-pink-500/20 hover:text-pink-400 hover:border-pink-500/30"
        onClick={shareToInstagram}
        data-testid="button-share-instagram"
      >
        <Instagram size={14} /> Instagram
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-white/10 hover:bg-cyan-500/20 hover:text-cyan-400 hover:border-cyan-500/30"
        onClick={shareToTikTok}
        data-testid="button-share-tiktok"
      >
        <TikTokIcon size={14} /> TikTok
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-white/10 hover:bg-yellow-500/20 hover:text-yellow-400 hover:border-yellow-500/30"
        onClick={copyTextMessage}
        data-testid="button-share-text"
      >
        <MessageSquare size={14} /> Text
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-white/10 hover:bg-primary/20 hover:text-primary hover:border-primary/30"
        onClick={copyLink}
        data-testid="button-share-copy"
      >
        <Link2 size={14} /> Copy
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-white/10 hover:bg-violet-500/20 hover:text-violet-400 hover:border-violet-500/30"
        onClick={nativeShare}
        data-testid="button-share-native"
      >
        <Share2 size={14} />
      </Button>
    </div>
  );
}

export function SharePicksCard({ data }: { data: ShareablePickData }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const shareUrl = `${window.location.origin}/referrals`;
  const shareText = `${data.record} record (${data.winRate} win rate) on BetFans! ${data.streak} streak. Join and compete:`;

  return (
    <div className="space-y-3">
      <div ref={cardRef}>
        <Card className="bg-gradient-to-br from-gray-900 via-card to-gray-900 border border-white/10 overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent px-5 py-3 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-2">
                <svg width="24" height="24" viewBox="0 0 200 40" className="shrink-0">
                  <text x="0" y="30" fontFamily="monospace" fontWeight="bold" fontSize="28">
                    <tspan fill="#22c55e">BET</tspan>
                    <tspan fill="#ffffff">FANS</tspan>
                  </text>
                </svg>
                <span className="text-[10px] text-muted-foreground">Sports Prediction Platform</span>
              </div>
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                Verified Stats
              </Badge>
            </div>

            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-4">
                {data.profileImage ? (
                  <img src={data.profileImage} alt="" className="w-10 h-10 rounded-full border border-white/10" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    {data.username[0]}
                  </div>
                )}
                <div>
                  <p className="font-display font-bold text-sm">{data.username}</p>
                  <p className="text-[10px] text-muted-foreground">BetFans Member</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white/5 rounded-lg p-2.5 text-center">
                  <Trophy size={14} className="text-primary mx-auto mb-1" />
                  <p className="text-xs font-bold">{data.record}</p>
                  <p className="text-[9px] text-muted-foreground">Record</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 text-center">
                  <Target size={14} className="text-blue-400 mx-auto mb-1" />
                  <p className="text-xs font-bold">{data.winRate}</p>
                  <p className="text-[9px] text-muted-foreground">Win Rate</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 text-center">
                  <TrendingUp size={14} className="text-yellow-400 mx-auto mb-1" />
                  <p className="text-xs font-bold">{data.streak}</p>
                  <p className="text-[9px] text-muted-foreground">Streak</p>
                </div>
              </div>

              {data.picks.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Recent Picks</p>
                  {data.picks.slice(0, 5).map((pick, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{pick.game}</p>
                        <p className="text-[10px] text-muted-foreground">{pick.pick} ({pick.odds})</p>
                      </div>
                      <Badge className={`text-[9px] ${
                        pick.result === "won" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                        pick.result === "lost" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                        "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                      }`}>
                        {pick.result === "won" ? "W" : pick.result === "lost" ? "L" : "Pending"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-primary/5 border-t border-white/5 px-5 py-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">
                Join BetFans — Predict. Compete. Win. <span className="text-primary font-bold">betfans.replit.app</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ShareButtons text={shareText} url={shareUrl} />
    </div>
  );
}

export function QuickShareButton({ text, className }: { text?: string; className?: string }) {
  const { toast } = useToast();
  const shareUrl = `${window.location.origin}/referrals`;
  const shareText = text || "Check out BetFans — the sports prediction platform where you can earn residual income!";

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "BetFans", text: shareText, url: shareUrl });
      } catch (e) {}
    } else {
      navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      toast({ title: "Copied to clipboard!" });
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className={`gap-1.5 border-white/10 ${className || ""}`}
      onClick={handleShare}
      data-testid="button-quick-share"
    >
      <Share2 size={14} /> Share
    </Button>
  );
}

export { ShareButtons };
