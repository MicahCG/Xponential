"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  Loader2,
  RefreshCw,
  Unlink,
  Cookie,
  AlertCircle,
} from "lucide-react";

export interface XAccountRow {
  id: string;
  accountHandle: string | null;
  accountId: string | null;
  status: string;
  hasAccessToken: boolean;
  hasCookie: boolean;
  tokenExpires: Date | null;
}

interface Props {
  accounts: XAccountRow[];
  currentId: string | null;
}

export function XAccountList({ accounts, currentId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function selectAccount(id: string) {
    if (id === currentId) return;
    startTransition(async () => {
      const res = await fetch("/api/connections/x/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id }),
      });
      if (res.ok) router.refresh();
    });
  }

  async function disconnect(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/connections/x/${id}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Connected X accounts ({accounts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {accounts.map((a) => {
          const isCurrent = a.id === currentId;
          const isHealthy = a.status === "active" && a.hasAccessToken && a.hasCookie;
          const cookieMissing = a.hasAccessToken && !a.hasCookie;
          const oauthDead = !a.hasAccessToken;
          return (
            <div
              key={a.id}
              className={
                "rounded-md border p-3 " +
                (isCurrent ? "border-green-500/40 bg-green-500/[0.03]" : "")
              }
            >
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => selectAccount(a.id)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <div
                    className={
                      "flex h-5 w-5 items-center justify-center rounded-full border " +
                      (isCurrent ? "border-green-600 bg-green-600 text-white" : "")
                    }
                  >
                    {isCurrent && <Check className="h-3 w-3" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      @{a.accountHandle ?? "unknown"}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {isHealthy && (
                        <span className="text-green-700 dark:text-green-400">
                          ✓ Ready to post
                        </span>
                      )}
                      {cookieMissing && (
                        <span className="text-amber-700 dark:text-amber-400">
                          ⚠ Cookie missing — posting will fail
                        </span>
                      )}
                      {oauthDead && (
                        <span className="text-destructive">
                          ✗ Reconnect required (no OAuth token)
                        </span>
                      )}
                      {a.tokenExpires && a.hasAccessToken && (
                        <span>
                          · OAuth expires{" "}
                          {new Date(a.tokenExpires).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex flex-wrap gap-1">
                  <Link
                    href={`/connections/x/cookie-setup?connectionId=${a.id}`}
                  >
                    <Button variant="ghost" size="sm" title="Set or update cookie">
                      <Cookie className="h-4 w-4" />
                    </Button>
                  </Link>
                  <a href="/api/connect/start/x">
                    <Button variant="ghost" size="sm" title="Reconnect OAuth">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnect(a.id)}
                    disabled={busyId === a.id}
                    className="text-destructive hover:text-destructive"
                    title="Disconnect"
                  >
                    {busyId === a.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Unlink className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              {cookieMissing && (
                <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    Auto-replies and originals need a Twitter cookie to post via
                    Apify. Click the cookie icon to set one up.
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {pending && (
          <p className="text-xs text-muted-foreground">Updating selection…</p>
        )}
      </CardContent>
    </Card>
  );
}
