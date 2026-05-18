"use client";

import { useState, useTransition } from "react";
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
} from "lucide-react";
import type { ConnectionSummary } from "@/lib/connection-context";

interface Props {
  accounts: ConnectionSummary[];
  currentId: string | null;
}

export function TikTokAccountList({ accounts, currentId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function selectAccount(id: string) {
    if (id === currentId) return;
    startTransition(async () => {
      const res = await fetch("/api/connections/tiktok/select", {
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
      // Each row's disconnect clears tokens on THAT connection
      const res = await fetch(`/api/connections/tiktok/${id}`, {
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
          Connected TikTok accounts ({accounts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {accounts.map((a) => {
          const isCurrent = a.id === currentId;
          const expiresLabel = a.tokenExpires
            ? `expires ${new Date(a.tokenExpires).toLocaleDateString()}`
            : "no expiry tracked";
          return (
            <div
              key={a.id}
              className={
                "flex flex-wrap items-center gap-3 rounded-md border p-3 " +
                (isCurrent ? "border-green-500/40 bg-green-500/[0.03]" : "")
              }
            >
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
                  <div className="text-xs text-muted-foreground">
                    {a.status === "active" && a.hasAccessToken
                      ? `Active · ${expiresLabel}`
                      : a.hasAccessToken
                        ? `Status: ${a.status}`
                        : "Reconnect required"}
                  </div>
                </div>
              </button>
              <div className="flex gap-1">
                <a href="/api/connect/start/tiktok">
                  <Button variant="ghost" size="sm" title="Reconnect this handle">
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
          );
        })}
        {pending && (
          <p className="text-xs text-muted-foreground">Updating selection…</p>
        )}
      </CardContent>
    </Card>
  );
}
