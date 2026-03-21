import { useState, useEffect } from "react";
import { TrendingUp, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

export function PrizePoolTicker() {
  const [amount, setAmount] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [prevAmount, setPrevAmount] = useState(0);

  useEffect(() => {
    const fetchPool = async () => {
      try {
        const res = await fetch("/api/prize-pool");
        if (res.ok) {
          const data = await res.json();
          const newAmount = data.amount || 0;
          if (newAmount > prevAmount && prevAmount > 0) {
            setIsFlashing(true);
            setTimeout(() => setIsFlashing(false), 1500);
          }
          setPrevAmount(newAmount);
          setAmount(newAmount);
        }
      } catch {}
    };

    fetchPool();
    const interval = setInterval(fetchPool, 10000);
    return () => clearInterval(interval);
  }, [prevAmount]);

  return (
    <div className="bg-primary/10 border-b border-primary/20 h-10 flex items-center justify-center overflow-hidden relative">
      <div className="absolute inset-0 bg-primary/5 animate-pulse" />
      
      <div className="container mx-auto px-4 flex items-center justify-center gap-2 relative z-10">
        <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-widest hidden sm:inline">
          Live Community Prize Pool
        </span>
        <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-widest sm:hidden">
          Prize Pool
        </span>
        
        <div className={cn(
          "flex items-center gap-1 font-mono font-bold text-lg md:text-xl text-primary transition-all duration-300",
          isFlashing ? "scale-110 text-green-400 drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]" : ""
        )}>
          <DollarSign size={16} strokeWidth={3} className="mt-0.5" />
          {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        
        <TrendingUp size={16} className="text-primary animate-bounce" />
      </div>
    </div>
  );
}
