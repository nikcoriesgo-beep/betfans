import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Trophy, Target, DollarSign, Users, Zap, ChevronRight,
  ChevronLeft, Star, Crown, Flame, ArrowRight, TrendingUp,
  Shield, Sparkles, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const slides = [
  {
    step: 0,
    tag: "Welcome to BetFans",
    title: "The Game\nIs Simple.",
    subtitle: "Predict. Win. Get Paid.",
    description: "Join the most exciting sports prediction community. Make picks on real games, climb the leaderboard, and win real cash prizes.",
    icon: Zap,
    gradient: "from-primary via-emerald-400 to-cyan-400",
    bgAccent: "bg-primary/10",
  },
  {
    step: 1,
    tag: "Step 1",
    title: "Pick Your\nSport",
    subtitle: "10 leagues. Endless opportunities.",
    description: "NBA, WNBA, NHL, MLB, MLS, NWSL, NCAAB, NFL and more. Spider AI analyzes every matchup and gives you confidence-rated predictions.",
    icon: Target,
    gradient: "from-blue-500 via-indigo-500 to-purple-500",
    bgAccent: "bg-blue-500/10",
    features: ["NBA & WNBA", "NHL & MLB", "MLS & NWSL", "NCAAB & NFL"],
  },
  {
    step: 2,
    tag: "Step 2",
    title: "Make Your\nPrediction",
    subtitle: "Spreads. Moneylines. Over/Unders.",
    description: "Use Spider AI's picks or trust your gut. Every correct prediction earns you points and climbs you up the leaderboard.",
    icon: Flame,
    gradient: "from-orange-500 via-red-500 to-pink-500",
    bgAccent: "bg-orange-500/10",
    features: ["Spider AI Picks", "Confidence Ratings", "Pro-Locked Picks", "Real-Time Lines"],
  },
  {
    step: 3,
    tag: "Step 3",
    title: "Climb The\nLeaderboard",
    subtitle: "Daily. Weekly. Monthly. Annual.",
    description: "Four leaderboards running simultaneously. The more you predict, the more chances you have to win. Build your streak and dominate.",
    icon: TrendingUp,
    gradient: "from-emerald-500 via-green-500 to-teal-500",
    bgAccent: "bg-emerald-500/10",
    features: ["Daily Resets", "Weekly Rankings", "Monthly Showdown", "Annual Champion"],
  },
  {
    step: 4,
    tag: "Step 4",
    title: "Win Real\nCash",
    subtitle: "MLB picks only. Pick every game. Get paid.",
    description: "50% of all membership fees go into the live prize pool. Only MLB picks count toward prize pool qualification — you must pick every MLB game daily to qualify. Payouts go directly to the card you signed up with.",
    icon: DollarSign,
    gradient: "from-yellow-400 via-amber-500 to-orange-500",
    bgAccent: "bg-yellow-500/10",
    features: ["MLB Picks Only", "Pick Every Game Daily", "Live Prize Pool", "Auto Payouts"],
  },
  {
    step: 5,
    tag: "Step 5",
    title: "Join The\nCommunity",
    subtitle: "Talk trash. Brag. Compete.",
    description: "Post on member walls, earn badges, and connect with predictors worldwide on the Member Map.",
    icon: Users,
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    bgAccent: "bg-violet-500/10",
    features: ["Profile Walls", "Member Map", "Community Threads", "Badges"],
  },
  {
    step: 6,
    tag: "Ready?",
    title: "Start\nWinning\nToday.",
    subtitle: "Your first pick is waiting.",
    description: "Join BetFans now. Pick your membership tier, make your first prediction, and start your journey to the top of the leaderboard.",
    icon: Crown,
    gradient: "from-primary via-emerald-400 to-cyan-400",
    bgAccent: "bg-primary/10",
    cta: true,
  },
];

