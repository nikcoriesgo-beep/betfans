import { useLocation } from "wouter";
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
  const lbRef = useRef<HTMLDivElement>(null);
  const { user, isAuthenticated } = useAuth();

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Sports News", href: "/news" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Membership", href: "/membership" },
    { label: "Baseball For Breakfast", href: "/baseball-breakfast" },
    { label: "Winners", href: "/winners" },
    { label: "Bragging Rights", href: "/bragging" },
    { label: "Member Map", href: "/members-map" },
    { label: "Merch", href: "/merch" },
    { label: "Affiliate & Income", href: "/referrals" },
  ];

  const leaderboardItems = [
    { label: "Daily", href: "/leaderboard/daily", icon: Clock },
    { label: "Weekly", href: "/leaderboard/weekly", icon: Calendar },
    { label: "Monthly", href: "/leaderboard/monthly", icon: Target },
    { label: "Annual", href: "/leaderboard/annual", icon: Trophy },
  ];

  const isLeaderboardActive = location.startsWith("/leaderboard");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (lbRef.current && !lbRef.current.contains(e.target as Node)) {
        setLbOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tighter hover:opacity-80 transition-opacity" data-testid="link-home">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
              <TrendingUp size={20} strokeWidth={3} />
            </div>
            <span className="text-foreground">Bet<span className="text-primary">Fans</span></span>
          </a>

          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary whitespace-nowrap",
                  location === item.href ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </a>
            ))}

            <div className="relative" ref={lbRef}>
              <button
                onClick={() => setLbOpen(!lbOpen)}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary flex items-center gap-1 whitespace-nowrap",
                  isLeaderboardActive ? "text-primary" : "text-muted-foreground"
                )}
                data-testid="button-leaderboard-dropdown"
              >
                Leaderboards <ChevronDown size={14} className={cn("transition-transform", lbOpen && "rotate-180")} />
              </button>
              {lbOpen && (
                <div className="absolute top-full mt-2 right-0 w-48 bg-card/95 backdrop-blur-lg border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                  {leaderboardItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-primary/10",
                          location === item.href ? "text-primary bg-primary/5" : "text-muted-foreground"
                        )}
                        data-testid={`link-leaderboard-${item.label.toLowerCase()}`}
                      >
                        <Icon size={16} />
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {isAuthenticated ? (
              <a href="/profile" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" data-testid="link-profile">
                <Avatar className="h-8 w-8 border-2 border-primary/20">
                  <AvatarImage src={user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`} />
                  <AvatarFallback>{(user?.firstName?.[0] || "U")}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{user?.firstName || "Profile"}</span>
              </a>
            ) : (
              <a href="/auth">
                <Button variant="outline" size="sm" className="gap-2 border-primary/50 hover:bg-primary/10 hover:text-primary" data-testid="button-login">
                  <LogIn size={16} />
                  Sign In
                </Button>
              </a>
            )}
          </div>

          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-background border-l border-border">
                <div className="flex flex-col gap-6 mt-10">
                  {navItems.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "text-lg font-medium transition-colors hover:text-primary",
                        location === item.href ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {item.label}
                    </a>
                  ))}
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-2">Leaderboards</p>
                    {leaderboardItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <a
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 py-2 text-base font-medium transition-colors hover:text-primary",
                            location === item.href ? "text-primary" : "text-muted-foreground"
                          )}
                        >
                          <Icon size={16} /> {item.label}
                        </a>
                      );
                    })}
                  </div>
                  {isAuthenticated ? (
                    <a href="/profile">
                      <Button className="w-full gap-2 font-display">
                        <User size={16} />
                        Profile
                      </Button>
                    </a>
                  ) : (
                    <a href="/auth">
                      <Button className="w-full gap-2 font-display">
                        <LogIn size={16} />
                        Sign In
                      </Button>
                    </a>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
        
        <div className="absolute top-16 left-0 right-0 z-40 pointer-events-none">
          <div className="pointer-events-auto">
            <PrizePoolTicker />
          </div>
        </div>
      </nav>
      <div className="h-10" /> 
    </>
  );
}
