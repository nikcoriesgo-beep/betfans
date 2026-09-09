import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  compact?: boolean;
  className?: string;
}

export function PrizePoolQualRule({ compact = false, className }: Props) {
  if (compact) {
    return (
      <div className={cn("rounded-lg border border-yellow-400/40 bg-yellow-500/10 px-4 py-3 flex items-start gap-3", className)} data-testid="prize-pool-qual-rule-compact">
        <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-yellow-100/90 leading-relaxed">
            <span className="font-black text-yellow-300">Prize Pool Rule: </span>
            You must pick <strong className="text-yellow-200">every MLB, NBA, NHL & NFL game</strong> scheduled that day to qualify for payouts. Missing even one required game disqualifies you.
          </p>
          <p className="text-xs text-yellow-100/80 leading-relaxed">
            NCAA Division I FBS and WBC Boxing events are optional Skill Play picks. They count toward records and rankings but are not required for Prize Pool qualification.
          </p>
          <p className="mt-1.5 text-xs text-yellow-300/50">* All members must predict over 2,000 MLB games to qualify for the annual prize pool payout.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border-2 border-yellow-400/50 bg-yellow-500/10 p-5", className)} data-testid="prize-pool-qual-rule">
      <div className="flex items-start gap-3">
        <AlertTriangle size={22} className="text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-yellow-300 text-base mb-1 uppercase tracking-wide">Prize Pool Qualification Rule</p>
          <p className="text-sm text-yellow-100/90 leading-relaxed mb-2">
            To qualify for <strong className="text-yellow-200">any prize pool payout</strong>, you must:
          </p>
          <ul className="space-y-1.5 text-sm text-yellow-100/90">
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-yellow-400 shrink-0" />
              Pick <strong className="text-yellow-200">every MLB, NBA, NHL & NFL game</strong> scheduled that day
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-yellow-400 shrink-0" />
              All required sports count — missing <strong className="text-yellow-200">even one game</strong> disqualifies you
            </li>
          </ul>
          <p className="mt-2 text-xs text-yellow-300/70">Applies to daily prize pool payouts.</p>
          <p className="mt-2 text-xs text-yellow-300/50">* All members must predict over 2,000 MLB games to qualify for the annual prize pool payout.</p>
          <div className="mt-3 border-t border-yellow-400/20 pt-3 space-y-1.5">
            <p className="text-xs font-bold text-yellow-300 uppercase tracking-wide">Optional Skill Play Sports</p>
            <div className="flex items-start gap-2 text-xs text-yellow-100/80">
              <CheckCircle2 size={12} className="text-yellow-400 shrink-0 mt-0.5" />
              <span><strong className="text-yellow-200">NCAA Division I FBS 2026™</strong> games are optional Skill Play picks. They count toward records and rankings but are not required for Prize Pool qualification.</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-yellow-100/80">
              <CheckCircle2 size={12} className="text-yellow-400 shrink-0 mt-0.5" />
              <span><strong className="text-yellow-200">WBC Boxing</strong> events are optional Skill Play picks. They count toward records and rankings but are not required for Prize Pool qualification.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