function SlideContent({ slide, index }: { slide: typeof slides[0]; index: number }) {
  const Icon = slide.icon;

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[520px] md:min-h-[560px] px-6 py-8 text-center overflow-hidden">
      <div className={cn("absolute inset-0 opacity-[0.07]", slide.bgAccent)} />
      <div className={cn(
        "absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 bg-gradient-to-br",
        slide.gradient
      )} />

      <div className="relative z-10 max-w-md mx-auto">
        {slide.step > 0 && !slide.cta && (
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className={cn(
                "h-1 rounded-full transition-all",
                s === slide.step ? "w-8 bg-primary" : s < slide.step ? "w-4 bg-primary/40" : "w-4 bg-white/10"
              )} />
            ))}
          </div>
        )}

        <div className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-5 border",
          slide.cta
            ? "bg-primary/20 text-primary border-primary/30"
            : "bg-white/5 text-muted-foreground border-white/10"
        )}>
          {slide.tag}
        </div>

        <div className={cn(
          "w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-gradient-to-br shadow-2xl",
          slide.gradient
        )}>
          <Icon size={32} className="text-white md:hidden" />
          <Icon size={40} className="text-white hidden md:block" />
        </div>

        <h2 className={cn(
          "font-display font-black leading-[0.95] mb-4 whitespace-pre-line",
          slide.cta ? "text-4xl md:text-6xl" : "text-3xl md:text-5xl"
        )}>
          {slide.title.split("\n").map((line, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {i === 0 ? (
                <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", slide.gradient)}>{line}</span>
              ) : (
                line
              )}
            </span>
          ))}
        </h2>

        <p className="text-lg md:text-xl font-medium text-foreground/80 mb-3">{slide.subtitle}</p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-sm mx-auto">{slide.description}</p>

        {slide.step === 4 && (
          <div className="rounded-lg border border-yellow-400/50 bg-yellow-500/10 px-4 py-3 mb-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-black text-yellow-300 uppercase tracking-wide mb-1">To Qualify:</p>
            <ul className="space-y-1 text-xs text-yellow-100/90">
              <li>✓ <strong className="text-yellow-200">Pick every MLB game</strong> each day — no exceptions</li>
              <li>✓ <strong className="text-yellow-200">MLB picks only</strong> — other sports don't count</li>
              <li>✗ Miss one game = <strong className="text-yellow-200">disqualified</strong> from that day's payout</li>
            </ul>
          </div>
        )}

        {slide.features && (
          <div className="grid grid-cols-2 gap-2 mb-4 max-w-xs mx-auto">
            {slide.features.map((f) => (
              <div key={f} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/5 text-xs font-medium">
                <Sparkles size={11} className="text-primary shrink-0" />
                {f}
              </div>
            ))}
          </div>
        )}

        {slide.cta && (
          <div className="flex flex-col items-center gap-3 mt-4">
            <a href="/membership">
              <Button size="lg" className="gap-2 text-base px-8 shadow-[0_0_30px_rgba(34,197,94,0.4)]" data-testid="button-join-cta">
                Join BetFans Now <ArrowRight size={18} />
              </Button>
            </a>
            <p className="text-xs text-muted-foreground">Starting at $29/month</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function HowToPlayPopup({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!open) setCurrent(0);
  }, [open]);

  const next = () => setCurrent((c) => Math.min(c + 1, slides.length - 1));
  const prev = () => setCurrent((c) => Math.max(c - 1, 0));
  const isLast = current === slides.length - 1;
  const isFirst = current === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2" data-testid="button-how-to-play">
            <Zap size={16} /> How to Play
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg p-0 bg-background border-white/10 overflow-hidden rounded-2xl [&>button]:hidden">
        <div className="relative">
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            data-testid="button-close-how-to-play"
          >
            <X size={16} />
          </button>

          <SlideContent slide={slides[current]} index={current} />

          <div className="flex items-center justify-between px-6 pb-6 relative z-10">
            <Button
              variant="ghost"
              size="sm"
              onClick={prev}
              disabled={isFirst}
              className={cn("gap-1", isFirst && "opacity-0 pointer-events-none")}
              data-testid="button-prev-slide"
            >
              <ChevronLeft size={16} /> Back
            </Button>

            <div className="flex gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    i === current ? "bg-primary w-4" : "bg-white/20 hover:bg-white/30"
                  )}
                />
              ))}
            </div>

            {!isLast ? (
              <Button
                size="sm"
                onClick={next}
                className="gap-1"
                data-testid="button-next-slide"
              >
                Next <ChevronRight size={16} />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setOpen(false)}
                className="gap-1"
                data-testid="button-done-slide"
              >
                Got it <Star size={14} />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HowToPlayBanner() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!open) setCurrent(0);
  }, [open]);

  const next = () => setCurrent((c) => Math.min(c + 1, slides.length - 1));
  const prev = () => setCurrent((c) => Math.max(c - 1, 0));
  const isLast = current === slides.length - 1;
  const isFirst = current === 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-y border-primary/20 py-3 px-4 flex items-center justify-center gap-3 hover:from-primary/15 hover:to-primary/15 transition-all cursor-pointer group"
        data-testid="button-how-to-play-banner"
      >
        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
          <Zap size={14} className="text-primary" />
        </div>
        <span className="text-sm font-medium">
          New here? <span className="text-primary font-bold">Learn How to Play & Win Cash</span>
        </span>
        <ChevronRight size={16} className="text-primary group-hover:translate-x-1 transition-transform" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 bg-background border-white/10 overflow-hidden rounded-2xl [&>button]:hidden">
          <div className="relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>

            <SlideContent slide={slides[current]} index={current} />

            <div className="flex items-center justify-between px-6 pb-6 relative z-10">
              <Button
                variant="ghost"
                size="sm"
                onClick={prev}
                disabled={isFirst}
                className={cn("gap-1", isFirst && "opacity-0 pointer-events-none")}
              >
                <ChevronLeft size={16} /> Back
              </Button>

              <div className="flex gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      i === current ? "bg-primary w-4" : "bg-white/20 hover:bg-white/30"
                    )}
                  />
                ))}
              </div>

              {!isLast ? (
                <Button size="sm" onClick={next} className="gap-1">
                  Next <ChevronRight size={16} />
                </Button>
              ) : (
                <Button size="sm" onClick={() => setOpen(false)} className="gap-1">
                  Got it <Star size={14} />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
