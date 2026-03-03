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
import { Twitter, Linkedin, Loader2, Unlink } from "lucide-react";
import type { PlatformConnectionInfo } from "@/types";
import { formatDistanceToNow } from "date-fns";

const platformConfig = {
  x: {
    name: "X (Twitter)",
    icon: Twitter,
    description: "Post tweets and replies on your behalf",
  },
  linkedin: {
    name: "LinkedIn",
    icon: Linkedin,
    description: "Share posts and engage on LinkedIn",
  },
} as const;

export function PlatformCard({
  platform,
  connection,
}: {
  platform: "x" | "linkedin";
  connection?: PlatformConnectionInfo;
}) {
  const [disconnecting, setDisconnecting] = useState(false);
  const config = platformConfig[platform];
  const Icon = config.icon;

  const handleConnect = () => {
    window.location.href = `/api/connect/start/${platform}`;
  };

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
          <Badge variant={connection.status === "active" ? "default" : "secondary"}>
            {connection.status}
          </Badge>
        ) : (
          <Badge variant="outline">Not connected</Badge>
        )}
      </CardHeader>
      <CardContent>
        {connection ? (
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
        ) : (
          <Button onClick={handleConnect}>
            Connect {config.name}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
