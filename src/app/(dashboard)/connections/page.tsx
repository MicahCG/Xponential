import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { listConnectionsForPlatform } from "@/lib/connection-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  ExternalLink,
  Pin as PinIcon,
  Twitter,
  Music2,
  Plus,
} from "lucide-react";
import type { ConnectionSummary } from "@/lib/connection-context";

export const metadata = { title: "Connections - Xponential" };

interface PlatformGroupProps {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  accounts: ConnectionSummary[];
  manageHref: string;
  openHref: string;
  openLabel: string;
  connectHref: string;
  connectLabel: string;
}

function PlatformGroup(props: PlatformGroupProps) {
  const activeAccounts = props.accounts.filter(
    (a) => a.status === "active" && a.hasAccessToken
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-md ${props.iconBg}`}
          >
            {props.icon}
          </div>
          <div>
            <CardTitle className="text-base">{props.title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {activeAccounts.length} active account
              {activeAccounts.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={props.connectHref}>
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-3 w-3" />
              {props.connectLabel}
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts connected yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {props.accounts.map((a) => {
              const ok = a.status === "active" && a.hasAccessToken;
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <Check
                    className={
                      "h-4 w-4 shrink-0 " +
                      (ok ? "text-green-600" : "text-muted-foreground/40")
                    }
                  />
                  <span className="flex-1 truncate">
                    @{a.accountHandle ?? "unknown"}
                  </span>
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-xs " +
                      (ok
                        ? "bg-green-500/10 text-green-700 dark:text-green-400"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    {ok ? "Active" : a.hasAccessToken ? a.status : "Reconnect"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex gap-2 pt-1">
          <Link href={props.manageHref}>
            <Button variant="outline" size="sm">
              Manage
            </Button>
          </Link>
          {activeAccounts.length > 0 && (
            <Link href={props.openHref}>
              <Button variant="ghost" size="sm">
                {props.openLabel}
                <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ConnectionsHubPage() {
  const session = await requireAuth();
  const userId = session.user!.id as string;

  const [xAccounts, pinAccounts, tiktokAccounts] = await Promise.all([
    listConnectionsForPlatform(userId, "x"),
    listConnectionsForPlatform(userId, "pinterest"),
    listConnectionsForPlatform(userId, "tiktok"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
        <p className="text-muted-foreground">
          One login, every account. Connect multiple accounts per platform and
          switch between them on each platform&apos;s page.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <PlatformGroup
          title="X / Twitter"
          iconBg="bg-foreground"
          icon={<Twitter className="h-5 w-5 text-background" />}
          accounts={xAccounts}
          manageHref="/connections/x"
          openHref="/content"
          openLabel="Open auto-replies"
          connectHref="/api/connect/start/x"
          connectLabel={xAccounts.length === 0 ? "Connect X" : "Add another X"}
        />

        <PlatformGroup
          title="Pinterest"
          iconBg="bg-red-500"
          icon={<PinIcon className="h-5 w-5 text-white" />}
          accounts={pinAccounts}
          manageHref="/connections/pinterest"
          openHref="/pinterest"
          openLabel="Open Pinterest"
          connectHref="/api/connect/start/pinterest"
          connectLabel={
            pinAccounts.length === 0
              ? "Connect Pinterest"
              : "Add another Pinterest"
          }
        />

        <PlatformGroup
          title="TikTok"
          iconBg="bg-black"
          icon={<Music2 className="h-5 w-5 text-white" />}
          accounts={tiktokAccounts}
          manageHref="/connections/tiktok"
          openHref="/tiktok"
          openLabel="Open TikTok"
          connectHref="/api/connect/start/tiktok"
          connectLabel={
            tiktokAccounts.length === 0 ? "Connect TikTok" : "Add another TikTok"
          }
        />
      </div>

      <Card>
        <CardContent className="py-5">
          <h3 className="mb-1 text-sm font-semibold">Coming soon</h3>
          <p className="text-sm text-muted-foreground">
            Instagram will appear here once its adapter is built.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
