"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Twitter, Loader2, Unlink, AlertTriangle } from "lucide-react";
import Link from "next/link";
import type { PlatformConnectionInfo } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { IngestButton } from "./ingest-button";

const platformConfig = {
  x: {
    name: "X (Twitter)",
    icon: Twitter,
    description: "Post tweets and replies on your behalf",
  },
} as const;

export function PlatformCard({
  platform,
  connection,
}: {
  platform: "x";
  connection?: PlatformConnectionInfo;
}) {
  const [disconnecting, setDisconnecting] = useState(false);
  const config = platformConfig[platform];
  const Icon = config.icon;

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/connect/disconnect/${platform}`, {
        method: "DELETE",
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <CardTitle className="text-base">{config.name}</CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </div>
        {connection ? (
          platform === "x" && connection.status === "active" && connection.hasCookie === false ? (
            <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
              Setup incomplete
            </Badge>
          ) : (
            <Badge variant={connection.status === "active" ? "default" : "secondary"}>
              {connection.status}
            </Badge>
          )
        ) : (
          <Badge variant="outline">Not connected</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {connection ? (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Connected as{" "}
                <span className="font-medium text-foreground">
                  {platform === "x" ? "@" : ""}
                  {connection.accountHandle}
                </span>
                {" "}
                {formatDistanceToNow(new Date(connection.connectedAt), {
                  addSuffix: true,
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="mr-2 h-4 w-4" />
                )}
                Disconnect
              </Button>
            </div>
            {platform === "x" && connection.status === "active" && connection.hasCookie === false && (
              <div className="rounded-md bg-yellow-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4" />
                  Cookie required to post tweets
                </div>
                <p className="text-xs text-muted-foreground">
                  Your X account is linked, but posting won&apos;t work until you add your Twitter cookie.
                </p>
                <Button asChild size="sm">
                  <Link href="/connections/x/cookie-setup">
                    Complete Setup
                  </Link>
                </Button>
              </div>
            )}
            {platform === "x" && connection.status === "active" && (
              <IngestButton />
            )}
          </>
        ) : (
          <Button asChild>
            <a href={`/api/connect/start/${platform}`}>
              Connect {config.name}
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
