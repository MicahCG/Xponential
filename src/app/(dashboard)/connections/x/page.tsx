import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  getCurrentConnection,
  listConnectionsForPlatform,
} from "@/lib/connection-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XAccountList, type XAccountRow } from "@/components/connections/x-account-list";
import { Twitter, LogIn } from "lucide-react";

export const metadata = {
  title: "X / Twitter accounts - Xponential",
};

export default async function XConnectionsPage() {
  const session = await requireAuth();
  const userId = session.user!.id as string;

  const [accounts, current] = await Promise.all([
    listConnectionsForPlatform(userId, "x"),
    getCurrentConnection(userId, "x"),
  ]);

  // For each X connection, we also need to know if it has a Twitter cookie
  // (separate concern from OAuth tokens).
  const cookieStatus = await prisma.platformConnection.findMany({
    where: { userId, platform: "x" },
    select: { id: true, twitterCookie: true },
  });
  const cookieMap = new Map(
    cookieStatus.map((c) => [c.id, !!c.twitterCookie])
  );

  const rows: XAccountRow[] = accounts.map((a) => ({
    id: a.id,
    accountHandle: a.accountHandle,
    accountId: a.accountId,
    status: a.status,
    hasAccessToken: a.hasAccessToken,
    hasCookie: cookieMap.get(a.id) ?? false,
    tokenExpires: a.tokenExpires,
  }));

  const anyConnected = rows.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {anyConnected ? "X / Twitter accounts" : "Connect X / Twitter"}
        </h1>
        <p className="text-muted-foreground">
          {anyConnected
            ? "Every X account connected to your Xponential login. Click an account to set it as the active one for auto-replies and posting."
            : "Connect your X account via OAuth so Xponential can read your profile. A Twitter cookie is required separately for posting via Apify."}
        </p>
      </div>

      {anyConnected && <XAccountList accounts={rows} currentId={current?.id ?? null} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {anyConnected ? "Connect another X account" : "Connect your X account"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            OAuth establishes the connection. After OAuth completes, set a
            Twitter cookie for that account so Xponential can post via the
            Apify path (X&apos;s posting API was blocked Feb 2026).
          </p>
          <Link href="/api/connect/start/x">
            <Button>
              <LogIn className="mr-2 h-4 w-4" />
              {anyConnected ? "Connect another X account" : "Connect with X"}
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Twitter className="h-4 w-4" />
            How posting works
          </h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              <strong className="text-foreground">OAuth token</strong> — used
              for reading the X profile, getting tweets, learning your voice
            </li>
            <li>
              <strong className="text-foreground">Twitter cookie</strong> —
              required to actually post tweets via Apify. Capture via the
              Cookie-Editor Chrome extension and paste into the cookie setup
              page for each account
            </li>
            <li>
              <strong className="text-foreground">Auto-replies</strong> — go to{" "}
              <Link href="/content" className="underline underline-offset-2 hover:text-foreground">
                /content
              </Link>{" "}
              and select an account to manage watched accounts + reply
              instructions per X account
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
