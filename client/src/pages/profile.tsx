import { Navbar } from "@/components/layout/Navbar";
import { MemberChampions } from "@/pages/master-championships";
import { AdBannerTop, AdBannerInline } from "@/components/AdBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trophy, Calendar, Target, TrendingUp, Settings, CreditCard, Shield, Wallet,
  ArrowUpRight, ArrowDownLeft, LogOut, Camera, Loader2, MessageSquare,
  Send, Plus, Clock, MessageCircle, ArrowLeft, Crown, Star, Pin, Lock, KeyRound, Mail, CheckCircle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

function TierBadge({ tier }: { tier: string | null }) {
  if (tier === "legend") return <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-[10px] gap-0.5 px-1 py-0"><Crown size={9} /> Legend</Badge>;
  return null;
}

function CategoryBadge({ category }: { category: string | null }) {
  const colors: Record<string, string> = {
    nba: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    nhl: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    mlb: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    mls: "bg-green-500/20 text-green-400 border-green-500/30",
    ncaab: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    ncaabb: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    general: "bg-white/10 text-white/60 border-white/20",
  };
  return <Badge className={cn("text-[10px] px-1.5 py-0", colors[category || "general"] || colors.general)}>{(category || "general").toUpperCase()}</Badge>;
}

function NewThreadDialog({ profileUserId, profileName }: { profileUserId: string; profileName: string }) {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const isOwn = user?.id === profileUserId;

  const cats = [
    { value: "general", label: "General" },
    { value: "nba", label: "NBA" },
    { value: "nhl", label: "NHL" },
    { value: "ncaab", label: "NCAAB" },
    { value: "mlb", label: "MLB" },
    { value: "mls", label: "MLS" },
  ];

  const createThread = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/threads", { title, content, category, profileUserId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/threads/profile", profileUserId] });
      setTitle(""); setContent(""); setOpen(false);
      toast({ title: "Thread posted!" });
    },
    onError: () => toast({ title: "Failed to create thread", variant: "destructive" }),
  });

  if (!isAuthenticated) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" data-testid="button-new-thread">
          <Plus size={14} /> {isOwn ? "New Thread" : `Write to ${profileName}`}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-white/10 max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {isOwn ? "Start a Discussion" : `Post on ${profileName}'s Wall`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex gap-2 flex-wrap">
            {cats.map(c => (
              <button key={c.value} onClick={() => setCategory(c.value)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  category === c.value ? "bg-primary/20 border-primary/30 text-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                )} data-testid={`button-category-${c.value}`}>{c.label}</button>
            ))}
          </div>
          <Input placeholder="Thread title..." value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background/50 border-white/10" maxLength={200} data-testid="input-thread-title" />
          <Textarea placeholder={isOwn ? "Share your thoughts..." : `Say something to ${profileName}...`} value={content} onChange={(e) => setContent(e.target.value)} className="bg-background/50 border-white/10 min-h-[120px]" maxLength={2000} data-testid="input-thread-content" />
          <Button onClick={() => createThread.mutate()} disabled={!title.trim() || !content.trim() || createThread.isPending} className="w-full font-display" data-testid="button-submit-thread">
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
      queryClient.invalidateQueries({ queryKey: ["/api/threads/user"] });
      setReplyContent("");
    },
    onError: () => toast({ title: "Failed to post reply", variant: "destructive" }),
  });

  if (!thread) return null;
  const authorName = thread.user ? `${thread.user.firstName || ""} ${thread.user.lastName || ""}`.trim() || "Member" : "Member";

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-muted-foreground hover:text-foreground" data-testid="button-back">
        <ArrowLeft size={14} /> Back to Threads
      </Button>
      <Card className="bg-card/40 border-white/10">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10 border border-white/10 shrink-0">
              <AvatarImage src={thread.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${thread.userId}`} />
              <AvatarFallback>{authorName[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold text-sm">{authorName}</span>
                <TierBadge tier={thread.user?.membershipTier} />
                <CategoryBadge category={thread.category} />
                <span className="text-xs text-muted-foreground">{thread.createdAt ? timeAgo(thread.createdAt) : ""}</span>
              </div>
              <h3 className="text-lg font-display font-bold mb-2">{thread.title}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{thread.content}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 px-1">
        <MessageCircle size={14} className="text-primary" />
        <span className="text-xs font-medium">{replies.length} {replies.length === 1 ? "Reply" : "Replies"}</span>
      </div>

      <div className="space-y-2">
        {replies.map((reply: any) => {
          const name = reply.user ? `${reply.user.firstName || ""} ${reply.user.lastName || ""}`.trim() || "Member" : "Member";
          return (
            <Card key={reply.id} className="bg-card/20 border-white/5" data-testid={`card-reply-${reply.id}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-2.5">
                  <Avatar className="h-7 w-7 border border-white/10 shrink-0">
                    <AvatarImage src={reply.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${reply.userId}`} />
                    <AvatarFallback className="text-[10px]">{name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-xs">{name}</span>
                      <TierBadge tier={reply.user?.membershipTier} />
                      <span className="text-[10px] text-muted-foreground">{reply.createdAt ? timeAgo(reply.createdAt) : ""}</span>
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
        <div className="flex gap-2 items-end">
          <Textarea placeholder="Write a reply..." value={replyContent} onChange={(e) => setReplyContent(e.target.value)}
            className="bg-background/50 border-white/10 min-h-[60px] flex-1 text-sm" maxLength={2000} data-testid="input-reply-content" />
          <Button size="sm" onClick={() => createReply.mutate()} disabled={!replyContent.trim() || createReply.isPending} className="gap-1.5 shrink-0" data-testid="button-submit-reply">
            <Send size={12} /> Reply
          </Button>
        </div>
      ) : (
        <div className="text-center py-4">
          <a href="/auth"><Button variant="outline" size="sm" data-testid="button-login-reply">Sign In to Reply</Button></a>
        </div>
      )}
    </div>
  );
}

function MemberDailyPicks({ targetUserId, profileName }: { targetUserId: string; profileName: string }) {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const viewerTier = user?.membershipTier || "free";
  const canView = viewerTier === "legend";

  const { data: memberPicks = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/users", targetUserId, "predictions"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${targetUserId}/predictions`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated && canView,
  });

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (!isAuthenticated) {
    return (
      <Card className="bg-card/30 border-white/5">
        <CardContent className="p-8 text-center">
          <Lock size={32} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-2">Sign in to view {profileName}'s picks</p>
          <a href="/auth"><Button variant="outline" size="sm" data-testid="button-login-picks">Sign In</Button></a>
        </CardContent>
      </Card>
    );
  }

  if (!canView) {
    return (
      <Card className="bg-card/30 border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background/90 z-10 flex flex-col items-center justify-center">
          <Lock size={40} className="text-primary/40 mb-4" />
          <h3 className="text-lg font-display font-bold mb-2">Legend Feature</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-xs">Legend members can view {profileName}'s daily picks and predictions</p>
          <Button
            className="bg-primary text-primary-foreground shadow-[0_0_15px_rgba(34,197,94,0.3)] gap-2"
            onClick={() => navigate("/membership")}
            data-testid="button-upgrade-view-picks"
          >
            <Crown size={14} /> Become a Legend
          </Button>
        </div>
        <CardContent className="p-4 space-y-2 filter blur-sm pointer-events-none select-none">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-white/5">
              <div className="flex items-center gap-4">
                <div className="w-2 h-12 rounded-full bg-green-500/30" />
                <div><div className="font-bold text-sm text-muted-foreground">Team Name ML</div><div className="text-xs text-muted-foreground">moneyline</div></div>
              </div>
              <div className="text-right"><div className="font-mono font-bold text-sm text-muted-foreground">+1.50u</div><div className="text-xs text-muted-foreground">Mar 15</div></div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="bg-card/30 border-white/5">
        <CardContent className="p-8 text-center">
          <Loader2 size={24} className="animate-spin text-primary mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/30 border-white/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Target size={18} className="text-primary" />{profileName}'s Daily Picks</CardTitle>
        <CardDescription>{memberPicks.length} prediction{memberPicks.length !== 1 ? "s" : ""}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {memberPicks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No predictions yet</p>
          ) : (
            memberPicks.slice(0, 20).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors" data-testid={`row-member-pick-${p.id}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-12 rounded-full ${p.result === 'loss' ? 'bg-red-500' : p.result === 'win' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <div><div className="font-bold text-sm">{p.pick}</div><div className="text-xs text-muted-foreground">{p.predictionType}</div></div>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold text-sm ${p.result === 'loss' ? 'text-red-400' : p.result === 'win' ? 'text-green-400' : 'text-yellow-400'}`}>
                    {p.result === 'win' ? 'Win' : p.result === 'loss' ? 'Loss' : 'Pending'}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.createdAt ? formatDate(p.createdAt) : ""}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileThreads({ userId, isOwn, profileName }: { userId: string; isOwn: boolean; profileName: string }) {
  const { isAuthenticated } = useAuth();
  const [selectedThread, setSelectedThread] = useState<number | null>(null);

  const { data: threads = [] } = useQuery<any[]>({
    queryKey: ["/api/threads/profile", userId],
    queryFn: async () => { const res = await fetch(`/api/threads/profile/${userId}`); return res.json(); },
  });

  if (selectedThread !== null) {
    return <ThreadDetail threadId={selectedThread} onBack={() => setSelectedThread(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{threads.length} thread{threads.length !== 1 ? "s" : ""} on {isOwn ? "your" : `${profileName}'s`} wall</p>
        <NewThreadDialog profileUserId={userId} profileName={profileName} />
      </div>

      {!isAuthenticated && (
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">Sign in to post threads and replies on {profileName}'s wall</p>
            <a href="/auth"><Button variant="outline" size="sm" data-testid="button-login-threads">Sign In</Button></a>
          </CardContent>
        </Card>
      )}

      {threads.length === 0 ? (
        <Card className="bg-card/20 border-white/5">
          <CardContent className="p-8 text-center">
            <MessageSquare size={40} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{isOwn ? "No threads on your wall yet" : `No threads on ${profileName}'s wall yet`}</p>
            {isAuthenticated && <p className="text-xs text-muted-foreground/60 mt-1">{isOwn ? "Start a discussion to connect with other members!" : `Be the first to write something on ${profileName}'s wall!`}</p>}
          </CardContent>
        </Card>
      ) : (
        threads.map((thread: any) => {
          const authorName = thread.user ? `${thread.user.firstName || ""} ${thread.user.lastName || ""}`.trim() || "Member" : "Member";
          return (
            <Card key={thread.id} className={cn(
              "bg-card/30 border-white/5 hover:border-primary/20 hover:bg-card/50 transition-all cursor-pointer",
              thread.pinned && "border-primary/10 bg-primary/5"
            )} onClick={() => setSelectedThread(thread.id)} data-testid={`card-thread-${thread.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 border border-white/10 shrink-0 mt-0.5">
                    <AvatarImage src={thread.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${thread.userId}`} />
                    <AvatarFallback className="text-xs">{authorName[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {thread.pinned && <Pin size={12} className="text-primary" />}
                      <span className="font-bold text-xs">{authorName}</span>
                      <TierBadge tier={thread.user?.membershipTier} />
                      <span className="text-[10px] text-muted-foreground">{thread.createdAt ? timeAgo(thread.createdAt) : ""}</span>
                    </div>
                    <h3 className="font-bold text-sm mb-1">{thread.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{thread.content}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <CategoryBadge category={thread.category} />
                      <span className="flex items-center gap-1"><MessageCircle size={10} /> {thread.replyCount || 0} replies</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function ChangePasswordDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const changePw = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update password");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Password updated!", description: "Your password has been changed." });
      setOpen(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast({ title: "Passwords don't match", description: "New password and confirm password must match.", variant: "destructive" });
      return;
    }
    if (newPw.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    changePw.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" data-testid="button-change-password">
          <KeyRound size={16} /> Change Password
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <KeyRound size={18} className="text-primary" /> Change Password
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Current Password</label>
            <Input
              type="password"
              placeholder="Enter current password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="bg-background/50 border-white/10"
              required
              data-testid="input-current-password"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">New Password</label>
            <Input
              type="password"
              placeholder="New password (6+ characters)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="bg-background/50 border-white/10"
              required
              minLength={6}
              data-testid="input-new-password"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Confirm New Password</label>
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="bg-background/50 border-white/10"
              required
              data-testid="input-confirm-password"
            />
          </div>
          <Button
            type="submit"
            disabled={changePw.isPending || !currentPw || !newPw || !confirmPw}
            className="w-full font-display"
            data-testid="button-submit-change-password"
          >
            {changePw.isPending ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Profile() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const viewUserId = params.get("user");
  const isOwnProfile = !viewUserId || (isAuthenticated && viewUserId === user?.id);

  const { data: viewedUser } = useQuery<any>({
    queryKey: ["/api/users", viewUserId, "profile"],
    queryFn: async () => { const res = await fetch(`/api/users/${viewUserId}/profile`); if (!res.ok) return null; return res.json(); },
    enabled: !!viewUserId && !isOwnProfile,
  });

  const profileUser = isOwnProfile ? user : viewedUser;
  const profileUserId = isOwnProfile ? user?.id : viewUserId;

  const avatarUpload = useMutation({
    mutationFn: async (dataUrl: string) => {
      const res = await fetch("/api/user/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: dataUrl }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profile photo updated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: () => toast({ title: "Upload failed", description: "Please try a smaller image.", variant: "destructive" }),
  });

  const handleAvatarClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: "File too large", description: "Please select an image under 10MB.", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 400;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        avatarUpload.mutate(dataUrl);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const [payoutEmailInput, setPayoutEmailInput] = useState(user?.paypalPayoutEmail || "");
  const [payoutEmailEditing, setPayoutEmailEditing] = useState(false);

  const updatePayoutEmail = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/user/payout-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Payout email saved!", description: "Daily winnings will be sent to this PayPal address." });
      setPayoutEmailEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const showSignInPrompt = !isLoading && !isAuthenticated && !viewUserId;

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: async () => { const res = await fetch("/api/stats", { credentials: "include" }); if (!res.ok) return { wins: 0, losses: 0, profit: 0, roi: 0, streak: 0 }; return res.json(); },
    enabled: isAuthenticated && isOwnProfile,
  });

  const targetUserId = isOwnProfile ? user?.id : viewUserId;
  const { data: sportStats } = useQuery<{ overall: any; bySport: any[] }>({
    queryKey: ["/api/users", targetUserId, "sport-stats"],
    queryFn: async () => { const res = await fetch(`/api/users/${targetUserId}/sport-stats`); if (!res.ok) return { overall: null, bySport: [] }; return res.json(); },
    enabled: !!targetUserId,
  });

  const { data: predictions = [] } = useQuery<any[]>({
    queryKey: ["/api/predictions"],
    queryFn: async () => { const res = await fetch("/api/predictions", { credentials: "include" }); if (!res.ok) return []; return res.json(); },
    enabled: isAuthenticated && isOwnProfile,
  });

  const { data: transactions = [] } = useQuery<any[]>({
    queryKey: ["/api/transactions"],
    queryFn: async () => { const res = await fetch("/api/transactions", { credentials: "include" }); if (!res.ok) return []; return res.json(); },
    enabled: isAuthenticated && isOwnProfile,
  });

  const { data: referralStats } = useQuery<any>({
    queryKey: ["/api/referral/stats"],
    queryFn: async () => { const res = await fetch("/api/referral/stats", { credentials: "include" }); if (!res.ok) return { monthlyIncome: 0 }; return res.json(); },
    enabled: isAuthenticated && isOwnProfile,
  });

  const { data: userPayouts = [] } = useQuery<any[]>({
    queryKey: ["/api/payouts"],
    queryFn: async () => { const res = await fetch("/api/payouts", { credentials: "include" }); if (!res.ok) return []; return res.json(); },
    enabled: isAuthenticated && isOwnProfile,
  });


  if (!viewUserId && (isLoading || (!user && !showSignInPrompt))) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  if (!isOwnProfile && !viewedUser) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  const displayName = profileUser ? `${profileUser.firstName || ""} ${profileUser.lastName || ""}`.trim() || "Member" : "Member";
  const mlbStat = sportStats?.bySport?.find((s: any) => s.league === "MLB");
  const mlbWinRate = mlbStat && mlbStat.total > 0 ? mlbStat.winRate.toFixed(1) : "0.0";
  const tier = profileUser?.membershipTier || "rookie";
  const tierLabel = tier === "legend" ? "LEGEND" : tier === "free_play" ? "FREE PLAY" : "MEMBER";

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const _now = new Date();
  const monthlyPrize = userPayouts
    .filter((p: any) => p.status !== "reversed" && new Date(p.createdAt).getFullYear() === _now.getFullYear() && new Date(p.createdAt).getMonth() === _now.getMonth())
    .reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0);
  const ytdPrize = userPayouts
    .filter((p: any) => p.status !== "reversed" && new Date(p.createdAt).getFullYear() === _now.getFullYear())
    .reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0);

  if (showSignInPrompt) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
      <AdBannerTop />
        <div className="container mx-auto px-4 pt-32 pb-12 flex flex-col items-center justify-center text-center gap-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Lock size={36} className="text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold">Sign In to View Your Profile</h1>
          <p className="text-muted-foreground max-w-sm">Your picks, wallet, and stats are waiting. Sign in to access your personal dashboard.</p>
          <div className="flex gap-3">
            <a href="/auth"><Button className="gap-2 font-display font-bold px-6">Sign In</Button></a>
            <a href="/membership"><Button variant="outline" className="gap-2 px-6">Join BetFans</Button></a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AdBannerTop />
      <div className="container mx-auto px-4 pt-24 pb-12">

        <div className="flex flex-col md:flex-row gap-8 items-start mb-12">
          <div className="relative group">
            <Avatar className="w-32 h-32 border-4 border-primary/20">
              <AvatarImage src={profileUser?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileUserId}`} />
              <AvatarFallback>{displayName[0]}</AvatarFallback>
            </Avatar>
            {isOwnProfile && (
              <>
                <button onClick={handleAvatarClick} disabled={avatarUpload.isPending}
                  className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                  data-testid="button-upload-avatar">
                  {avatarUpload.isPending ? <Loader2 size={24} className="text-white animate-spin" /> : (
                    <div className="flex flex-col items-center gap-1"><Camera size={24} className="text-white" /><span className="text-white text-xs font-medium">Change Photo</span></div>
                  )}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" data-testid="input-avatar-file" />
              </>
            )}
            <Badge className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-4 border-background px-3 py-1" data-testid="badge-membership-tier">
              {tierLabel}
            </Badge>
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-4xl font-display font-bold mb-2" data-testid="text-profile-name">{displayName}</h1>
                {(profileUser as any)?.certifiedExpert && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 px-2 py-0.5 text-xs font-semibold gap-1">
                      <Star size={10} className="fill-amber-400" /> Certified Expert Legend
                    </Badge>
                  </div>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><Calendar size={14} /> Joined {profileUser?.createdAt ? formatDate(profileUser.createdAt) : "Recently"}</span>
                  {profileUser?.city && <span className="flex items-center gap-1">📍 {[profileUser.city, profileUser.state].filter(Boolean).join(", ")}</span>}
                  {isOwnProfile && <span className="flex items-center gap-1"><Target size={14} /> {predictions.length} Predictions</span>}
                  {isOwnProfile && (user as any)?.phone && (
                    <span className="flex items-center gap-1 font-mono text-xs text-green-400">
                      📱 {String((user as any).phone).replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}
                    </span>
                  )}
                </div>
              </div>
              {isOwnProfile && (
                <div className="flex flex-wrap gap-3">
                  <ChangePasswordDialog />
                  <Button variant="outline" className="gap-2" data-testid="button-logout" onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                    window.location.href = "/";
                  }}><LogOut size={16} /> Logout</Button>
                  {user?.paypalSubscriptionId && (
                    <a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" className="gap-2" data-testid="button-manage-subscription"><CreditCard size={16} /> Subscription</Button>
                    </a>
                  )}
                </div>
              )}
            </div>

            {isOwnProfile && (
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="p-4 rounded-xl bg-card/30 border border-border">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">MLB Win Rate</div>
                  <div className="text-2xl font-bold font-mono text-primary" data-testid="text-win-rate">{mlbWinRate}%</div>
                  {mlbStat && <div className="text-[10px] text-muted-foreground mt-0.5">{mlbStat.wins}W – {mlbStat.losses}L</div>}
                </div>
                {tier !== "free_play" && <div className="p-4 rounded-xl bg-card/30 border border-border">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Monthly Residual Income</div>
                  <div className="text-2xl font-bold font-mono text-green-400" data-testid="text-monthly-residual">${(referralStats?.monthlyIncome || 0).toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">per month from referrals</div>
                </div>}
                {tier !== "free_play" && <div className="p-4 rounded-xl bg-card/30 border border-border">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Monthly Prize Winnings</div>
                  <div className="text-2xl font-bold font-mono text-green-400" data-testid="text-monthly-prize">${monthlyPrize.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">this month</div>
                </div>}
                {tier !== "free_play" && <div className="p-4 rounded-xl bg-card/30 border border-border">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">YTD Prize Winnings</div>
                  <div className="text-2xl font-bold font-mono text-green-400" data-testid="text-ytd-prize">${ytdPrize.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{_now.getFullYear()} total</div>
                </div>}
              </div>
            )}
          </div>
        </div>

        {profileUserId && <MemberChampions userId={profileUserId} />}
        {tier === "free_play" && <p className="text-sm text-muted-foreground mb-8">Free Play includes daily picks and Master Championships, not Prize Pool entries, payouts, or referral cash rewards. <a href="/membership" className="text-primary hover:underline">Compare memberships</a></p>}
        {sportStats && (sportStats.overall?.total > 0 || sportStats.bySport?.length > 0) && (
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Trophy size={18} className="text-primary" />
              <h2 className="text-lg font-display font-bold">Pick Score Breakdown</h2>
            </div>

            {/* Combined Overall Score */}
            {sportStats.overall && sportStats.overall.total > 0 && (
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Combined Score — All Sports</div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-bold text-2xl">
                        <span className="text-green-400">{sportStats.overall.wins}W</span>
                        <span className="text-muted-foreground/40 mx-1">-</span>
                        <span className="text-red-400">{sportStats.overall.losses}L</span>
                      </span>
                      <span className="text-primary font-mono font-bold text-xl">{sportStats.overall.winRate}%</span>
                      <span className="text-xs text-muted-foreground">{sportStats.overall.total} graded picks</span>
                    </div>
                  </div>
                  {sportStats.overall.streak > 0 && (
                    <div className="flex items-center gap-1 text-orange-500 font-bold text-sm">
                      <TrendingUp size={16} /> {sportStats.overall.streak} WIN STREAK
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Per-Sport Grid */}
            {sportStats.bySport.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {sportStats.bySport.map((s: any) => {
                  const pct = s.winRate;
                  const isHot = pct >= 60;
                  const isCold = pct < 40;
                  return (
                    <div
                      key={s.league}
                      className={cn(
                        "p-3 rounded-xl border text-center",
                        isHot ? "bg-green-500/10 border-green-500/20" : isCold ? "bg-red-500/10 border-red-500/20" : "bg-card/30 border-white/10"
                      )}
                      data-testid={`card-sport-${s.league}`}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{s.league}</div>
                      <div className="font-mono text-sm mb-1">
                        <span className="text-green-400 font-bold">{s.wins}</span>
                        <span className="text-muted-foreground/40">-</span>
                        <span className="text-red-400 font-bold">{s.losses}</span>
                      </div>
                      <div className={cn(
                        "font-mono font-bold text-base",
                        isHot ? "text-green-400" : isCold ? "text-red-400" : "text-primary"
                      )}>
                        {pct}%
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{s.total} picks</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isOwnProfile ? (
          <Tabs defaultValue="threads" className="space-y-8">
            <TabsList className="bg-black/20">
              <TabsTrigger value="threads" data-testid="tab-threads">Threads</TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">Betting History</TabsTrigger>
              {tier !== "free_play" && <TabsTrigger value="wallet" data-testid="tab-wallet">Wallet & Payouts</TabsTrigger>}
              <TabsTrigger value="badges" data-testid="tab-badges">Badges & Awards</TabsTrigger>
              <TabsTrigger value="subscription" data-testid="tab-subscription">Membership</TabsTrigger>
            </TabsList>

            <TabsContent value="threads">
              <ProfileThreads userId={user!.id} isOwn={true} profileName={displayName} />
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <Card className="bg-card/30 border-white/5">
                <CardHeader><CardTitle>Recent Predictions</CardTitle><CardDescription>Your prediction history</CardDescription></CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {predictions.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No predictions yet. <a href="/daily-picks" className="text-primary hover:underline">Make your first daily picks.</a></p>
                    ) : (
                      predictions.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors" data-testid={`row-prediction-${p.id}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-12 rounded-full ${p.result === 'loss' ? 'bg-red-500' : p.result === 'win' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                            <div><div className="font-bold">{p.pick}</div><div className="text-sm text-muted-foreground">Type: {p.predictionType}</div></div>
                          </div>
                          <div className="text-right">
                            <div className={`font-mono font-bold ${p.result === 'loss' ? 'text-red-400' : p.result === 'win' ? 'text-green-400' : 'text-yellow-400'}`}>
                              {p.result === 'win' ? 'Win' : p.result === 'loss' ? 'Loss' : 'Pending'}
                            </div>
                            <div className="text-xs text-muted-foreground">{p.createdAt ? formatDate(p.createdAt) : ""}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="wallet">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-8">
                  <Card className="bg-card/30 border-white/5">
                    <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="text-primary" />Available Balance</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-5xl font-bold font-display mb-2" data-testid="text-balance-large">${parseFloat(user?.walletBalance || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                      <p className="text-sm text-muted-foreground mb-6">Available for withdrawal</p>
                      <div className="flex gap-4">
                        <Button className="flex-1 bg-primary text-primary-foreground shadow-[0_0_15px_rgba(34,197,94,0.3)] gap-2" data-testid="button-withdraw"><ArrowUpRight size={16} /> Withdraw</Button>
                        <Button variant="outline" className="flex-1 gap-2" data-testid="button-deposit"><ArrowDownLeft size={16} /> Deposit</Button>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/30 border-white/5">
                    <CardHeader><CardTitle>Payment Method</CardTitle><CardDescription>Managed through PayPal</CardDescription></CardHeader>
                    <CardContent>
                      {user?.paypalSubscriptionId ? (
                        <a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noopener noreferrer" className="w-full block">
                          <Button variant="outline" className="w-full" data-testid="button-manage-payment">Manage PayPal Subscription</Button>
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">Subscribe to a membership to add a payment method</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-card/30 border-white/5">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Mail size={16} className="text-primary" />Prize Payout Email</CardTitle>
                      <CardDescription>Your PayPal email address where daily prize winnings are sent automatically</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {user?.paypalPayoutEmail && !payoutEmailEditing ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                            <CheckCircle size={16} className="text-green-400 shrink-0" />
                            <span className="text-sm font-mono text-green-400 truncate" data-testid="text-payout-email">{user.paypalPayoutEmail}</span>
                          </div>
                          <Button variant="outline" size="sm" className="w-full" data-testid="button-edit-payout-email"
                            onClick={() => { setPayoutEmailInput(user.paypalPayoutEmail || ""); setPayoutEmailEditing(true); }}>
                            Change Payout Email
                          </Button>
                        </div>
                      ) : payoutEmailEditing ? (
                        <div className="space-y-2">
                          <Input
                            type="email"
                            placeholder="your@paypal.com"
                            value={payoutEmailInput}
                            onChange={(e) => setPayoutEmailInput(e.target.value)}
                            data-testid="input-payout-email"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 bg-primary text-primary-foreground"
                              disabled={updatePayoutEmail.isPending || !payoutEmailInput.trim()}
                              onClick={() => updatePayoutEmail.mutate(payoutEmailInput.trim())}
                              data-testid="button-save-payout-email">
                              {updatePayoutEmail.isPending ? <Loader2 size={14} className="animate-spin" /> : "Save"}
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1"
                              onClick={() => { setPayoutEmailEditing(false); setPayoutEmailInput(user?.paypalPayoutEmail || ""); }}
                              data-testid="button-cancel-payout-email">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            type="email"
                            placeholder="your@paypal.com"
                            value={payoutEmailInput}
                            onChange={(e) => setPayoutEmailInput(e.target.value)}
                            data-testid="input-payout-email-new"
                          />
                          <Button size="sm" className="w-full bg-primary text-primary-foreground"
                            disabled={updatePayoutEmail.isPending || !payoutEmailInput.trim()}
                            onClick={() => updatePayoutEmail.mutate(payoutEmailInput.trim())}
                            data-testid="button-save-payout-email-new">
                            {updatePayoutEmail.isPending ? <Loader2 size={14} className="animate-spin" /> : "Save Payout Email"}
                          </Button>
                          <p className="text-xs text-muted-foreground text-center">Required to receive daily prize payouts via PayPal</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <Card className="bg-card/30 border-white/5">
                  <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {transactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>
                      ) : (
                        transactions.map((tx: any) => (
                          <div key={tx.id} className="flex items-center justify-between p-3 border-b border-white/5 last:border-0" data-testid={`row-transaction-${tx.id}`}>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground">
                                {tx.type === "payout" ? <ArrowUpRight size={14} /> : tx.type === "prize" ? <Trophy size={14} /> : tx.type === "membership" ? <CreditCard size={14} /> : <ArrowDownLeft size={14} />}
                              </div>
                              <div><div className="font-medium text-sm">{tx.description || tx.type}</div><div className="text-xs text-muted-foreground">{tx.createdAt ? formatDate(tx.createdAt) : ""} • {tx.status}</div></div>
                            </div>
                            <div className={`font-mono font-bold text-sm ${tx.amount > 0 ? "text-green-400" : "text-foreground"}`}>{tx.amount > 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="badges">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { name: "Early Adopter", icon: Shield, color: "text-blue-400" },
                  { name: "Hoops King", icon: Trophy, color: "text-orange-500" },
                  { name: "Sniper", icon: Target, color: "text-red-500" },
                  { name: "Profit Machine", icon: TrendingUp, color: "text-green-500" },
                ].map((badge, i) => (
                  <Card key={i} className="bg-card/30 border-white/5 hover:border-primary/20 transition-colors cursor-pointer group">
                    <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                      <div className={`w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${badge.color}`}><badge.icon size={32} /></div>
                      <h3 className="font-bold font-display">{badge.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">Coming soon</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="subscription">
              <Card className={user?.membershipTier === "legend" ? "bg-primary/5 border-primary/20" : "bg-card/30 border-white/5"}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl font-display text-primary" data-testid="text-membership-title">
                        {tier === "free_play" ? "Free Play Membership — $0" : user?.membershipTier === "legend" || (user as any)?.referralCode === "NIKCOX" ? "Legend Membership" : tier !== "free" && user?.membershipTier ? `${tier.replace(/_/g, " ")} Membership` : "Choose Your Membership"}
                      </CardTitle>
                      <CardDescription>{tier === "free_play" ? "Daily picks and Master Championships. No Prize Pool entries, payouts, or referral cash rewards." : user?.membershipTier === "legend" || (user as any)?.referralCode === "NIKCOX" ? "Your Legend membership is active" : tier !== "free" && user?.membershipTier ? "Your membership is active" : "Enroll in Free Play with a valid affiliate code or choose a paid plan"}</CardDescription>
                    </div>
                    <Badge variant="outline" className={`px-3 py-1 ${user?.membershipTier === "legend" || (user as any)?.referralCode === "NIKCOX" ? "border-primary text-primary" : "border-white/20"}`}>
                      {tier !== "free" && user?.membershipTier || (user as any)?.referralCode === "NIKCOX" ? "ACTIVE" : "ENROLL"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {user?.membershipTier === "legend" || (user as any)?.referralCode === "NIKCOX" ? (
                    <a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" className="border-white/10 hover:bg-white/5" data-testid="button-manage-membership">Manage PayPal Subscription</Button>
                    </a>
                  ) : (
                    <Button className="bg-primary text-primary-foreground" onClick={() => navigate("/membership")} data-testid="button-upgrade">{tier === "free_play" ? "Compare paid memberships" : "Choose a membership"}</Button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-8">
            <MemberDailyPicks targetUserId={profileUserId!} profileName={displayName} />
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <MessageSquare size={20} className="text-primary" />
                <h2 className="text-xl font-display font-bold">{displayName}'s Wall</h2>
              </div>
              <ProfileThreads userId={profileUserId!} isOwn={false} profileName={displayName} />
            </div>
          </div>
        )}
      </div>
      <AdBannerInline />
    </div>
  );
}
