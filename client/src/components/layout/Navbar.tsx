import { useLocation, Link } from "wouter";
import { cn } from "@/lib/utils";
import { TrendingUp, User, Menu, LogIn, ChevronDown, Clock, Calendar, Target, Trophy } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PrizePoolTicker } from "./PrizePoolTicker";
import { useAuth } from "@/hooks/use-auth";

export function Navbar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const lbRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const { user, isAuthenticated } = useAuth();

  const leaderboardItems = [
    { label: "Daily", href: "/leaderboard/daily", icon: Clock },
    { label: "Weekly", href: "/leaderboard/weekly", icon: Calendar },
    { label: "Monthly", href: "/leaderboard/monthly", icon: Target },
    { label: "Annual", href: "/leaderboard/annual", icon: Trophy },
  ];

  const moreItems = [
    { label: "Sports News", href: "/news" },
    { label: "Membership", href: "/membership" },
    { label: "Baseball For Breakfast", href: "/baseball-breakfast" },
    { label: "Winners", href: "/winners" },
    { label: "Member Map", href: "/members-map" },
    { label: "Affiliate & Income", href: "/referrals" },
  ];

  const allMobileItems = [
    { label: "Home", href: "/" },
    { label: "Daily Picks", href: "/daily-picks" },
    ...moreItems,
  ];

  const isLeaderboardActive = location.startsWith("/leaderboard");
  const isMoreActive = moreItems.some(i => location === i.href);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (lbRef.current && !lbRef.current.contains(e.target as Node)) setLbOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const linkClass = (active: boolean) =>
    cn("text-sm font-medium transition-colors hover:text-primary whitespace-nowrap",
      active ? "text-primary" : "text-muted-foreground");

  const dropdownClass = "absolute top-full mt-2 right-0 w-52 bg-card/95 backdrop-blur-lg border border-white/10 rounded-xl shadow-xl overflow-hidden z-50";

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">

          <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tighter hover:opacity-80 transition-opacity shrink-0" data-testid="link-home">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
              <TrendingUp size={20} strokeWidth={3} />
            </div>
            <span className="text-foreground">Bet<span className="text-primary">Fans</span></span>
          </Link>

          <div className="hidden md:flex items-center gap-5">
            <Link href="/" className={linkClass(location === "/")}>Home</Link>
            <Link href="/daily-picks" className={linkClass(location === "/daily-picks")}>Daily Picks</Link>

            <div className="relative" ref={lbRef}>
              <button
                onClick={() => { setLbOpen(!lbOpen); setMoreOpen(false); }}
                className={cn("text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 whitespace-nowrap",
                  isLeaderboardActive ? "text-primary" : "text-muted-foreground")}
                data-testid="button-leaderboard-dropdown"
              >
                Leaderboards <ChevronDown size={14} className={cn("transition-transform", lbOpen && "rotate-180")} />
              </button>
              {lbOpen && (
                <div className={dropdownClass}>
                  {leaderboardItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href}
                        onClick={() => setLbOpen(false)}
                        className={cn("flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-primary/10",
                          location === item.href ? "text-primary bg-primary/5" : "text-muted-foreground")}
                        data-testid={`link-leaderboard-${item.label.toLowerCase()}`}
                      >
                        <Icon size={16} /> {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="relative" ref={moreRef}>
              <button
                onClick={() => { setMoreOpen(!moreOpen); setLbOpen(false); }}
                className={cn("text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 whitespace-nowrap",
                  isMoreActive ? "text-primary" : "text-muted-foreground")}
                data-testid="button-more-dropdown"
              >
                More <ChevronDown size={14} className={cn("transition-transform", moreOpen && "rotate-180")} />
              </button>
              {moreOpen && (
                <div className={dropdownClass}>
                  {moreItems.map((item) => (
                    <Link key={item.href} href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn("flex items-center px-4 py-3 text-sm transition-colors hover:bg-primary/10",
                        location === item.href ? "text-primary bg-primary/5" : "text-muted-foreground")}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {isAuthenticated ? (
              <Link href="/profile" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity shrink-0" data-testid="link-profile">
                <Avatar className="h-8 w-8 border-2 border-primary/20">
                  <AvatarImage src={user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`} />
                  <AvatarFallback>{user?.firstName?.[0] || "U"}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{user?.firstName || "Profile"}</span>
              </Link>
            ) : (
              <Link href="/auth">
                <Button variant="outline" size="sm" className="gap-2 border-primary/50 hover:bg-primary/10 hover:text-primary" data-testid="button-login">
                  <LogIn size={16} /> Sign In
                </Button>
              </Link>
            )}
          </div>

          <div className="md:hidden flex items-center gap-2">
            {isAuthenticated ? (
              <Link href="/profile" className="flex items-center gap-1.5" data-testid="link-profile-mobile">
                <Avatar className="h-8 w-8 border-2 border-primary/20">
                  <AvatarImage src={user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`} />
                  <AvatarFallback>{user?.firstName?.[0] || "U"}</AvatarFallback>
                </Avatar>
              </Link>
            ) : (
              <Link href="/auth?mode=signup">
                <Button size="default" className="gap-2 font-display font-bold text-sm px-4 shadow-[0_0_12px_rgba(34,197,94,0.4)]" data-testid="button-signup-mobile">
                  Join Now
                </Button>
              </Link>
            )}
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-background border-l border-border overflow-y-auto">
                <div className="flex flex-col gap-1 mt-4">
                  {allMobileItems.map((item) => (
                    <Link key={item.href} href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn("px-2 py-2.5 rounded-lg text-base font-medium transition-colors hover:bg-primary/10 hover:text-primary",
                        location === item.href ? "text-primary bg-primary/5" : "text-muted-foreground")}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/50 px-2 mb-1">Leaderboards</p>
                    {leaderboardItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link key={item.href} href={item.href}
                          onClick={() => setIsOpen(false)}
                          className={cn("flex items-center gap-3 px-2 py-2.5 rounded-lg text-base font-medium transition-colors hover:bg-primary/10 hover:text-primary",
                            location === item.href ? "text-primary bg-primary/5" : "text-muted-foreground")}
                        >
                          <Icon size={16} /> {item.label}
                        </Link>
                      );
                    })}
                  </div>
                  {isAuthenticated ? (
                    <Link href="/profile" onClick={() => setIsOpen(false)} className="mt-2">
                      <Button className="w-full gap-2 font-display"><User size={16} /> Profile</Button>
                    </Link>
                  ) : (
                    <Link href="/auth" onClick={() => setIsOpen(false)} className="mt-2">
                      <Button className="w-full gap-2 font-display"><LogIn size={16} /> Sign In</Button>
                    </Link>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="absolute top-14 left-0 right-0 z-40 pointer-events-none" style={{ top: 'calc(3.5rem + env(safe-area-inset-top))' }}>
          <div className="pointer-events-auto">
            <PrizePoolTicker />
          </div>
        </div>
      </nav>
      <div className="h-10" />
    </>
  );
}
