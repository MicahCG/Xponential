"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Send, Loader2 } from "lucide-react";

interface QueueItem {
  id: string;
  content: string;
  platform: string;
  postType: string;
  status: string;
  createdAt: string;
}

export function QueueList({ items: initialItems }: { items: QueueItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const updateItem = async (
    id: string,
    action: "approved" | "rejected" | "publish"
  ) => {
    setActionLoading(id);
    try {
      if (action === "publish") {
        const res = await fetch("/api/content/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueItemId: id }),
        });
        if (res.ok) {
          setItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, status: "posted" } : item
            )
          );
        }
      } else {
        const res = await fetch(`/api/content/queue/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: action }),
        });
        if (res.ok) {
          setItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, status: action } : item
            )
          );
        }
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No items in queue. Generate some content to get started.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {item.platform}
                </Badge>
                <Badge variant="secondary" className="capitalize">
                  {item.postType}
                </Badge>
              </div>
              <Badge
                variant={
                  item.status === "approved"
                    ? "default"
                    : item.status === "posted"
                      ? "default"
                      : item.status === "rejected"
                        ? "destructive"
                        : "secondary"
                }
                className="capitalize"
              >
                {item.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-3 whitespace-pre-wrap text-foreground">
              {item.content}
            </CardDescription>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {item.content.length} chars
              </span>
              <div className="flex gap-2">
                {item.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateItem(item.id, "rejected")}
                      disabled={actionLoading === item.id}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => updateItem(item.id, "approved")}
                      disabled={actionLoading === item.id}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Approve
                    </Button>
                  </>
                )}
                {item.status === "approved" && (
                  <Button
                    size="sm"
                    onClick={() => updateItem(item.id, "publish")}
                    disabled={actionLoading === item.id}
                  >
                    {actionLoading === item.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="mr-1 h-3 w-3" />
                    )}
                    Publish
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
