import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function ArticleReader() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);

  const params = new URLSearchParams(window.location.search);
  const url = params.get("url") || "";
  const title = params.get("title") || "Article";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="pt-16 flex flex-col flex-1">
        <div className="border-b border-white/5 bg-card/30 px-4 py-2 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs shrink-0"
            onClick={() => navigate("/news")}
            data-testid="button-back-to-news"
          >
            <ArrowLeft size={14} />
            Back to News
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground font-medium truncate">{title}</p>
            <p className="text-[10px] text-muted-foreground truncate">{url}</p>
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" data-testid="button-open-external">
                <ExternalLink size={12} />
                Open Original
              </Button>
            </a>
          )}
        </div>

        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <Loader2 size={32} className="animate-spin text-primary" />
            </div>
          )}
          {url ? (
            <iframe
              src={url}
              className="w-full h-full border-0"
              style={{ minHeight: "calc(100vh - 120px)" }}
              onLoad={() => setLoading(false)}
              title={title}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              data-testid="iframe-article"
            />
          ) : (
            <div className="flex items-center justify-center py-20">
              <p className="text-muted-foreground">No article URL provided</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
