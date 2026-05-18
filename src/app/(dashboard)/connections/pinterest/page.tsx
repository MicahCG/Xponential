import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  getCurrentConnection,
  listConnectionsForPlatform,
} from "@/lib/connection-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PinterestMethodStatus } from "@/components/connections/pinterest-method-status";
import { PinterestOAuthConnect } from "@/components/connections/pinterest-oauth-connect";
import { PinterestConnectedDashboard } from "@/components/connections/pinterest-connected-dashboard";
import { PinterestAccountList } from "@/components/connections/pinterest-account-list";

export const metadata = {
  title: "Connect Pinterest - Xponential",
};

export default async function PinterestConnectPage() {
  const session = await requireAuth();
  const userId = session.user!.id as string;

  const [accounts, current] = await Promise.all([
    listConnectionsForPlatform(userId, "pinterest"),
    getCurrentConnection(userId, "pinterest"),
  ]);

  const anyConnected = accounts.some((a) => a.hasAccessToken && a.status === "active");

  // Pull current account details + recent logs only when we have a selection
  let currentDetail: {
    accountHandle: string | null;
    accountId: string | null;
    scopes: string | null;
    tokenExpires: Date | null;
  } | null = null;
  let recentLogs: Array<{
    id: string;
    method: string;
    endpoint: string;
    responseStatus: number | null;
    success: boolean;
    createdAt: Date;
  }> = [];

  if (current && current.hasAccessToken) {
    const full = await prisma.platformConnection.findUnique({
      where: { id: current.id },
      select: {
        accountHandle: true,
        accountId: true,
        scopes: true,
        tokenExpires: true,
        workspaceId: true,
      },
    });
    if (full) {
      currentDetail = {
        accountHandle: full.accountHandle,
        accountId: full.accountId,
        scopes: full.scopes,
        tokenExpires: full.tokenExpires,
      };
      recentLogs = await prisma.pinterestApiLog.findMany({
        where: { workspaceId: full.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          method: true,
          endpoint: true,
          responseStatus: true,
          success: true,
          createdAt: true,
        },
      });
    }
  }

  if (anyConnected && currentDetail) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pinterest accounts</h1>
          <p className="text-muted-foreground">
            Manage every Pinterest account connected to your Xponential login.
          </p>
        </div>

        {accounts.length > 0 && (
          <PinterestAccountList accounts={accounts} currentId={current?.id ?? null} />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Connect another Pinterest account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Each additional account goes through the same Pinterest OAuth
              flow.
            </p>
            <Link href="/api/connect/start/pinterest">
              <Button>Connect another Pinterest account</Button>
            </Link>
          </CardContent>
        </Card>

        <div className="pt-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Active account: @{currentDetail.accountHandle}
          </h2>
          <PinterestConnectedDashboard
            brandName="your account"
            accountHandle={currentDetail.accountHandle}
            accountId={currentDetail.accountId}
            scopes={currentDetail.scopes}
            tokenExpiresAt={currentDetail.tokenExpires}
            recentLogs={recentLogs}
          />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Pinterest data handling described in our{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link
            href="/terms"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Terms of Service
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connect Pinterest</h1>
        <p className="text-muted-foreground">
          Connect Pinterest via the official Pinterest API. Each pin is
          published only when a human clicks Publish.
        </p>
      </div>

      <PinterestMethodStatus apiConnected={false} />

      <PinterestOAuthConnect
        connected={false}
        accountHandle={null}
        tokenExpiresAt={null}
        brandName="your account"
      />

      <p className="text-center text-xs text-muted-foreground">
        Pinterest data handling described in our{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link
          href="/terms"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Terms of Service
        </Link>
        .
      </p>
    </div>
  );
}
