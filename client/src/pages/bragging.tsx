import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Trophy, Heart, MessageCircle, ImagePlus, X, Send, Trash2,
  Flame, Crown, Star, ChevronDown, Lock, Video,
} from "lucide-react";
import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface BraggingPostData {
  id: number;
  userId: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  likes: number;
  createdAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    membershipTier: string | null;
  } | null;
  commentCount: number;
}

interface CommentData {
  id: number;
  postId: number;
  userId: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    membershipTier: string | null;
  } | null;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier || tier === "rookie") return null;
  if (tier === "legend") {
    return (
      <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-[10px] gap-0.5 px-1.5 py-0">
        <Crown size={10} /> Legend
      </Badge>
    );
  }
  return (
    <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] gap-0.5 px-1.5 py-0">
      <Star size={10} /> Pro
    </Badge>
  );
}

function PostComments({ postId }: { postId: number }) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");

  const { data: comments = [], isLoading } = useQuery<CommentData[]>({
    queryKey: [`/api/bragging/${postId}/comments`],
    queryFn: async () => {
      const res = await fetch(`/api/bragging/${postId}/comments`);
      return res.json();
    },
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/bragging/${postId}/comments`, { content });
      return res.json();
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: [`/api/bragging/${postId}/comments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/bragging"] });
    },
  });

  const isMember = user?.membershipTier && user.membershipTier !== "rookie";

  return (
    <div className="border-t border-white/5 pt-4 mt-4 space-y-3">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading comments...</div>
      ) : comments.length === 0 ? (
        <div className="text-sm text-muted-foreground">No comments yet. Be the first!</div>
      ) : (
        comments.map((c) => (
          <div key={c.id} className="flex gap-3" data-testid={`comment-${c.id}`}>
            <Avatar className="h-7 w-7 mt-0.5">
              <AvatarImage src={c.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.userId}`} />
              <AvatarFallback className="text-[10px]">{c.user?.firstName?.[0] || "?"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.user?.firstName || "User"}</span>
                <TierBadge tier={c.user?.membershipTier || null} />
                <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{c.content}</p>
            </div>
          </div>
        ))
      )}

      {isAuthenticated && isMember && (
        <div className="flex gap-2 mt-3">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[40px] h-10 bg-background/50 border-white/10 text-sm resize-none"
            data-testid="input-comment"
          />
          <Button
            size="icon"
            className="shrink-0 h-10 w-10"
            disabled={!commentText.trim() || addComment.isPending}
            onClick={() => commentText.trim() && addComment.mutate(commentText.trim())}
            data-testid="button-submit-comment"
          >
            <Send size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Bragging() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [postContent, setPostContent] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [expandedPost, setExpandedPost] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMember = isAuthenticated && user?.membershipTier && user.membershipTier !== "rookie";

  const { data: posts = [], isLoading } = useQuery<BraggingPostData[]>({
    queryKey: ["/api/bragging"],
    queryFn: async () => {
      const res = await fetch("/api/bragging");
      return res.json();
    },
  });

  const { data: likedPosts = [] } = useQuery<number[]>({
    queryKey: ["/api/bragging/liked"],
    queryFn: async () => {
      const res = await fetch("/api/bragging/liked", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const createPost = useMutation({
    mutationFn: async (data: { content: string; mediaUrl?: string; mediaType?: string }) => {
      const res = await apiRequest("POST", "/api/bragging", data);
      return res.json();
    },
    onSuccess: () => {
      setPostContent("");
      setMediaFile(null);
      setMediaPreview(null);
      queryClient.invalidateQueries({ queryKey: ["/api/bragging"] });
    },
  });

  const deletePost = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/bragging/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bragging"] });
    },
  });

  const toggleLike = useMutation({
    mutationFn: async (postId: number) => {
      const res = await apiRequest("POST", `/api/bragging/${postId}/like`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bragging"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bragging/liked"] });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    const reader = new FileReader();
    reader.onload = () => setMediaPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmitPost = async () => {
    if (!postContent.trim() && !mediaFile) return;

    let mediaUrl: string | undefined;
    let mediaType: string | undefined;

    if (mediaFile) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("media", mediaFile);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        mediaUrl = data.url;
        mediaType = data.mediaType;
      } catch {
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    createPost.mutate({
      content: postContent.trim(),
      ...(mediaUrl && { mediaUrl, mediaType }),
    });
  };

  const isVideoFile = mediaFile?.type?.startsWith("video/");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-20 max-w-2xl">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Flame size={32} className="text-primary" />
            <h1 className="text-4xl md:text-5xl font-display font-bold" data-testid="text-bragging-heading">
              Daily <span className="text-primary">Bragging Rights</span>
            </h1>
            <Flame size={32} className="text-primary" />
          </div>
          <p className="text-muted-foreground text-lg">
            Won big today? Show your receipts. Flex your picks. Let the community see who's on fire.
          </p>
          <Badge variant="outline" className="border-primary/30 text-primary mt-3">
            <Trophy size={12} className="mr-1" /> Members Only
          </Badge>
        </div>

        {isMember ? (
          <Card className="bg-card/40 border-white/10 mb-8" data-testid="card-compose-post">
            <CardContent className="p-5">
              <div className="flex gap-3">
                <Avatar className="h-10 w-10 border-2 border-primary/20">
                  <AvatarImage src={user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`} />
                  <AvatarFallback>{user?.firstName?.[0] || "U"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-3">
                  <Textarea
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="What's your big win today? Show your bet slip, share your picks..."
                    className="min-h-[80px] bg-background/50 border-white/10 resize-none"
                    data-testid="input-post-content"
                  />

                  {mediaPreview && (
                    <div className="relative inline-block">
                      {isVideoFile ? (
                        <video
                          src={mediaPreview}
                          className="max-h-48 rounded-lg border border-white/10"
                          controls
                        />
                      ) : (
                        <img
                          src={mediaPreview}
                          alt="Preview"
                          className="max-h-48 rounded-lg border border-white/10"
                        />
                      )}
                      <button
                        onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                        className="absolute -top-2 -right-2 bg-destructive rounded-full p-1 hover:bg-destructive/80"
                        data-testid="button-remove-media"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleFileSelect}
                        className="hidden"
                        data-testid="input-media-file"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-white/10 hover:bg-primary/10 hover:text-primary"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="button-add-image"
                      >
                        <ImagePlus size={16} /> Image
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-white/10 hover:bg-primary/10 hover:text-primary"
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "video/*";
                            fileInputRef.current.click();
                            fileInputRef.current.accept = "image/*,video/*";
                          }
                        }}
                        data-testid="button-add-video"
                      >
                        <Video size={16} /> Video
                      </Button>
                    </div>
                    <Button
                      className="gap-2 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                      disabled={(!postContent.trim() && !mediaFile) || createPost.isPending || isUploading}
                      onClick={handleSubmitPost}
                      data-testid="button-submit-post"
                    >
                      {isUploading ? "Uploading..." : createPost.isPending ? "Posting..." : "Post"}
                      <Flame size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card/20 border-white/10 mb-8">
            <CardContent className="p-8 text-center">
              <Lock size={32} className="mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-display font-bold text-lg mb-2">Members Only</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {isAuthenticated
                  ? "Upgrade to Pro or Legend to post and comment on bragging rights."
                  : "Sign in and become a member to post your wins and flex on the community."}
              </p>
              {isAuthenticated ? (
                <a href="/membership">
                  <Button className="gap-2">
                    <Star size={16} /> Upgrade Membership
                  </Button>
                </a>
              ) : (
                <a href="/auth">
                  <Button className="gap-2">
                    Sign In to Join
                  </Button>
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16">
            <Trophy size={48} className="mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-xl font-display font-bold mb-2">No Posts Yet</h3>
            <p className="text-muted-foreground">Be the first to flex your wins today!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const isLiked = likedPosts.includes(post.id);
              const isOwnPost = user?.id === post.userId;

              return (
                <Card key={post.id} className="bg-card/30 border-white/5 hover:border-white/10 transition-colors" data-testid={`card-post-${post.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 border-2 border-white/10">
                        <AvatarImage src={post.user?.profileImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.userId}`} />
                        <AvatarFallback>{post.user?.firstName?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm" data-testid={`text-post-author-${post.id}`}>
                            {post.user?.firstName || "User"} {post.user?.lastName || ""}
                          </span>
                          <TierBadge tier={post.user?.membershipTier || null} />
                          <span className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</span>
                          {isOwnPost && (
                            <button
                              onClick={() => deletePost.mutate(post.id)}
                              className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                              data-testid={`button-delete-post-${post.id}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        <p className="text-sm mt-2 whitespace-pre-wrap" data-testid={`text-post-content-${post.id}`}>
                          {post.content}
                        </p>

                        {post.mediaUrl && (
                          <div className="mt-3 rounded-xl overflow-hidden border border-white/10">
                            {post.mediaType === "video" ? (
                              <video
                                src={post.mediaUrl}
                                controls
                                className="w-full max-h-[400px] object-contain bg-black"
                                data-testid={`video-post-${post.id}`}
                              />
                            ) : (
                              <img
                                src={post.mediaUrl}
                                alt="Post media"
                                className="w-full max-h-[400px] object-contain bg-black/50"
                                loading="lazy"
                                data-testid={`image-post-${post.id}`}
                              />
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-4 mt-3">
                          <button
                            className={`flex items-center gap-1.5 text-sm transition-colors ${
                              isLiked ? "text-red-400" : "text-muted-foreground hover:text-red-400"
                            }`}
                            onClick={() => isAuthenticated && toggleLike.mutate(post.id)}
                            disabled={!isAuthenticated}
                            data-testid={`button-like-${post.id}`}
                          >
                            <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                            <span>{post.likes || 0}</span>
                          </button>
                          <button
                            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                            onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                            data-testid={`button-comments-${post.id}`}
                          >
                            <MessageCircle size={16} />
                            <span>{post.commentCount}</span>
                            <ChevronDown
                              size={14}
                              className={`transition-transform ${expandedPost === post.id ? "rotate-180" : ""}`}
                            />
                          </button>
                        </div>

                        {expandedPost === post.id && <PostComments postId={post.id} />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
