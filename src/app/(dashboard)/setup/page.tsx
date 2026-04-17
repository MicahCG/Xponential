"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2, Check, Twitter, ArrowRight } from "lucide-react";
import { AnalyzeStep } from "@/components/setup/analyze-step";
import { AccountsStep } from "@/components/setup/accounts-step";
import { CookieStep } from "@/components/setup/cookie-step";

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

// ─── Stepper Component ──────────────────────────────────────

function Stepper({ currentStep }: { currentStep: number }) {
  const steps = [
    { num: 1, label: "Connect X" },
    { num: 2, label: "Analyze Profile" },
    { num: 3, label: "Select Accounts" },
    { num: 4, label: "Add Cookie" },
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
              // All setup complete, go to auto-replies
              router.replace("/content");
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
          Four quick steps to start auto-replying in your voice
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
              setCurrentStep(4);
            }}
          />
        )}

        {currentStep === 4 && (
          <CookieStep
            onComplete={() => {
              router.push("/content");
            }}
          />
        )}
      </div>
    </div>
  );
}
