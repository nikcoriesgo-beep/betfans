import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Hash, Users, MessageSquare } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

const CHANNELS = [
  { name: "general", label: "General Chat" },
  { name: "nfl-talk", label: "NFL Discussion" },
  { name: "nba-courtside", label: "NBA Courtside" },
  { name: "live-betting", label: "Live Betting" },
  { name: "big-wins", label: "Big Wins" },
];

export function CommunityChat() {
  const [message, setMessage] = useState("");
  const [activeChannel, setActiveChannel] = useState("general");
  const { user, isAuthenticated } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);

  const { data: messages = [] } = useQuery<any[]>({
    queryKey: ["/api/chat", activeChannel],
    queryFn: async () => {
      const res = await fetch(`/api/chat/${activeChannel}`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", channel: activeChannel }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "new_message") {
        queryClient.invalidateQueries({ queryKey: ["/api/chat", activeChannel] });
      }
    };

    return () => ws.close();
  }, [activeChannel]);

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest("POST", "/api/chat", {
        channel: activeChannel,
        message: msg,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat", activeChannel] });
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    if (!isAuthenticated) {
      window.location.href = "/auth";
      return;
    }
    sendMutation.mutate(message.trim());
    setMessage("");
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const reversedMessages = [...messages].reverse();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.5)] bg-primary text-primary-foreground z-50 hover:scale-105 transition-transform" data-testid="button-open-chat">
          <MessageSquare size={24} fill="currentColor" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] p-0 flex flex-col bg-background/95 backdrop-blur-xl border-l border-white/10">
        <SheetHeader className="p-4 border-b border-white/10 bg-black/20">
          <SheetTitle className="flex items-center gap-2 font-display">
            <Users size={18} className="text-primary" />
            Community Chat
          </SheetTitle>
        </SheetHeader>
        
        <div className="flex flex-1 overflow-hidden">
          <div className="w-16 sm:w-48 bg-black/20 border-r border-white/5 flex flex-col p-2">
            {CHANNELS.map((channel) => (
              <button
                key={channel.name}
                onClick={() => setActiveChannel(channel.name)}
                className={`flex items-center gap-2 p-2 rounded-lg text-sm mb-1 transition-colors ${
                  activeChannel === channel.name 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
                data-testid={`button-channel-${channel.name}`}
              >
                <Hash size={16} />
                <span className="hidden sm:inline truncate">{channel.name}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-6">
                {reversedMessages.map((msg: any) => (
                  <div key={msg.id} className="flex gap-3" data-testid={`chat-message-${msg.id}`}>
                    <Avatar className="h-8 w-8 border border-white/10">
                      <AvatarImage src={msg.user?.profileImageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.userId}`} />
                      <AvatarFallback>{(msg.user?.firstName?.[0] || "U")}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-bold text-sm">{msg.user?.firstName || "Anonymous"}</span>
                        {msg.user?.membershipTier === "legend" && <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">LEGEND</Badge>}
                        {msg.user?.membershipTier === "pro" && <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-primary/10 text-primary border-primary/20">PRO</Badge>}
                        <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{msg.message}</p>
                    </div>
                  </div>
                ))}
                {reversedMessages.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    No messages yet. Start the conversation!
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="p-4 bg-black/20 border-t border-white/5">
              <div className="relative">
                <Input 
                  placeholder={isAuthenticated ? `Message #${activeChannel}...` : "Sign in to chat"} 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  className="pr-10 bg-card/50 border-white/10"
                  disabled={!isAuthenticated}
                  data-testid="input-chat-message"
                />
                <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-full text-primary hover:text-primary/80 hover:bg-transparent" onClick={handleSend} disabled={!isAuthenticated} data-testid="button-send-message">
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
