"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Loader2, Twitter, Users, Sparkles, Rocket, TrendingUp, Cpu } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface WatchedAccount {
  id: string;
  accountHandle: string;
  followersCount: number | null;
  isRecommended: boolean;
  isEnabled: boolean;
  replyCount: number;
  category: string | null;
}

interface PopularAccount {
  handle: string;
  name: string;
  followersCount: number | null;
  category: string;
}

// ─── Hardcoded Popular Accounts ─────────────────────────────

function sortByFollowers(list: PopularAccount[]): PopularAccount[] {
  return [...list].sort(
    (a, b) => (b.followersCount ?? -1) - (a.followersCount ?? -1)
  );
}

const MOST_POPULAR: PopularAccount[] = sortByFollowers([
  { handle: "elonmusk",       name: "Elon Musk",           followersCount: 230_000_000, category: "Tech & Business" },
  { handle: "BarackObama",    name: "Barack Obama",         followersCount: 130_000_000, category: "Politics" },
  { handle: "Cristiano",      name: "Cristiano Ronaldo",    followersCount: 115_000_000, category: "Sports" },
  { handle: "realDonaldTrump",name: "Donald Trump",         followersCount: 110_000_000, category: "Politics" },
  { handle: "narendramodi",   name: "Narendra Modi",        followersCount: 109_000_000, category: "Politics" },
  { handle: "justinbieber",   name: "Justin Bieber",        followersCount: 108_000_000, category: "Music" },
  { handle: "rihanna",        name: "Rihanna",              followersCount: 107_000_000, category: "Music" },
  { handle: "katyperry",      name: "Katy Perry",           followersCount: 103_000_000, category: "Music" },
  { handle: "taylorswift13",  name: "Taylor Swift",         followersCount: 93_000_000,  category: "Music" },
  { handle: "NASA",           name: "NASA",                 followersCount: 88_000_000,  category: "Science" },
  { handle: "ladygaga",       name: "Lady Gaga",            followersCount: 83_000_000,  category: "Music" },
  { handle: "YouTube",        name: "YouTube",              followersCount: 80_000_000,  category: "Technology" },
  { handle: "ArianaGrande",   name: "Ariana Grande",        followersCount: 75_000_000,  category: "Music" },
  { handle: "kimkardashian",  name: "Kim Kardashian",       followersCount: 75_000_000,  category: "Entertainment" },
  { handle: "TheEllenShow",   name: "Ellen DeGeneres",      followersCount: 70_000_000,  category: "Entertainment" },
  { handle: "selenagomez",    name: "Selena Gomez",         followersCount: 66_000_000,  category: "Entertainment" },
  { handle: "BillGates",      name: "Bill Gates",           followersCount: 64_000_000,  category: "Tech & Business" },
  { handle: "cnnbrk",         name: "CNN Breaking News",    followersCount: 59_000_000,  category: "News" },
  { handle: "realmadrid",     name: "Real Madrid C.F.",     followersCount: 50_000_000,  category: "Sports" },
  { handle: "X",              name: "X",                    followersCount: 30_000_000,  category: "Technology" },
]);

const TECH_AI: PopularAccount[] = sortByFollowers([
  { handle: "sama",        name: "Sam Altman",    followersCount: 3_200_000, category: "Tech & AI" },
  { handle: "OpenAI",      name: "OpenAI",        followersCount: 3_000_000, category: "Tech & AI" },
  { handle: "naval",       name: "Naval Ravikant",followersCount: 2_400_000, category: "Tech & AI" },
  { handle: "AnthropicAI", name: "Anthropic",     followersCount: 800_000,   category: "Tech & AI" },
  { handle: "midjourney",  name: "Midjourney",    followersCount: 500_000,   category: "Tech & AI" },
  { handle: "runwayml",    name: "Runway",        followersCount: 400_000,   category: "Tech & AI" },
  { handle: "kirawontmiss",name: "Kira",          followersCount: null,      category: "Tech & AI" },
]);

