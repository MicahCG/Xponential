import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  Shield,
  ShieldCheck,
  FileText,
  AtSign,
  Calendar,
  Hash,
  Building2,
  AlertTriangle,
  PenSquare,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { PinterestBoardTest } from "./pinterest-board-test";

const RECOGNIZED_SCOPES = [
  { key: "user_accounts:read", label: "Read account info" },
  { key: "boards:read", label: "Read boards" },
  { key: "pins:read", label: "Read pins" },
  { key: "pins:write", label: "Create pins" },
  { key: "boards:write", label: "Create boards" },
] as const;

interface RecentApiLog {
  id: string;
  method: string;
  endpoint: string;
  responseStatus: number | null;
  success: boolean;
  createdAt: Date;
}

interface Props {
  brandName: string;
  accountHandle: string | null;
  accountId: string | null;
  scopes: string | null;
  tokenExpiresAt: Date | null;
  recentLogs: RecentApiLog[];
}

function maskAccountId(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 6) return id;
  return id.slice(0, 3) + "…" + id.slice(-3);
}

function tokenHealth(tokenExpiresAt: Date | null): {
  label: string;
  tone: "ok" | "warn" | "bad";
  detail: string;
} {
  if (!tokenExpiresAt) {
    return { label: "Healthy", tone: "ok", detail: "Token expiration not tracked." };
  }
  const msLeft = tokenExpiresAt.getTime() - Date.now();
  if (msLeft <= 0) {
    return {
      label: "Token expired — will auto-refresh on next call",
      tone: "warn",
      detail: "Refresh token will be used on the next API call.",
    };
  }
  const daysLeft = msLeft / (1000 * 60 * 60 * 24);
  if (daysLeft < 2) {
    return {
      label: "Token expires soon",
      tone: "warn",
      detail: "Will auto-refresh shortly before expiry.",
    };
  }
  return {
    label: "Healthy",
    tone: "ok",
    detail: "Access token valid and auto-refreshes near expiry.",
  };
}

export function PinterestConnectedDashboard({
  brandName,
  accountHandle,
  accountId,
  scopes,
  tokenExpiresAt,
  recentLogs,
}: Props) {
  const grantedSet = new Set(
    (scopes ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const health = tokenHealth(tokenExpiresAt);
  const writeGranted = grantedSet.has("pins:write");

  return (
    <div className="space-y-4">
      {/* 1. Connected Account Summary */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Connected to Pinterest
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Live OAuth connection to the Official Pinterest API v5
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/api/connect/start/pinterest">
              <Button variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Reconnect
              </Button>
            </Link>
            <Link href="/pinterest/compose">
              <Button>
                <PenSquare className="mr-2 h-4 w-4" />
                Open Pin Composer
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <SummaryRow
              icon={<AtSign className="h-4 w-4" />}
              label="Pinterest handle"
              value={accountHandle ? `@${accountHandle}` : "—"}
            />
            <SummaryRow
              icon={<Hash className="h-4 w-4" />}
              label="Account ID"
              value={maskAccountId(accountId)}
              mono
            />
            <SummaryRow
              icon={<Building2 className="h-4 w-4" />}
              label="Connected brand"
              value={brandName}
            />
            <SummaryRow
              icon={<Calendar className="h-4 w-4" />}
              label="Token expires"
              value={
                tokenExpiresAt
                  ? tokenExpiresAt.toLocaleString()
                  : "Not tracked"
              }
            />
            <div className="sm:col-span-2">
              <div
                className={
                  "flex items-start gap-2 rounded-md p-2.5 text-sm " +
                  (health.tone === "ok"
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400")
                }
              >
                {health.tone === "ok" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div>
                  <div className="font-medium">{health.label}</div>
                  <div className="text-xs opacity-80">{health.detail}</div>
                </div>
              </div>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 7. Trial Access card */}
      <Card className="border-amber-500/30 bg-amber-500/[0.03]">
        <CardContent className="flex gap-3 py-4 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            Xponential is currently using Pinterest{" "}
            <span className="font-medium">Trial Access</span>. Standard Access
            is requested so approved Pins can be published through
            Pinterest&apos;s official API in production.
          </p>
        </CardContent>
      </Card>

      {/* 2. Granted Permissions / Scopes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Granted Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1.5 text-sm">
            {RECOGNIZED_SCOPES.map((s) => {
              const granted = grantedSet.has(s.key);
              return (
                <li key={s.key} className="flex items-center gap-2">
                  {granted ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  )}
                  <code className="text-xs font-mono">{s.key}</code>
                  <span
                    className={
                      granted ? "text-foreground" : "text-muted-foreground"
                    }
                  >
                    — {s.label}
                  </span>
                </li>
              );
            })}
          </ul>
          {!writeGranted && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Publishing may be limited while the app is in Trial Access.
                Standard Access is required for production Pin creation.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Board Access Test */}
      <PinterestBoardTest />

      {/* 5. API Logs Preview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" />
            Recent API Activity
          </CardTitle>
          <Link href="/pinterest/logs">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Pinterest API calls yet. Run the Board Access Test above or
              publish a pin to populate this.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {recentLogs.map((log) => (
                <li
                  key={log.id}
                  className="flex flex-wrap items-center gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span
                    className={
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] " +
                      (log.success
                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                        : "bg-destructive/15 text-destructive")
                    }
                  >
                    {log.success ? "✓" : "✗"}
                  </span>
                  <span className="font-mono text-xs font-semibold uppercase">
                    {log.method}
                  </span>
                  <code className="flex-1 truncate text-xs">{log.endpoint}</code>
                  {log.responseStatus != null && (
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-xs " +
                        (log.success
                          ? "bg-green-500/10 text-green-700 dark:text-green-400"
                          : "bg-destructive/10 text-destructive")
                      }
                    >
                      {log.responseStatus}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 6. Safety Controls card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5" />
            Safety Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {[
              "Human-controlled publishing",
              "One Pin at a time",
              "Brand-scoped connection",
              "Required board selection before publishing",
              "Every API request is logged",
              "No bulk publishing in Phase 1",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd
          className={
            "mt-0.5 truncate " +
            (mono ? "font-mono text-sm" : "text-sm font-medium")
          }
        >
          {value}
        </dd>
      </div>
    </div>
  );
}
