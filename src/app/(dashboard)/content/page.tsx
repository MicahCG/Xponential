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
  Check,
  Clock,
  XCircle,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { AnalyzeStep } from "@/components/setup/analyze-step";
import { AccountsStep } from "@/components/setup/accounts-step";

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

interface AutoReplyLog {
  id: string;
  targetTweetId: string;
  targetTweetText: string;
  targetAuthor: string;
  replyContent: string;
  replyType: string;
  replyTweetId: string | null;
  status: string;
  createdAt: string;
  postedAt: string | null;
  watchedAccount: { accountHandle: string };
}

const MAX_ENABLED = 10;

// ─── Sorting & Formatting ─────────────────────────────────────

type SortBy = "engagement" | "followers";

function sortAccounts(list: WatchedAccount[], by: SortBy): WatchedAccount[] {
  return [...list].sort((a, b) =>
    by === "followers"
      ? (b.followersCount ?? 0) - (a.followersCount ?? 0)
      : b.replyCount - a.replyCount
  );
}

function formatFollowers(n: number | null): string {
  if (n == null) return "— followers";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K followers`;
  return `${n} followers`;
}

// ─── Main Page ──────────────────────────────────────────────

export default function AutoReplyPage() {
  const [accounts, setAccounts] = useState<WatchedAccount[]>([]);
  const [replies, setReplies] = useState<AutoReplyLog[]>([]);
  const [loading, setLoading] = useState(true);
  // null = loading, false = no profile, true = has profile
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<"analyze" | "select" | null>(null);
  const [newHandle, setNewHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("engagement");

  const enabledCount = accounts.filter((a) => a.isEnabled).length;

  const activeAccounts = sortAccounts(accounts.filter((a) => a.isEnabled), sortBy);
  const inactiveAccounts = sortAccounts(accounts.filter((a) => !a.isEnabled), sortBy);

  const fetchData = useCallback(async () => {
    try {
      const [accountsRes, repliesRes, profileRes] = await Promise.all([
        fetch("/api/watched-accounts"),
        fetch("/api/auto-replies"),
        fetch("/api/personality/profile"),
      ]);

      if (accountsRes.ok) {
        const data = await accountsRes.json();
        const fetched: WatchedAccount[] = data.accounts ?? [];
        setAccounts(fetched);

        if (fetched.length === 0) {
          // Always re-analyze when there are no watched accounts —
          // this re-scrapes Twitter and regenerates recommendations
          const profileOk = profileRes.ok;
          const profile = profileOk ? await profileRes.json() : null;
          setHasProfile(!!profile?.id);
          setOnboardingStep("analyze");
        } else {
          setOnboardingStep(null);
          setHasProfile(true);
        }
      }

      if (repliesRes.ok) {
        const data = await repliesRes.json();
        setReplies(data.replies);
      }
    } catch {
      // Silently fail — page still renders with empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Called when AccountsStep completes — re-fetch to enter populated view
  const handleOnboardingComplete = useCallback(() => {
    setLoading(true);
    setOnboardingStep(null);
    fetchData();
  }, [fetchData]);

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
    } else {
      // After disabling all accounts, check if we should show onboarding
      const updated = accounts.map((a) =>
        a.id === id ? { ...a, isEnabled } : a
      );
      if (updated.every((a) => !a.isEnabled)) {
        setOnboardingStep("select");
      }
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

  const handleApprove = async (replyId: string) => {
    setReplies((prev) =>
      prev.map((r) => (r.id === replyId ? { ...r, status: "posting" } : r))
    );

    const res = await fetch(`/api/auto-replies/${replyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });

    setReplies((prev) =>
      prev.map((r) =>
        r.id === replyId ? { ...r, status: res.ok ? "posted" : "failed" } : r
      )
    );
  };

  const handleReject = async (replyId: string) => {
    setReplies((prev) =>
      prev.map((r) => (r.id === replyId ? { ...r, status: "rejected" } : r))
    );
    await fetch(`/api/auto-replies/${replyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Onboarding / Empty State ──────────────────────────────

  if (onboardingStep !== null) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auto-Replies</h1>
          <p className="text-muted-foreground">
            Manage accounts your AI agent monitors and auto-replies to
          </p>
        </div>

        <div className="py-4">
          {onboardingStep === "analyze" && (
            <AnalyzeStep onComplete={() => setOnboardingStep("select")} />
          )}
          {onboardingStep === "select" && (
            <AccountsStep onComplete={handleOnboardingComplete} />
          )}
        </div>
      </div>
    );
  }

  // ─── Populated State ───────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auto-Replies</h1>
        <p className="text-muted-foreground">
          Manage accounts your AI agent monitors and auto-replies to
        </p>
      </div>

      {/* Add Account — inline at top */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
          <Input
            value={newHandle}
            onChange={(e) => { setNewHandle(e.target.value); setAddError(null); }}
            placeholder="Add account by username"
            className="pl-8"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            disabled={adding}
          />
        </div>
        <Button
          onClick={handleAdd}
          disabled={adding || !newHandle.trim() || enabledCount >= MAX_ENABLED}
          size="sm"
        >
          {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add
        </Button>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {enabledCount}/{MAX_ENABLED} active
        </span>
        {addError && <p className="text-sm text-destructive">{addError}</p>}
      </div>

      {/* Active accounts — sorted */}
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
              Your agent is monitoring these accounts and replying when they post.
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
                onReplyTypeChange={(type) => handleReplyTypeChange(account.id, type)}
                onRemove={() => handleRemove(account.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Inactive accounts — unified sorted list */}
      {inactiveAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                <CardTitle className="text-lg">Suggested Accounts</CardTitle>
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="engagement">My engagement</SelectItem>
                  <SelectItem value="followers">Follower count</SelectItem>
                </SelectContent>
              </Select>
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
                onReplyTypeChange={(type) => handleReplyTypeChange(account.id, type)}
                onRemove={() => handleRemove(account.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Auto-Replies */}
      {replies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Auto-Replies</CardTitle>
            <CardDescription>
              Latest replies generated by your AI agent
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {replies.map((reply) => (
                <ReplyLogCard
                  key={reply.id}
                  reply={reply}
                  onApprove={() => handleApprove(reply.id)}
                  onReject={() => handleReject(reply.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
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
              <Badge variant="outline" className="gap-1 text-xs text-purple-600 border-purple-200 dark:text-purple-400 dark:border-purple-800">
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

        {/* Reply type selection */}
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

        {/* Mode selector */}
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

        {/* Toggle */}
        <Switch
          checked={account.isEnabled}
          onCheckedChange={onToggle}
          disabled={!canEnable && !account.isEnabled}
        />

        {/* Remove */}
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

// ─── Reply Log Card ──────────────────────────────────────────

function ReplyLogCard({
  reply,
  onApprove,
  onReject,
}: {
  reply: AutoReplyLog;
  onApprove: () => void;
  onReject: () => void;
}) {
  const statusConfig: Record<
    string,
    { icon: React.ReactNode; label: string; className: string }
  > = {
    posted: {
      icon: <Check className="h-3 w-3" />,
      label: "Posted",
      className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    pending: {
      icon: <Clock className="h-3 w-3" />,
      label: "Pending",
      className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    },
    failed: {
      icon: <XCircle className="h-3 w-3" />,
      label: "Failed",
      className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
    rejected: {
      icon: <XCircle className="h-3 w-3" />,
      label: "Rejected",
      className: "bg-muted text-muted-foreground",
    },
    posting: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Posting...",
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
  };

  const status = statusConfig[reply.status] ?? statusConfig.pending;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>@{reply.targetAuthor} tweeted</span>
            <span>&middot;</span>
            <span>
              {formatDistanceToNow(new Date(reply.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            &ldquo;{reply.targetTweetText}&rdquo;
          </p>
        </div>
        <Badge className={cn("shrink-0 gap-1", status.className)}>
          {status.icon}
          {status.label}
        </Badge>
      </div>

      <div className="rounded-md bg-muted/50 p-2">
        <p className="text-sm">
          <span className="font-medium">Your reply:</span> {reply.replyContent}
        </p>
      </div>

      {reply.status === "pending" && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={onApprove}>
            <Check className="mr-1 h-3 w-3" />
            Approve & Post
          </Button>
          <Button size="sm" variant="outline" onClick={onReject}>
            <XCircle className="mr-1 h-3 w-3" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
