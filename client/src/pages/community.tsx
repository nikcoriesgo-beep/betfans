import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  MessageCircle, Plus, ArrowLeft, Send, Crown, Star, Pin,
  Clock, MessageSquare, Flame, Users,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Category = "all" | "general" | "nba" | "wnba" | "mlb" | "mls" | "nwsl" | "ncaab" | "ncaabb" | "nhl";

const categories: { value: Category; label: string }[] = [
  { value: "all", label: "All" },
  { value: "general", label: "General" },
  { value: "nba", label: "NBA" },
  { value: "wnba", label: "WNBA" },
  { value: "nhl", label: "NHL" },
  { value: "ncaab", label: "NCAAB" },
  { value: "mlb", label: "MLB" },
  { value: "ncaabb", label: "CBB" },
  { value: "mls", label: "MLS" },
  { value: "nwsl", label: "NWSL" },
];

function TierBadge({ tier }: { tier: string | null }) {
  if (tier === "legend") {
    return <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-[10px] gap-0.5 px-1 py-0"><Crown size={9} /> Legend</Badge>;
  }
  if (tier === "pro") {
    return <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] gap-0.5 px-1 py-0"><Star size={9} /> Pro</Badge>;
  }
  return null;
}

function CategoryBadge({ category }: { category: string | null }) {
  const colors: Record<string, string> = {
    nba: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    mlb: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    mls: "bg-green-500/20 text-green-400 border-green-500/30",
    ncaab: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    ncaabb: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    general: "bg-white/10 text-white/60 border-white/20",
  };
  return (
    <Badge className={cn("text-[10px] px-1.5 py-0", colors[category || "general"] || colors.general)}>
      {(category || "general").toUpperCase()}
    </Badge>
  );
}

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NewThreadDialog({ category }: { category: Category }) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [threadCategory, setThreadCategory] = useState(category === "all" ? "general" : category);

  const createThread = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/threads", { title, content, category: threadCategory });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
      setTitle("");
      setContent("");
      setOpen(false);
      toast({ title: "Thread created!" });
    },
    onError: () => toast({ title: "Failed to create thread", variant: "destructive" }),
  });

  if (!isAuthenticated) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 font-display" data-testid="button-new-thread">
          <Plus size={16} /> New Thread
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-white/10 max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Start a Discussion</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex gap-2 flex-wrap">
            {categories.filter(c => c.value !== "all").map(c => (
              <button
                key={c.value}
                onClick={() => setThreadCategory(c.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                  threadCategory === c.value
                    ? "bg-primary/20 border-primary/30 text-primary"
                    : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                )}
                data-testid={`button-category-${c.value}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Thread title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-background/50 border-white/10"
            maxLength={200}
            data-testid="input-thread-title"
          />
          <Textarea
            placeholder="Share your thoughts..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="bg-background/50 border-white/10 min-h-[120px]"
            maxLength={2000}
            data-testid="input-thread-content"
          />
          <Button
            onClick={() => createThread.mutate()}
            disabled={!title.trim() || !content.trim() || createThread.isPending}
            className="w-full font-display"
            data-testid="button-submit-thread"
          >
            {createThread.isPending ? "Posting..." : "Post Thread"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ThreadDetail({ threadId, onBack }: { threadId: number; onBack: () => void }) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [replyContent, setReplyContent] = useState("");

  const { data: thread } = useQuery<any>({
    queryKey: ["/api/threads", threadId],
    queryFn: async () => { const res = await fetch(`/api/threads/${threadId}`); return res.json(); },
  });

  const { data: replies = [] } = useQuery<any[]>({
    queryKey: ["/api/threads", threadId, "replies"],
    queryFn: async () => { const res = await fetch(`/api/threads/${threadId}/replies`); return res.json(); },
  });

  const createReply = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/threads/${threadId}/replies`, { content: replyContent });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadId, "replies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/threads"] });
      setReplyContent("");
    },
    onError: () => toast({ title: "Failed to post reply", variant: "destructive" }),
  });

  if (!thread) return null;

  const authorName = thread.user
    ? `${thread.user.firstName || ""} ${thread.user.lastName || ""}`.trim() || "Member"
    : "Member";

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="gap-2 text-muted-foreground hover:text-foreground" data-testid="button-back">
        <ArrowLeft size={16} /> Back to Threads
      </Button>

      <Card className="bg-card/40 border-white/10">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12 border-2 border-white/10 shrink-0">
              <AvatarImage src={thread.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${thread.userId}`} />
              <AvatarFallback>{authorName[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold">{authorName}</span>
                <TierBadge tier={thread.user?.membershipTier} />
                <CategoryBadge category={thread.category} />
                <span className="text-xs text-muted-foreground">{thread.createdAt ? timeAgo(thread.createdAt) : ""}</span>
              </div>
              <h2 className="text-xl font-display font-bold mb-3" data-testid="text-thread-title">{thread.title}</h2>
              <p className="text-muted-foreground whitespace-pre-wrap">{thread.content}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 px-1">
        <MessageCircle size={16} className="text-primary" />
        <span className="text-sm font-medium">{replies.length} {replies.length === 1 ? "Reply" : "Replies"}</span>
      </div>

      <div className="space-y-3">
        {replies.map((reply: any) => {
          const name = reply.user
            ? `${reply.user.firstName || ""} ${reply.user.lastName || ""}`.trim() || "Member"
            : "Member";
          return (
            <Card key={reply.id} className="bg-card/20 border-white/5" data-testid={`card-reply-${reply.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 border border-white/10 shrink-0">
                    <AvatarImage src={reply.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${reply.userId}`} />
                    <AvatarFallback>{name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm">{name}</span>
                      <TierBadge tier={reply.user?.membershipTier} />
                      <span className="text-xs text-muted-foreground">{reply.createdAt ? timeAgo(reply.createdAt) : ""}</span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reply.content}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isAuthenticated ? (
        <Card className="bg-card/30 border-white/10">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Textarea
                placeholder="Write a reply..."
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="bg-background/50 border-white/10 min-h-[80px] flex-1"
                maxLength={2000}
                data-testid="input-reply-content"
              />
            </div>
            <div className="flex justify-end mt-3">
              <Button
                onClick={() => createReply.mutate()}
                disabled={!replyContent.trim() || createReply.isPending}
                className="gap-2"
                data-testid="button-submit-reply"
              >
                <Send size={14} /> {createReply.isPending ? "Sending..." : "Reply"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card/20 border-white/5">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-3">Sign in to join the conversation</p>
            <a href="/auth"><Button variant="outline" className="gap-2" data-testid="button-login-reply">Sign In to Reply</Button></a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Community() {
  const [category, setCategory] = useState<Category>("all");
  const [selectedThread, setSelectedThread] = useState<number | null>(null);

  const { data: threads = [] } = useQuery<any[]>({
    queryKey: ["/api/threads", category],
    queryFn: async () => {
      const res = await fetch(`/api/threads?category=${category}`);
      return res.json();
    },
  });

  if (selectedThread !== null) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 pt-24 pb-20 max-w-3xl">
          <ThreadDetail threadId={selectedThread} onBack={() => setSelectedThread(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-20">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <MessageSquare size={32} className="text-primary" />
            <h1 className="text-4xl md:text-5xl font-display font-bold" data-testid="text-community-heading">
              Community <span className="text-primary">Threads</span>
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Discuss picks, strategies, and connect with fellow BetFans members
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <Badge variant="outline" className="border-primary/30 text-primary gap-1">
              <Users size={12} /> {threads.length} Active Threads
            </Badge>
          </div>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-6">
            <Tabs value={category} onValueChange={(v) => setCategory(v as Category)} className="flex-1">
              <TabsList className="bg-card/50 border border-white/10 h-10">
                {categories.map(c => (
                  <TabsTrigger key={c.value} value={c.value} className="text-xs" data-testid={`tab-${c.value}`}>
                    {c.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <NewThreadDialog category={category} />
          </div>

          <div className="space-y-3">
            {threads.length === 0 ? (
              <Card className="bg-card/20 border-white/5">
                <CardContent className="p-12 text-center">
                  <MessageSquare size={48} className="text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground text-lg">No threads yet</p>
                  <p className="text-muted-foreground/60 text-sm mt-1">Be the first to start a discussion!</p>
                </CardContent>
              </Card>
            ) : (
              threads.map((thread: any) => {
                const authorName = thread.user
                  ? `${thread.user.firstName || ""} ${thread.user.lastName || ""}`.trim() || "Member"
                  : "Member";
                return (
                  <Card
                    key={thread.id}
                    className={cn(
                      "bg-card/30 border-white/5 hover:border-primary/20 hover:bg-card/50 transition-all cursor-pointer",
                      thread.pinned && "border-primary/10 bg-primary/5"
                    )}
                    onClick={() => setSelectedThread(thread.id)}
                    data-testid={`card-thread-${thread.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10 border border-white/10 shrink-0 mt-0.5">
                          <AvatarImage src={thread.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${thread.userId}`} />
                          <AvatarFallback>{authorName[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {thread.pinned && <Pin size={12} className="text-primary" />}
                            <h3 className="font-bold text-base truncate">{thread.title}</h3>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{thread.content}</p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <Avatar className="h-5 w-5 border border-white/10">
                                <AvatarImage src={thread.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${thread.userId}`} />
                                <AvatarFallback className="text-[8px]">{authorName[0]}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs font-medium">{authorName}</span>
                              <TierBadge tier={thread.user?.membershipTier} />
                            </div>
                            <CategoryBadge category={thread.category} />
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock size={10} /> {thread.createdAt ? timeAgo(thread.createdAt) : ""}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <MessageCircle size={10} /> {thread.replyCount || 0} replies
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
