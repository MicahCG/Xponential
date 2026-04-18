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
import {
  Loader2,
  Plus,
  Trash2,
  MessageSquareReply,
  Video,
  Sparkles,
  TrendingUp,
  Save,
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
  bypassQualityGate: boolean;
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

const MAX_ENABLED = 25;

// ─── Formatting ──────────────────────────────────────────────

function formatFollowers(n: number | null): string {
  if (n == null) return "— followers";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K followers`;
  return `${n} followers`;
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

function XTab({ connectionId }: { connectionId?: string }) {
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
      const connParam = connectionId ? `?connectionId=${connectionId}` : "";
      const [accountsRes, profileRes] = await Promise.all([
        fetch(`/api/watched-accounts${connParam}`),
        fetch(`/api/personality/profile${connParam}`),
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
        body: JSON.stringify({ replyInstructions, ...(connectionId && { connectionId }) }),
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

  const handleBypassGateChange = async (id: string, bypassQualityGate: boolean) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, bypassQualityGate } : a))
    );
    await fetch(`/api/watched-accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bypassQualityGate }),
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
          <AnalyzeStep connectionId={connectionId} onComplete={() => setOnboardingStep("select")} />
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
                onBypassGateChange={(bypass) =>
                  handleBypassGateChange(account.id, bypass)
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
                onBypassGateChange={(bypass) =>
                  handleBypassGateChange(account.id, bypass)
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

// ─── Connection type ────────────────────────────────────────

interface XConnection {
  id: string;
  accountHandle: string | null;
  status: string;
}

// ─── Main Page ───────────────────────────────────────────────

export default function AutoReplyPage() {
  const [connections, setConnections] = useState<XConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [loadingConnections, setLoadingConnections] = useState(true);

  useEffect(() => {
    fetch("/api/connect/list")
      .then((res) => res.json())
      .then((data: XConnection[]) => {
        const xConns = data.filter(
          (c: XConnection) => c.status === "active"
        );
        setConnections(xConns);
        if (xConns.length > 0 && !selectedConnectionId) {
          setSelectedConnectionId(xConns[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConnections(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadingConnections) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auto-Replies</h1>
          <p className="text-muted-foreground">
            Manage your AI agent on X
          </p>
        </div>
        {connections.length > 1 && (
          <Select
            value={selectedConnectionId ?? ""}
            onValueChange={setSelectedConnectionId}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  @{c.accountHandle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedConnectionId && (
        <XTab key={selectedConnectionId} connectionId={selectedConnectionId} />
      )}
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
  onBypassGateChange,
  onRemove,
}: {
  account: WatchedAccount;
  canEnable: boolean;
  onToggle: (enabled: boolean) => void;
  onModeChange: (mode: string) => void;
  onReplyTypeChange: (type: string) => void;
  onBypassGateChange: (bypass: boolean) => void;
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

        <label
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap",
            !account.isEnabled && "opacity-40"
          )}
          title="When on, reply to every new tweet from this account (skip the quality gate)"
        >
          <Switch
            checked={account.bypassQualityGate}
            onCheckedChange={onBypassGateChange}
            disabled={!account.isEnabled}
          />
          Always reply
        </label>

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
