import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const EXPERT_ANALYST_CODES = new Set(["NIKCOX", "JIMCAMPANIS", "BRYANTNELSON", "DEREK676"]);

export function isExpertAnalyst(referralCode: string | null | undefined): boolean {
  return !!referralCode && EXPERT_ANALYST_CODES.has(referralCode);
}

export function ExpertBadge({ className = "" }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-0.5 shrink-0 ${className}`}
            aria-label="Expert Analyst"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="10" cy="10" r="10" fill="#D4AF37" />
              <path
                d="M6 10.5L8.5 13L14 7.5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-yellow-900/90 border border-yellow-500/40 text-yellow-200 text-xs font-semibold px-2 py-1"
        >
          Expert Analyst
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
