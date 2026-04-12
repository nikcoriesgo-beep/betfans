import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface PlaceBetModalProps {
  trigger?: React.ReactNode;
  defaultGame?: {
    id: number;
    home: string;
    away: string;
    spread: string;
    total: string;
  };
}

export function PlaceBetModal({ trigger, defaultGame }: PlaceBetModalProps) {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState("spread");
  const [selectedSide, setSelectedSide] = useState<"home" | "away" | "over" | "under" | null>(null);
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const game = defaultGame || {
    id: 1,
    home: "Celtics",
    away: "Lakers",
    spread: "-4.5",
    total: "224.5"
  };

  const placeMutation = useMutation({
    mutationFn: async () => {
      let pick = "";
      if (selectedType === "spread") {
        pick = selectedSide === "home" ? `${game.home} ${game.spread}` : `${game.away} +${game.spread.replace("-", "")}`;
      } else if (selectedType === "moneyline") {
        pick = selectedSide === "home" ? `${game.home} ML` : `${game.away} ML`;
      } else {
        pick = selectedSide === "over" ? `Over ${game.total}` : `Under ${game.total}`;
      }

      const res = await apiRequest("POST", "/api/predictions", {
        gameId: game.id,
        predictionType: selectedType,
        pick,
        units: 1,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/predictions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setStep(3);
    },
    onError: () => {
      setStep(1);
    },
  });

  const handlePlace = () => {
    if (!isAuthenticated) {
      toast({ title: "Sign in to make picks", description: "Join BetFans to start predicting games and win cash.", variant: "default" });
      return;
    }
    setStep(2);
    placeMutation.mutate();
  };

  const reset = () => {
    setStep(1);
    setSelectedSide(null);
  };

  return (
    <Dialog onOpenChange={(open) => !open && setTimeout(reset, 200)}>
      <DialogTrigger asChild>
        {trigger || <Button data-testid="button-place-prediction">Place Prediction</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-white/10 backdrop-blur-xl">
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl text-center">New Prediction</DialogTitle>
            </DialogHeader>
            
            <div className="py-4">
              <div className="flex justify-between items-center bg-white/5 rounded-lg p-4 mb-6">
                <div className="text-center">
                  <div className="font-bold text-lg">{game.away}</div>
                  <div className="text-xs text-muted-foreground">Away</div>
                </div>
                <div className="text-xs font-mono text-muted-foreground">vs</div>
                <div className="text-center">
                  <div className="font-bold text-lg">{game.home}</div>
                  <div className="text-xs text-muted-foreground">Home</div>
                </div>
              </div>

              <Tabs defaultValue="spread" className="w-full mb-6" onValueChange={setSelectedType}>
                <TabsList className="grid w-full grid-cols-3 bg-black/20">
                  <TabsTrigger value="spread" data-testid="tab-spread">Spread</TabsTrigger>
                  <TabsTrigger value="moneyline" data-testid="tab-moneyline">Moneyline</TabsTrigger>
                  <TabsTrigger value="total" data-testid="tab-total">Total</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {selectedType === "spread" && (
                  <>
                    <Button 
                      variant="outline" 
                      className={cn("h-12 flex flex-col items-center justify-center border-white/10 hover:border-primary/50 hover:bg-primary/5", selectedSide === "away" && "border-primary bg-primary/10")}
                      onClick={() => setSelectedSide("away")}
                      data-testid="button-pick-away-spread"
                    >
                      <span className="text-xs text-muted-foreground">{game.away}</span>
                      <span className="font-mono font-bold">+{game.spread.replace("-", "")}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className={cn("h-12 flex flex-col items-center justify-center border-white/10 hover:border-primary/50 hover:bg-primary/5", selectedSide === "home" && "border-primary bg-primary/10")}
                      onClick={() => setSelectedSide("home")}
                      data-testid="button-pick-home-spread"
                    >
                      <span className="text-xs text-muted-foreground">{game.home}</span>
                      <span className="font-mono font-bold">{game.spread}</span>
                    </Button>
                  </>
                )}
                {selectedType === "moneyline" && (
                  <>
                    <Button 
                      variant="outline" 
                      className={cn("h-12 flex flex-col items-center justify-center border-white/10 hover:border-primary/50 hover:bg-primary/5", selectedSide === "away" && "border-primary bg-primary/10")}
                      onClick={() => setSelectedSide("away")}
                      data-testid="button-pick-away-ml"
                    >
                      <span className="text-xs text-muted-foreground">{game.away}</span>
                      <span className="font-mono font-bold">+160</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className={cn("h-12 flex flex-col items-center justify-center border-white/10 hover:border-primary/50 hover:bg-primary/5", selectedSide === "home" && "border-primary bg-primary/10")}
                      onClick={() => setSelectedSide("home")}
                      data-testid="button-pick-home-ml"
                    >
                      <span className="text-xs text-muted-foreground">{game.home}</span>
                      <span className="font-mono font-bold">-190</span>
                    </Button>
                  </>
                )}
                {selectedType === "total" && (
                  <>
                    <Button 
                      variant="outline" 
                      className={cn("h-12 flex flex-col items-center justify-center border-white/10 hover:border-primary/50 hover:bg-primary/5", selectedSide === "over" && "border-primary bg-primary/10")}
                      onClick={() => setSelectedSide("over")}
                      data-testid="button-pick-over"
                    >
                      <span className="text-xs text-muted-foreground">Over</span>
                      <span className="font-mono font-bold">{game.total}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className={cn("h-12 flex flex-col items-center justify-center border-white/10 hover:border-primary/50 hover:bg-primary/5", selectedSide === "under" && "border-primary bg-primary/10")}
                      onClick={() => setSelectedSide("under")}
                      data-testid="button-pick-under"
                    >
                      <span className="text-xs text-muted-foreground">Under</span>
                      <span className="font-mono font-bold">{game.total}</span>
                    </Button>
                  </>
                )}
              </div>

            </div>

            <DialogFooter>
              <Button className="w-full bg-primary text-primary-foreground font-bold shadow-[0_0_20px_rgba(34,197,94,0.3)]" onClick={handlePlace} disabled={!selectedSide} data-testid="button-lock-in">
                Lock It In
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground animate-pulse">Recording your prediction...</p>
          </div>
        )}

        {step === 3 && (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-primary mb-2">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-2xl font-display font-bold">Prediction Live!</h3>
            <p className="text-muted-foreground max-w-[200px]">
              Your prediction has been recorded. Good luck!
            </p>
            <Button variant="outline" className="mt-4" onClick={reset} data-testid="button-make-another">Make Another</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
