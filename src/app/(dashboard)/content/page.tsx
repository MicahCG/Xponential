"use client";

import { useState, useEffect, useCallback } from "react";
import { GenerateForm } from "@/components/content/generate-form";
import { QueueList } from "@/components/content/queue-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ContentPage() {
  const [queueItems, setQueueItems] = useState<
    {
      id: string;
      content: string;
      platform: string;
      postType: string;
      status: string;
      createdAt: string;
    }[]
  >([]);

  const fetchQueue = useCallback(async () => {
    const res = await fetch("/api/content/queue");
    if (res.ok) {
      const data = await res.json();
      setQueueItems(data);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content</h1>
        <p className="text-muted-foreground">
          Generate and manage your content queue
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GenerateForm
          onGenerated={() => {
            fetchQueue();
          }}
        />

        <div>
          <Tabs defaultValue="pending">
            <TabsList className="mb-4">
              <TabsTrigger value="pending">
                Pending ({queueItems.filter((i) => i.status === "pending").length})
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved ({queueItems.filter((i) => i.status === "approved").length})
              </TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
              <QueueList
                items={queueItems.filter((i) => i.status === "pending")}
              />
            </TabsContent>
            <TabsContent value="approved">
              <QueueList
                items={queueItems.filter((i) => i.status === "approved")}
              />
            </TabsContent>
            <TabsContent value="all">
              <QueueList items={queueItems} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
