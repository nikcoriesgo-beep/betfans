import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Trophy, Calendar, Clock, Zap } from "lucide-react";

interface WCGame {
  id: string;
  name: string;
  date: string;
  status: string;
  statusDetail: string;
  homeTeam: string;
  homeAbbr: string;
  homeScore: string | null;
  awayTeam: string;
  awayAbbr: string;
  awayScore: string | null;
  venue: string;
  group: string;
}

const WC_DATES = [
  { label: "Jun 11", value: "20260611" },
  { label: "Jun 12", value: "20260612" },
  { label: "Jun 13", value: "20260613" },
  { label: "Jun 14", value: "20260614" },
  { label: "Jun 15", value: "20260615" },
  { label: "Jun 16", value: "20260616" },
  { label: "Jun 17", value: "20260617" },
  { label: "Jun 18", value: "20260618" },
  { label: "Jun 19", value: "20260619" },
  { label: "Jun 20", value: "20260620" },
  { label: "Jun 21", value: "20260621" },
  { label: "Jun 22", value: "20260622" },
  { label: "Jun 23", value: "20260623" },
  { label: "Jun 24", value: "20260624" },
  { label: "Jun 25", value: "20260625" },
  { label: "Jun 26", value: "20260626" },
];

function todayStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" })
    .format(new Date())
    .replace(/-/g, "");
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function StatusBadge({ status, detail }: { status: string; detail: string }) {
  if (status === "in") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/40 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        LIVE
      </span>
    );
  }
  if (status === "post") {
    return <span className="text-xs text-slate-400">Final</span>;
  }
  return <span className="text-xs text-slate-500">{detail || "Upcoming"}</span>;
}

export default function WorldCup() {
  const defaultDate = (() => {
    const t = todayStr();
    const found = WC_DATES.find(d => d.value === t);
    return found ? t : WC_DATES[0].value;
  })();

  const [selectedDate, setSelectedDate] = useState(defaultDate);

  const { data, isLoading } = useQuery<{ events: WCGame[] }>({
    queryKey: ["/api/world-cup/schedule", selectedDate],
    queryFn: () =>
      fetch(`/api/world-cup/schedule?date=${selectedDate}`).then(r => r.json()),
    staleTime: 60_000,
  });

  const games = data?.events || [];

  const grouped = games.reduce<Record<string, WCGame[]>>((acc, g) => {
    const key = g.group || "Group Stage";
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});

  return (
    <div className="min-h-screen" style={{ background: "hsl(220 30% 8%)" }}>
      <div className="max-w-2xl mx-auto px-4 pb-20">
        <div className="pt-6 pb-4 flex items-center gap-3">
          <Link href="/daily-picks">
            <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-300" />
            </button>
          </Link>
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            <div>
              <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Chakra Petch', sans-serif" }}>
                FIFA World Cup 2026™
              </h1>
              <p className="text-xs text-slate-400">Jun 11 – Jul 19 · All games qualify for Prize Pool</p>
            </div>
          </div>
        </div>

        <div
          className="rounded-xl p-3 mb-5 text-sm"
          style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)" }}
        >
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
            <p className="text-green-300">
              Pick every World Cup game + all MLB, NBA &amp; NHL games each day to qualify for the daily Prize Pool.
            </p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-3 mb-5 scrollbar-hide">
          {WC_DATES.map(d => (
            <button
              key={d.value}
              onClick={() => setSelectedDate(d.value)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedDate === d.value
                  ? "text-black font-bold"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
              style={selectedDate === d.value ? { background: "hsl(142 70% 50%)" } : {}}
            >
              {d.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No games scheduled for this date</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([group, groupGames]) => (
              <div key={group}>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                  {group}
                </div>
                <div className="space-y-2">
                  {groupGames.map(game => {
                    const isLive = game.status === "in";
                    const isDone = game.status === "post";
                    const hasScore = isDone || isLive;

                    return (
                      <div
                        key={game.id}
                        className="rounded-xl p-4 transition-all"
                        style={{
                          background: isLive
                            ? "rgba(74,222,128,0.06)"
                            : "rgba(255,255,255,0.04)",
                          border: isLive
                            ? "1px solid rgba(74,222,128,0.3)"
                            : "1px solid rgba(255,255,255,0.07)",
                          backdropFilter: "blur(8px)",
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <StatusBadge status={game.status} detail={game.statusDetail} />
                          {!hasScore && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {fmtTime(game.date)} PT
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-white font-semibold text-sm">{game.awayTeam}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{game.awayAbbr} · Away</div>
                          </div>

                          {hasScore ? (
                            <div className="flex items-center gap-3 px-4">
                              <span
                                className={`text-2xl font-bold tabular-nums ${
                                  isDone && Number(game.awayScore) > Number(game.homeScore)
                                    ? "text-green-400"
                                    : "text-white"
                                }`}
                              >
                                {game.awayScore ?? "-"}
                              </span>
                              <span className="text-slate-600 font-light">–</span>
                              <span
                                className={`text-2xl font-bold tabular-nums ${
                                  isDone && Number(game.homeScore) > Number(game.awayScore)
                                    ? "text-green-400"
                                    : "text-white"
                                }`}
                              >
                                {game.homeScore ?? "-"}
                              </span>
                            </div>
                          ) : (
                            <div className="px-4">
                              <span className="text-slate-600 text-lg font-light">vs</span>
                            </div>
                          )}

                          <div className="flex-1 text-right">
                            <div className="text-white font-semibold text-sm">{game.homeTeam}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{game.homeAbbr} · Home</div>
                          </div>
                        </div>

                        {game.venue && (
                          <div className="mt-2 text-xs text-slate-600 text-center">{game.venue}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
