"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  Loader2,
  Check,
  Twitter,
  Brain,
  Users,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Rocket,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface Connection {
  platform: string;
  status: string;
  accountHandle: string | null;
}

interface WatchedAccount {
  id: string;
  accountHandle: string;
  followersCount: number | null;
  isRecommended: boolean;
  isEnabled: boolean;
  replyCount: number;
  category: string | null;
}

// ─── Progress Messages ──────────────────────────────────────

const PROGRESS_MESSAGES = [
  "Fetching your tweets and replies...",
  "Analyzing your writing style...",
  "Building your personality profile...",
  "Identifying engagement patterns...",
  "Generating account recommendations...",
  "Almost done...",
];

const MAX_ACCOUNTS = 5;

// ─── Stepper Component ──────────────────────────────────────

function Stepper({ currentStep }: { currentStep: number }) {
  const steps = [
    { num: 1, label: "Connect X" },
    { num: 2, label: "Analyze Profile" },
    { num: 3, label: "Select Accounts" },
  ];

  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, idx) => (
        <div key={step.num} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                currentStep > step.num
                  ? "bg-green-500 text-white"
                  : currentStep === step.num
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {currentStep > step.num ? (
                <Check className="h-4 w-4" />
              ) : (
                step.num
              )}
            </div>
            <span
              className={cn(
                "text-sm font-medium",
                currentStep >= step.num
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={cn(
                "mx-4 h-px w-12",
                currentStep > step.num ? "bg-green-500" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Connect X ──────────────────────────────────────

function ConnectStep({
  connection,
  onContinue,
}: {
  connection: Connection | null;
  onContinue: () => void;
}) {
  const isConnected = connection?.status === "active";

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Twitter className="h-8 w-8" />
        </div>
        <CardTitle className="text-xl">Connect your X account</CardTitle>
        <CardDescription>
          We&apos;ll analyze your tweets, replies, and engagement to build your
          unique voice profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {isConnected ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950">
              <Check className="h-5 w-5 text-green-600" />
              <span className="font-medium">
                Connected as @{connection?.accountHandle}
              </span>
            </div>
            <Button onClick={onContinue} className="w-full">
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button asChild className="w-full">
            <a href="/api/connect/start/x?returnTo=/setup">
              <Twitter className="mr-2 h-4 w-4" />
              Connect X
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Step 2: Analyze Profile ────────────────────────────────

function AnalyzeStep({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [progressIdx, setProgressIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const hasStarted = useRef(false);

  const runIngest = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    setProgressIdx(0);

    const interval = setInterval(() => {
      setProgressIdx((prev) =>
        prev < PROGRESS_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 8000);

    try {
      const res = await fetch("/api/personality/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to analyze profile");
        setAnalyzing(false);
        return;
      }

      // Success — advance to step 3
      onComplete();
    } catch {
      setError("Something went wrong. Please try again.");
      setAnalyzing(false);
    } finally {
      clearInterval(interval);
    }
  }, [onComplete]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runIngest();
  }, [runIngest]);

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Brain className="h-8 w-8" />
        </div>
        <CardTitle className="text-xl">Analyzing your profile</CardTitle>
        <CardDescription>
          We&apos;re studying your tweets, replies, and engagement to understand
          your unique voice.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {error ? (
          <>
            <div className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
              {error}
            </div>
            <Button
              onClick={() => {
                hasStarted.current = false;
                runIngest();
              }}
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </>
        ) : analyzing ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {PROGRESS_MESSAGES[progressIdx]}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── Step 3: Select Accounts ────────────────────────────────

function AccountsStep({ onComplete }: { onComplete: () => void }) {
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
        // Pre-select engaged accounts (up to MAX_ACCOUNTS)
        const engaged = data.accounts
          .filter((a: WatchedAccount) => !a.isRecommended)
          .slice(0, MAX_ACCOUNTS);
        setEnabledIds(new Set(engaged.map((a: WatchedAccount) => a.id)));
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
      } else if (next.size < MAX_ACCOUNTS) {
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

      onComplete();
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">Choose accounts to auto-reply to</h2>
        <p className="text-muted-foreground">
          Select up to {MAX_ACCOUNTS} accounts. Your AI agent will monitor their
          posts and generate replies in your voice.
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
              No accounts found. Your profile analysis may not have found enough
              engagement data.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
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
                  Based on your reply history — accounts you interact with most.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {engagedAccounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      isChecked={enabledIds.has(account.id)}
                      isDisabled={
                        !enabledIds.has(account.id) &&
                        enabledIds.size >= MAX_ACCOUNTS
                      }
                      onToggle={() => toggleAccount(account.id)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
                  AI-suggested accounts based on your interests. Engaging could
                  grow your reach.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recommendedAccounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      isChecked={enabledIds.has(account.id)}
                      isDisabled={
                        !enabledIds.has(account.id) &&
                        enabledIds.size >= MAX_ACCOUNTS
                      }
                      onToggle={() => toggleAccount(account.id)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">
              {enabledIds.size}/{MAX_ACCOUNTS} account
              {enabledIds.size !== 1 ? "s" : ""} selected
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || enabledIds.size === 0}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="mr-2 h-4 w-4" />
              )}
              Finish Setup
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Account Row ────────────────────────────────────────────

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
          : "hover:bg-muted/50"
      )}
    >
      <Checkbox
        checked={isChecked}
        onCheckedChange={onToggle}
        disabled={isDisabled && !isChecked}
      />
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

// ─── Main Setup Page ────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [xConnection, setXConnection] = useState<Connection | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkState() {
      try {
        const [connectRes, profileRes] = await Promise.all([
          fetch("/api/connect/list"),
          fetch("/api/personality/profile"),
        ]);

        // Check X connection
        if (connectRes.ok) {
          const connections: Connection[] = await connectRes.json();
          const x = connections.find(
            (c) => c.platform === "x" && c.status === "active"
          );
          if (x) setXConnection(x);
        }

        // Check personality profile
        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (profile?.id) setHasProfile(true);
        }

        // Check watched accounts
        const accountsRes = await fetch("/api/watched-accounts");
        if (accountsRes.ok) {
          const data = await accountsRes.json();
          const enabled = data.accounts?.filter(
            (a: WatchedAccount) => a.isEnabled
          );
          if (enabled?.length > 0 && profileRes.ok) {
            const profile = await profileRes.json().catch(() => null);
            if (profile?.id) {
              // All setup complete, go to dashboard
              router.replace("/dashboard");
              return;
            }
          }
        }
      } catch {
        // Continue with step 1 on error
      } finally {
        setLoading(false);
      }
    }
    checkState();
  }, [router]);

  // Determine initial step based on state
  useEffect(() => {
    if (loading) return;

    const justConnected = searchParams.get("connected") === "x";

    if (hasProfile) {
      setCurrentStep(3);
    } else if (xConnection || justConnected) {
      if (justConnected && !xConnection) {
        // Refetch connection after OAuth redirect
        fetch("/api/connect/list")
          .then((res) => res.json())
          .then((connections: Connection[]) => {
            const x = connections.find(
              (c) => c.platform === "x" && c.status === "active"
            );
            if (x) setXConnection(x);
          });
      }
      setCurrentStep(2);
    } else {
      setCurrentStep(1);
    }
  }, [loading, xConnection, hasProfile, searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Set up Xponential
        </h1>
        <p className="text-muted-foreground">
          Three quick steps to start auto-replying in your voice
        </p>
      </div>

      <Stepper currentStep={currentStep} />

      <div className="py-4">
        {currentStep === 1 && (
          <ConnectStep
            connection={xConnection}
            onContinue={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <AnalyzeStep
            onComplete={() => {
              setHasProfile(true);
              setCurrentStep(3);
            }}
          />
        )}

        {currentStep === 3 && (
          <AccountsStep
            onComplete={() => {
              router.push("/dashboard");
            }}
          />
        )}
      </div>
    </div>
  );
}
