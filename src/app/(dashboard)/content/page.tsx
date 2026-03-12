"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Trash2,
  MessageSquareReply,
  Video,
  Sparkles,
  TrendingUp,
  Save,
  Twitter,
  Linkedin,
  Send,
  Clock,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnalyzeStep } from "@/components/setup/analyze-step";
import { AccountsStep } from "@/components/setup/accounts-step";
import { ReplyFeed } from "@/components/auto-replies/reply-feed";
import { formatDistanceToNow } from "date-fns";

// ─── Types ──────────────────────────────────────────────────

interface WatchedAccount {
  id: string;
  accountHandle: string;
  accountId: string | null;
  followersCount: number | null;
  isRecommended: boolean;
  isEnabled: boolean;
  replyCount: number;
  replyMode: string;
  replyType: string;
  category: string | null;
}

interface VideoPost {
  id: string;
  tweetText: string;
  videoPrompt: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  postedAt: string | null;
  platformPostId: string | null;
}

interface LinkedInPost {
  id: string;
  content: string;
  postedAt: string;
  platformPostId: string | null;
  status: string;
}

const MAX_ENABLED = 12;

// ─── Formatting ──────────────────────────────────────────────

function formatFollowers(n: number | null): string {
  if (n == null) return "— followers";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K followers`;
  return `${n} followers`;
}

// ─── Types ──────────────────────────────────────────────────

interface LinkedInProfile {
  id: string;
  accountHandle: string; // full profile URL
  isEnabled: boolean;
  replyMode: string;
  replyCount: number;
}

// ─── LinkedIn Tab ────────────────────────────────────────────

function LinkedInTab() {
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState(false);
  const [history, setHistory] = useState<LinkedInPost[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);

  const [profiles, setProfiles] = useState<LinkedInProfile[]>([]);
  const [newProfileUrl, setNewProfileUrl] = useState("");
  const [addingProfile, setAddingProfile] = useState(false);
  const [addProfileError, setAddProfileError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [historyRes, connectRes, profilesRes] = await Promise.all([
        fetch("/api/content/history?platform=linkedin"),
        fetch("/api/connect/list"),
        fetch("/api/linkedin/watched-profiles"),
      ]);
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data.items ?? []);
      }
      if (connectRes.ok) {
        const connections = await connectRes.json();
        const li = connections.find(
          (c: { platform: string; status: string }) =>
            c.platform === "linkedin" && c.status === "active"
        );
        setConnected(!!li);
      }
      if (profilesRes.ok) {
        const data = await profilesRes.json();
        setProfiles(data.profiles ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePost = async () => {
    if (!postText.trim()) return;
    setPosting(true);
    setPostError(null);
    setPostSuccess(false);
    try {
      const postRes = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: postText.trim() }),
      });
      const postData = await postRes.json();
      if (!postRes.ok) {
        setPostError(postData.error ?? "Failed to publish post");
        return;
      }
      setPostSuccess(true);
      setPostText("");
      fetchData();
      setTimeout(() => setPostSuccess(false), 3000);
    } catch {
      setPostError("Something went wrong. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const handleAddProfile = async () => {
    if (!newProfileUrl.trim()) return;
    setAddingProfile(true);
    setAddProfileError(null);
    try {
      const res = await fetch("/api/linkedin/watched-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrl: newProfileUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddProfileError(data.error ?? "Failed to add profile");
        return;
      }
      setProfiles((prev) => [...prev, data.profile]);
      setNewProfileUrl("");
    } catch {
      setAddProfileError("Failed to add profile");
    } finally {
      setAddingProfile(false);
    }
  };

  const handleToggleProfile = async (id: string, isEnabled: boolean) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, isEnabled } : p)));
    await fetch(`/api/linkedin/watched-profiles/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled }),
    });
  };

  const handleProfileModeChange = async (id: string, replyMode: string) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, replyMode } : p)));
    await fetch(`/api/linkedin/watched-profiles/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyMode }),
    });
  };

  const handleRemoveProfile = async (id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/linkedin/watched-profiles/${id}`, { method: "DELETE" });
  };

  if (connected === false) {
    return (
      <Card className="mx-auto max-w-md mt-8">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Linkedin className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">LinkedIn not connected</p>
            <p className="text-sm text-muted-foreground mt-1">
              Connect your LinkedIn account to start posting.
            </p>
          </div>
          <Button asChild>
            <a href="/api/connect/start/linkedin">Connect LinkedIn</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Watched Profiles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquareReply className="h-5 w-5" />
            <CardTitle className="text-lg">Auto-Reply Profiles</CardTitle>
          </div>
          <CardDescription>
            Add LinkedIn profiles to watch. Your agent scrapes their latest posts
            every 15 minutes and generates comments in your voice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add profile */}
          <div className="flex gap-2">
            <Input
              value={newProfileUrl}
              onChange={(e) => { setNewProfileUrl(e.target.value); setAddProfileError(null); }}
              placeholder="linkedin.com/in/satyanadella"
              onKeyDown={(e) => e.key === "Enter" && handleAddProfile()}
              disabled={addingProfile}
              className="flex-1"
            />
            <Button
              onClick={handleAddProfile}
              disabled={addingProfile || !newProfileUrl.trim()}
              size="sm"
            >
              {addingProfile ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add
            </Button>
          </div>
          {addProfileError && (
            <p className="text-sm text-destructive">{addProfileError}</p>
          )}

          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No profiles added yet. Paste a LinkedIn profile URL above.
            </p>
          ) : (
            <div className="space-y-2">
              {profiles.map((profile) => {
                const vanity = profile.accountHandle.match(/\/in\/([^/?#]+)/)?.[1] ?? profile.accountHandle;
                return (
                  <div
                    key={profile.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{vanity}</p>
                      {profile.replyCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {profile.replyCount} replies
                        </p>
                      )}
                    </div>
                    <Select
                      value={profile.replyMode}
                      onValueChange={(v) => handleProfileModeChange(profile.id, v)}
                      disabled={!profile.isEnabled}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="auto">Auto</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      checked={profile.isEnabled}
                      onCheckedChange={(v) => handleToggleProfile(profile.id, v)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveProfile(profile.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compose post */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">New LinkedIn Post</CardTitle>
          <CardDescription>
            Write and publish a post to your LinkedIn profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={postText}
            onChange={(e) => { setPostText(e.target.value); setPostError(null); }}
            placeholder="What do you want to share on LinkedIn?"
            rows={5}
            maxLength={3000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {postText.length}/3000
            </span>
            <div className="flex items-center gap-2">
              {postError && <p className="text-sm text-destructive">{postError}</p>}
              {postSuccess && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <Check className="h-4 w-4" /> Posted!
                </span>
              )}
              <Button onClick={handlePost} disabled={posting || !postText.trim()}>
                {posting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Post to LinkedIn
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Post history */}
      {loadingHistory ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : history.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Post History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((post) => (
              <div key={post.id} className="rounded-lg border p-3 space-y-1">
                <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(post.postedAt), { addSuffix: true })}
                  <Badge variant="outline" className="text-xs">LinkedIn</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* LinkedIn reply feed */}
      <ReplyFeed platform="linkedin" />
    </div>
  );
}

// ─── X Tab ───────────────────────────────────────────────────

// ─── Video Post Section ───────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:          { label: "Queued",          variant: "secondary" },
  generating_video: { label: "Generating...",   variant: "secondary" },
  posting:          { label: "Posting...",       variant: "default" },
  posted:           { label: "Posted",           variant: "default" },
  failed:           { label: "Failed",           variant: "destructive" },
};

function VideoPostSection() {
  const [tweetText, setTweetText]   = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);
  const [posts, setPosts]           = useState<VideoPost[]>([]);
  const [polling, setPolling]       = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/video-posts");
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Poll while any post is in-progress
  useEffect(() => {
    const inProgress = posts.some((p) => ["pending", "generating_video", "posting"].includes(p.status));
    if (!inProgress) { setPolling(false); return; }
    setPolling(true);
    const t = setInterval(fetchPosts, 15000);
    return () => clearInterval(t);
  }, [posts, fetchPosts]);

  const triggerCron = async () => {
    try { await fetch("/api/cron/process-video-posts"); } catch { /* ignore */ }
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(false);
    if (!tweetText.trim()) { setError("Tweet text is required."); return; }
    if (!videoPrompt.trim()) { setError("Video prompt is required."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/video-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetText: tweetText.trim(), videoPrompt: videoPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to queue post."); return; }
      setSuccess(true);
      setTweetText("");
      setVideoPrompt("");
      await fetchPosts();
      await triggerCron();
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          <CardTitle className="text-lg">Post Video to X</CardTitle>
        </div>
        <CardDescription>
          Generate a Popcorn video and auto-post it to your X profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Form */}
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Tweet text</label>
            <Textarea
              placeholder="What do you want to say? (max 280 chars)"
              value={tweetText}
              onChange={(e) => setTweetText(e.target.value)}
              maxLength={280}
              rows={2}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right mt-1">{tweetText.length}/280</p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Video prompt</label>
            <Textarea
              placeholder="Describe the video to generate (e.g. 'A muppet building a startup in a garage')"
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">Video post queued! Generating now...</p>}
          <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? "Queuing..." : "Generate & Post"}
          </Button>
        </div>

        {/* Recent posts */}
        {posts.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Recent video posts</p>
              {polling && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
            {posts.map((post) => {
              const s = STATUS_LABELS[post.status] ?? { label: post.status, variant: "outline" as const };
              return (
                <div key={post.id} className="flex items-start justify-between gap-2 py-2 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{post.tweetText}</p>
                    <p className="text-xs text-muted-foreground truncate">{post.videoPrompt}</p>
                    {post.errorMessage && (
                      <p className="text-xs text-destructive mt-0.5">{post.errorMessage}</p>
                    )}
                    {post.status === "posted" && post.platformPostId && (
                      <a
                        href={`https://x.com/i/web/status/${post.platformPostId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline mt-0.5 block"
                      >
                        View tweet
                      </a>
                    )}
                  </div>
                  <Badge variant={s.variant} className="shrink-0 text-xs">{s.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function XTab() {
  const [accounts, setAccounts] = useState<WatchedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<"analyze" | "select" | null>(null);
  const [newHandle, setNewHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [replyInstructions, setReplyInstructions] = useState("");
  const [savedInstructions, setSavedInstructions] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);
  const enabledCount = accounts.filter((a) => a.isEnabled).length;

  const activeAccounts = [...accounts.filter((a) => a.isEnabled)].sort(
    (a, b) => b.replyCount - a.replyCount
  );
  const inactiveAccounts = [...accounts.filter((a) => !a.isEnabled)].sort(
    (a, b) => b.replyCount - a.replyCount
  );

  const fetchData = useCallback(async () => {
    try {
      const [accountsRes, profileRes] = await Promise.all([
        fetch("/api/watched-accounts"),
        fetch("/api/personality/profile"),
      ]);

      if (accountsRes.ok) {
        const data = await accountsRes.json();
        const fetched: WatchedAccount[] = data.accounts ?? [];
        setAccounts(fetched);

        const profileOk = profileRes.ok;
        const profile = profileOk ? await profileRes.json() : null;

        if (profile?.replyInstructions) {
          setReplyInstructions(profile.replyInstructions);
          setSavedInstructions(profile.replyInstructions);
        }

        if (fetched.length === 0) {
          setHasProfile(!!profile?.id);
          setOnboardingStep("analyze");
        } else {
          setOnboardingStep(null);
          setHasProfile(true);
        }
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOnboardingComplete = useCallback(() => {
    setLoading(true);
    setOnboardingStep(null);
    fetchData();
  }, [fetchData]);

  const handleSaveInstructions = async () => {
    setSavingInstructions(true);
    try {
      const res = await fetch("/api/personality/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyInstructions }),
      });
      if (res.ok) setSavedInstructions(replyInstructions);
    } catch {
      // Silently fail
    } finally {
      setSavingInstructions(false);
    }
  };

  const handleToggle = async (id: string, isEnabled: boolean) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isEnabled } : a))
    );
    const res = await fetch(`/api/watched-accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled }),
    });
    if (!res.ok) {
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isEnabled: !isEnabled } : a))
      );
      const data = await res.json().catch(() => ({}));
      setAddError(data.error ?? "Failed to update account");
    } else {
      const updated = accounts.map((a) =>
        a.id === id ? { ...a, isEnabled } : a
      );
      if (updated.every((a) => !a.isEnabled)) setOnboardingStep("select");
    }
  };

  const handleModeChange = async (id: string, replyMode: string) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, replyMode } : a))
    );
    await fetch(`/api/watched-accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyMode }),
    });
  };

  const handleReplyTypeChange = async (id: string, replyType: string) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, replyType } : a))
    );
    await fetch(`/api/watched-accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyType }),
    });
  };

  const handleRemove = async (id: string) => {
    const next = accounts.filter((a) => a.id !== id);
    setAccounts(next);
    await fetch(`/api/watched-accounts/${id}`, { method: "DELETE" });
    if (next.length === 0) {
      setOnboardingStep(hasProfile ? "select" : "analyze");
    }
  };

  const handleAdd = async () => {
    const handle = newHandle.replace("@", "").trim();
    if (!handle) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/watched-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "Failed to add account");
        return;
      }
      setAccounts((prev) => [...prev, data.account]);
      setNewHandle("");
      setOnboardingStep(null);
    } catch {
      setAddError("Failed to add account");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (onboardingStep !== null) {
    return (
      <div className="space-y-6 py-4">
        {onboardingStep === "analyze" && (
          <AnalyzeStep onComplete={() => setOnboardingStep("select")} />
        )}
        {onboardingStep === "select" && (
          <AccountsStep onComplete={handleOnboardingComplete} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Account */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            @
          </span>
          <Input
            value={newHandle}
            onChange={(e) => {
              setNewHandle(e.target.value);
              setAddError(null);
            }}
            placeholder="Add account by username"
            className="pl-8"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            disabled={adding}
          />
        </div>
        <Button
          onClick={handleAdd}
          disabled={adding || !newHandle.trim()}
          size="sm"
        >
          {adding ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Add
        </Button>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {enabledCount}/{MAX_ENABLED} active · {accounts.length} total
        </span>
        {addError && <p className="text-sm text-destructive">{addError}</p>}
      </div>

      {/* Reply Instructions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Reply Instructions</CardTitle>
          <CardDescription>
            Tell your AI agent how to adjust its personality when replying.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={replyInstructions}
            onChange={(e) => setReplyInstructions(e.target.value)}
            placeholder="e.g. Be more sarcastic, keep replies under 2 sentences, don't use emojis..."
            rows={3}
            maxLength={1000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {replyInstructions.length}/1000
            </span>
            <Button
              onClick={handleSaveInstructions}
              disabled={
                savingInstructions ||
                replyInstructions === savedInstructions
              }
              size="sm"
            >
              {savingInstructions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active accounts */}
      {activeAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquareReply className="h-5 w-5" />
                <CardTitle className="text-lg">Active Auto-Replies</CardTitle>
              </div>
              <Badge variant="outline">
                {enabledCount}/{MAX_ENABLED} slots used
              </Badge>
            </div>
            <CardDescription>
              Your agent monitors these accounts and replies when they post.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeAccounts.map((account) => (
              <WatchedAccountCard
                key={account.id}
                account={account}
                canEnable={true}
                onToggle={(enabled) => handleToggle(account.id, enabled)}
                onModeChange={(mode) => handleModeChange(account.id, mode)}
                onReplyTypeChange={(type) =>
                  handleReplyTypeChange(account.id, type)
                }
                onRemove={() => handleRemove(account.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Suggested accounts */}
      {inactiveAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              <CardTitle className="text-lg">Suggested Accounts</CardTitle>
            </div>
            <CardDescription>
              Enable up to {MAX_ENABLED} total.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {inactiveAccounts.map((account) => (
              <WatchedAccountCard
                key={account.id}
                account={account}
                canEnable={enabledCount < MAX_ENABLED}
                onToggle={(enabled) => handleToggle(account.id, enabled)}
                onModeChange={(mode) => handleModeChange(account.id, mode)}
                onReplyTypeChange={(type) =>
                  handleReplyTypeChange(account.id, type)
                }
                onRemove={() => handleRemove(account.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Video post creator */}
      <VideoPostSection />

      {/* Recent replies feed */}
      <ReplyFeed platform="x" />
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function AutoReplyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auto-Replies</h1>
        <p className="text-muted-foreground">
          Manage your AI agent across platforms
        </p>
      </div>

      <Tabs defaultValue="x">
        <TabsList>
          <TabsTrigger value="x" className="gap-2">
            <Twitter className="h-4 w-4" />X
          </TabsTrigger>
          <TabsTrigger value="linkedin" className="gap-2">
            <Linkedin className="h-4 w-4" />
            LinkedIn
          </TabsTrigger>
        </TabsList>

        <TabsContent value="x" className="mt-6">
          <XTab />
        </TabsContent>

        <TabsContent value="linkedin" className="mt-6">
          <LinkedInTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Watched Account Card ────────────────────────────────────

function WatchedAccountCard({
  account,
  canEnable,
  onToggle,
  onModeChange,
  onReplyTypeChange,
  onRemove,
}: {
  account: WatchedAccount;
  canEnable: boolean;
  onToggle: (enabled: boolean) => void;
  onModeChange: (mode: string) => void;
  onReplyTypeChange: (type: string) => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">@{account.accountHandle}</span>
            {account.category && (
              <Badge variant="secondary" className="text-xs">
                {account.category}
              </Badge>
            )}
            {account.isRecommended && !account.isEnabled && (
              <Badge
                variant="outline"
                className="gap-1 text-xs text-purple-600 border-purple-200 dark:text-purple-400 dark:border-purple-800"
              >
                <Sparkles className="h-2.5 w-2.5" />
                AI Pick
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{formatFollowers(account.followersCount)}</span>
            {account.replyCount > 0 && (
              <>
                <span>&middot;</span>
                <span>{account.replyCount} replies from you</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Badge
            variant={account.replyType === "text" ? "default" : "outline"}
            className="gap-1 text-xs cursor-pointer"
            onClick={() => onReplyTypeChange("text")}
          >
            <MessageSquareReply className="h-3 w-3" />
            Written
          </Badge>
          <Badge
            variant={account.replyType === "video" ? "default" : "outline"}
            className={cn(
              "gap-1 text-xs cursor-pointer",
              !account.isEnabled && "opacity-40 cursor-not-allowed"
            )}
            onClick={() => account.isEnabled && onReplyTypeChange("video")}
          >
            <Video className="h-3 w-3" />
            Video
          </Badge>
        </div>

        <Select
          value={account.replyMode}
          onValueChange={onModeChange}
          disabled={!account.isEnabled}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="auto">Auto</SelectItem>
          </SelectContent>
        </Select>

        <Switch
          checked={account.isEnabled}
          onCheckedChange={onToggle}
          disabled={!canEnable && !account.isEnabled}
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