const MAX_ACCOUNTS = 25;

// ─── Helpers ────────────────────────────────────────────────

function formatFollowers(n: number | null): string {
  if (n == null) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M followers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K followers`;
  return `${n} followers`;
}

// ─── AccountRow (existing scraped accounts) ─────────────────

function AccountRow({
  account,
  isChecked,
  isDisabled,
  onToggle,
}: {
  account: WatchedAccount;
  isChecked: boolean;
  isDisabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
        isDisabled && !isChecked
          ? "cursor-not-allowed opacity-50"
          : isChecked
          ? "border-primary/40 bg-primary/5"
          : "hover:bg-muted/50"
      )}
    >
      <Checkbox
        checked={isChecked}
        onCheckedChange={onToggle}
        disabled={isDisabled && !isChecked}
      />
      <Twitter className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">@{account.accountHandle}</span>
          {account.category && (
            <Badge variant="secondary" className="text-xs">
              {account.category}
            </Badge>
          )}
        </div>
        {account.replyCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {account.replyCount} replies from you
          </p>
        )}
      </div>
      {account.followersCount != null && (
        <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
          {formatFollowers(account.followersCount)}
        </span>
      )}
    </label>
  );
}

// ─── PopularRow (hardcoded popular accounts) ─────────────────

function PopularRow({
  account,
  isChecked,
  isDisabled,
  onToggle,
}: {
  account: PopularAccount;
  isChecked: boolean;
  isDisabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
        isDisabled && !isChecked
          ? "cursor-not-allowed opacity-50"
          : isChecked
          ? "border-primary/40 bg-primary/5"
          : "hover:bg-muted/50"
      )}
    >
      <Checkbox
        checked={isChecked}
        onCheckedChange={onToggle}
        disabled={isDisabled && !isChecked}
      />
      <Twitter className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">@{account.handle}</span>
          <span className="text-sm text-muted-foreground">{account.name}</span>
          <Badge variant="secondary" className="text-xs">
            {account.category}
          </Badge>
        </div>
      </div>
      {account.followersCount != null && (
        <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
          {formatFollowers(account.followersCount)}
        </span>
      )}
    </label>
  );
}

// ─── AccountsStep ────────────────────────────────────────────

export function AccountsStep({ onComplete }: { onComplete: () => void }) {
  const [accounts, setAccounts] = useState<WatchedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // IDs of existing (scraped) accounts the user has checked
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  // Handles of popular accounts the user has checked
  const [selectedPopular, setSelectedPopular] = useState<Set<string>>(new Set());

  const totalSelected = enabledIds.size + selectedPopular.size;
  const atLimit = totalSelected >= MAX_ACCOUNTS;

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/watched-accounts");
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to load accounts");
          return;
        }
        const fetched: WatchedAccount[] = data.accounts ?? [];
        setAccounts(fetched);
        // Pre-select top engaged accounts
        const engaged = fetched
          .filter((a) => !a.isRecommended)
          .slice(0, MAX_ACCOUNTS);
        setEnabledIds(new Set(engaged.map((a) => a.id)));
      } catch {
        setError("Failed to load accounts");
      } finally {
        setLoading(false);
      }
    }
    fetchAccounts();
  }, []);

  const toggleExisting = (id: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else if (!atLimit) { next.add(id); }
      return next;
    });
  };

  const togglePopular = (handle: string) => {
    setSelectedPopular((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) { next.delete(handle); } else if (!atLimit) { next.add(handle); }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Filter out popular accounts already in watched list
      const existingHandles = new Set(
        accounts.map((a) => a.accountHandle.toLowerCase())
      );
      const popularToCreate = [...selectedPopular].filter(
        (h) => !existingHandles.has(h.toLowerCase())
      );
      const popularAlreadyExist = new Set(
        [...selectedPopular]
          .filter((h) => existingHandles.has(h.toLowerCase()))
          .map((h) => h.toLowerCase())
      );

      // 1. POST any new popular accounts in parallel
      if (popularToCreate.length > 0) {
        setSaveStatus(`Adding ${popularToCreate.length} popular account${popularToCreate.length > 1 ? "s" : ""}…`);
        const results = await Promise.allSettled(
          popularToCreate.map((handle) =>
            fetch("/api/watched-accounts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ handle }),
            })
          )
        );
        // Warn on failures but continue
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) console.warn(`${failed} popular account(s) could not be added`);
      }

      // 2. Bulk update enable state for existing accounts
      setSaveStatus("Saving selections…");
      const updates = accounts.map((a) => ({
        id: a.id,
        isEnabled:
          enabledIds.has(a.id) ||
          popularAlreadyExist.has(a.accountHandle.toLowerCase()),
      }));

      const res = await fetch("/api/watched-accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts: updates }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        return;
      }

      onComplete();
    } catch {
      setError("Failed to save account selections");
    } finally {
      setSaving(false);
      setSaveStatus(null);
    }
  };

  const engagedAccounts = accounts.filter((a) => !a.isRecommended);
  const recommendedAccounts = accounts.filter((a) => a.isRecommended);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">Choose accounts to auto-reply to</h2>
        <p className="text-muted-foreground">
          Select up to {MAX_ACCOUNTS} accounts. Mix your personal top picks with
          high-reach accounts to grow your visibility.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Your Top Accounts (from scraping) ── */}
      {(engagedAccounts.length > 0 || recommendedAccounts.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle className="text-lg">Your Top Accounts</CardTitle>
            </div>
            <CardDescription>
              Based on your X activity — accounts you already engage with and AI picks tailored to you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {engagedAccounts.length > 0 && (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground pb-1">
                  You engage with
                </p>
                <div className="space-y-2">
                  {engagedAccounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      isChecked={enabledIds.has(account.id)}
                      isDisabled={atLimit && !enabledIds.has(account.id)}
                      onToggle={() => toggleExisting(account.id)}
                    />
                  ))}
                </div>
              </>
            )}
            {recommendedAccounts.length > 0 && (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-3 pb-1">
                  AI recommendations for you
                </p>
                <div className="space-y-2">
                  {recommendedAccounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      isChecked={enabledIds.has(account.id)}
                      isDisabled={atLimit && !enabledIds.has(account.id)}
                      onToggle={() => toggleExisting(account.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Most Popular on X ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            <CardTitle className="text-lg">Most Popular on X</CardTitle>
          </div>
          <CardDescription>
            High-reach accounts — replying to their tweets puts your name in front of massive audiences.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {MOST_POPULAR.map((account) => (
              <PopularRow
                key={account.handle}
                account={account}
                isChecked={selectedPopular.has(account.handle)}
                isDisabled={atLimit && !selectedPopular.has(account.handle)}
                onToggle={() => togglePopular(account.handle)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Tech & AI Leaders ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            <CardTitle className="text-lg">Tech & AI Leaders</CardTitle>
          </div>
          <CardDescription>
            Influential voices in AI and tech — ideal if you want visibility in those communities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {TECH_AI.map((account) => (
              <PopularRow
                key={account.handle}
                account={account}
                isChecked={selectedPopular.has(account.handle)}
                isDisabled={atLimit && !selectedPopular.has(account.handle)}
                onToggle={() => togglePopular(account.handle)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Sticky footer ── */}
      <div className="sticky bottom-0 flex items-center justify-between rounded-lg border bg-card/95 backdrop-blur p-4 shadow-lg">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">
            {totalSelected}/{MAX_ACCOUNTS} selected
          </div>
          {atLimit && (
            <p className="text-xs text-muted-foreground">
              Limit reached — deselect one to swap
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saving && saveStatus && (
            <span className="text-xs text-muted-foreground">{saveStatus}</span>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || totalSelected === 0}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            Enable Auto-Reply
          </Button>
        </div>
      </div>
    </div>
  );
}
