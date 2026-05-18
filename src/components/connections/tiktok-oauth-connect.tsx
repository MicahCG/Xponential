"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, LogIn, RefreshCw, ShieldCheck, Unlink } from "lucide-react";

interface Props {
  connected: boolean;
  accountHandle: string | null;
  tokenExpiresAt: string | null;
  brandName: string;
}

export function TikTokOAuthConnect({
  connected,
  accountHandle,
  tokenExpiresAt,
  brandName,
}: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  function startOAuth() {
    window.location.href = "/api/connect/start/tiktok";
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/connections/tiktok/oauth", {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-600" />
          Official TikTok API
        </CardTitle>
        <CardDescription>
          OAuth 2.0 via TikTok Login Kit. Video drafts are sent to your TikTok
          inbox via the Content Posting API — you publish from the TikTok app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected ? (
          <>
            <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                Connected as{" "}
                <span className="font-medium">@{accountHandle}</span> for{" "}
                <span className="font-medium">{brandName}</span>
              </div>
              {tokenExpiresAt && (
                <div className="mt-1 text-xs text-green-700/70 dark:text-green-400/70">
                  Access token refreshes automatically — current token expires{" "}
                  {new Date(tokenExpiresAt).toLocaleString()}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={startOAuth}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reconnect
              </Button>
              <Button
                variant="outline"
                onClick={disconnect}
                disabled={disconnecting}
                className="text-destructive"
              >
                {disconnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="mr-2 h-4 w-4" />
                )}
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                Standard OAuth 2.0 authorization-code flow
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                Scopes requested:{" "}
                <code className="text-xs">user.info.basic · video.upload</code>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                Each video draft is published via{" "}
                <code className="text-xs">POST /v2/post/publish/inbox/video/init/</code>{" "}
                after a human clicks Publish
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                Final publish always happens in the TikTok app — we never
                request <code className="text-xs">video.publish</code>
              </li>
              <li className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                All API requests and responses are logged in this dashboard
              </li>
            </ul>
            <Button onClick={startOAuth} className="w-full sm:w-auto">
              <LogIn className="mr-2 h-4 w-4" />
              Connect with TikTok
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
