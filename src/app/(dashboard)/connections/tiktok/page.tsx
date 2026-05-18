import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import {
  getCurrentConnection,
  listConnectionsForPlatform,
} from "@/lib/connection-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TikTokMethodStatus } from "@/components/connections/tiktok-method-status";
import { TikTokOAuthConnect } from "@/components/connections/tiktok-oauth-connect";
import { TikTokAccountList } from "@/components/connections/tiktok-account-list";

export const metadata = {
  title: "Connect TikTok - Xponential",
};

export default async function TikTokConnectPage() {
  const session = await requireAuth();
  const userId = session.user!.id as string;

  const [accounts, current] = await Promise.all([
    listConnectionsForPlatform(userId, "tiktok"),
    getCurrentConnection(userId, "tiktok"),
  ]);

  const anyConnected = accounts.some((a) => a.hasAccessToken && a.status === "active");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {anyConnected ? "TikTok accounts" : "Connect TikTok"}
        </h1>
        <p className="text-muted-foreground">
          {anyConnected
            ? "Manage every TikTok account connected to your Xponential login. Switch the active one for posting on the TikTok page."
            : "Connect your TikTok account via the official Login Kit. Each video draft is sent to your TikTok inbox — you review and publish from the TikTok app."}
        </p>
      </div>

      <TikTokMethodStatus apiConnected={anyConnected} />

      {accounts.length > 0 && (
        <TikTokAccountList accounts={accounts} currentId={current?.id ?? null} />
      )}

      {accounts.length === 0 ? (
        <TikTokOAuthConnect
          connected={false}
          accountHandle={null}
          tokenExpiresAt={null}
          brandName="your account"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect another TikTok account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Each additional account goes through the same OAuth flow. In
              Sandbox mode, the TikTok account must be added as a Target User
              on the developer app first.
            </p>
            <Link href="/api/connect/start/tiktok">
              <Button>Connect another TikTok account</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Xponential&apos;s handling of TikTok data is described in our{" "}
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
