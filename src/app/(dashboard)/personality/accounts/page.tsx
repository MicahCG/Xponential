"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Loader2,
  Users,
  Sparkles,
  ArrowLeft,
  Save,
  Twitter,
} from "lucide-react";

interface WatchedAccount {
  id: string;
  accountHandle: string;
  followersCount: number | null;
  isRecommended: boolean;
  isEnabled: boolean;
  replyCount: number;
  category: string | null;
}

export default function AccountSelectionPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<WatchedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/watched-accounts");
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to load accounts");
          return;
        }
        setAccounts(data.accounts);
        // Initialize enabled state from DB
        setEnabledIds(
          new Set(
            data.accounts
              .filter((a: WatchedAccount) => a.isEnabled)
              .map((a: WatchedAccount) => a.id)
          )
        );
      } catch {
        setError("Failed to load accounts");
      } finally {
        setLoading(false);
      }
    }
    fetchAccounts();
  }, []);

  const toggleAccount = (id: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updates = accounts.map((a) => ({
        id: a.id,
        isEnabled: enabledIds.has(a.id),
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

      router.push("/personality");
    } catch {
      setError("Failed to save account selections");
    } finally {
      setSaving(false);
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Select Accounts for Auto-Reply
        </h1>
        <p className="text-muted-foreground">
          Choose which accounts your AI agent should automatically reply to when
          they post. You can change these anytime.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">
              No accounts found. Go to Connections and click &quot;Ingest My
              Profile&quot; to analyze your engagement patterns.
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push("/connections")}
            >
              Go to Connections
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Engaged accounts section */}
          {engagedAccounts.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <CardTitle className="text-lg">
                    Accounts You Engage With
                  </CardTitle>
                </div>
                <CardDescription>
                  Based on your reply history — these are the accounts you
                  interact with most.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {engagedAccounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      isChecked={enabledIds.has(account.id)}
                      onToggle={() => toggleAccount(account.id)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommended accounts section */}
          {recommendedAccounts.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  <CardTitle className="text-lg">
                    Recommended Accounts
                  </CardTitle>
                </div>
                <CardDescription>
                  AI-suggested accounts based on your interests and who you
                  follow. Engaging with these could grow your reach.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recommendedAccounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      isChecked={enabledIds.has(account.id)}
                      onToggle={() => toggleAccount(account.id)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Save button */}
          <div className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">
              {enabledIds.size} account{enabledIds.size !== 1 ? "s" : ""}{" "}
              selected for auto-reply
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save & Enable Auto-Reply
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function AccountRow({
  account,
  isChecked,
  onToggle,
}: {
  account: WatchedAccount;
  isChecked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <Checkbox checked={isChecked} onCheckedChange={onToggle} />
      <Twitter className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">@{account.accountHandle}</span>
          {account.category && (
            <Badge variant="secondary" className="text-xs">
              {account.category}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {account.followersCount != null && (
            <span>{account.followersCount.toLocaleString()} followers</span>
          )}
          {account.replyCount > 0 && (
            <span>You replied {account.replyCount} times</span>
          )}
        </div>
      </div>
    </label>
  );
}
