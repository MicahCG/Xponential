"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Play,
  Trash2,
  Music2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { CreateChannelDialog, type TikTokConnectionOption } from "./create-channel-dialog";

interface Run {
  id: string;
  status: string;
  createdAt: string;
  videoUrl?: string | null;
  platformPostId?: string | null;
  errorMessage?: string | null;
}

interface Channel {
  id: string;
  name: string;
  promptTemplate: string;
  durationSec: number | null;
  orientation: string | null;
  style: string | null;
  isActive: boolean;
  connection: {
    id: string;
    platform: string;
    accountHandle: string | null;
    status: string;
  };
  runs: Run[];
}

interface Props {
  tiktokConnections: TikTokConnectionOption[];
}

export function ChannelList({ tiktokConnections }: Props) {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  // Map of runId → status while we're polling
  const [polling, setPolling] = useState<Record<string, Run | undefined>>({});
  const [rescuing, setRescuing] = useState<Record<string, string | undefined>>(
    {}
  );
  // Tracks active poll loops so we never spawn a duplicate for the same run
  // and so we can cancel them on unmount. Production logs showed up to ~8
  // run-detail calls per second per run — multiple loops compounding from
  // repeat "Generate video" clicks and tab switches. Each loop also drove a
  // Popcorn + TikTok API call, so the stampede had real downstream cost.
  const pollersRef = useRef<Map<string, { cancelled: boolean }>>(new Map());
  // Also cleared on unmount so stale closures don't keep firing.
  useEffect(() => {
    const pollers = pollersRef.current;
    return () => {
      pollers.forEach((p) => {
        p.cancelled = true;
      });
      pollers.clear();
    };
  }, []);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/channels");
      const data = await res.json();
      setChannels(data.channels ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  async function runChannel(channelId: string) {
    const res = await fetch(`/api/channels/${channelId}/run`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.runId) {
      // Optimistic UI update will get corrected on refresh
      fetchChannels();
      return;
    }
    // Start polling
    pollRun(channelId, body.runId);
    // Also refresh the channel list so the new pending run shows
    fetchChannels();
  }

  function pollRun(channelId: string, runId: string) {
    // De-dupe: if a poll loop is already running for this run, don't spawn a
    // second one. This is the root cause of the prod stampede — repeated
    // clicks / tab visibility changes / strict-mode double-mounts were each
    // spawning a fresh setTimeout chain that never knew about the others.
    if (pollersRef.current.get(runId)) return;
    const handle = { cancelled: false };
    pollersRef.current.set(runId, handle);

    const finish = () => {
      handle.cancelled = true;
      pollersRef.current.delete(runId);
    };

    // Backoff schedule: 5s for the first minute, then 15s. Popcorn renders
    // take 15-35 minutes, so frequent polling early on (just enough to feel
    // responsive after click) then taper off — the 3-minute cron does the
    // heavy lifting once you've navigated away anyway.
    const startedAt = Date.now();
    const nextDelay = () => (Date.now() - startedAt < 60_000 ? 5_000 : 15_000);

    const tick = async () => {
      if (handle.cancelled) return;
      try {
        const res = await fetch(`/api/channels/${channelId}/runs/${runId}`);
        if (handle.cancelled) return;
        if (!res.ok) {
          // Treat non-2xx as transient; back off but keep going.
          setTimeout(tick, 10_000);
          return;
        }
        const data = await res.json();
        const run = data.run as Run | undefined;
        if (!run) {
          finish();
          return;
        }
        setPolling((prev) => ({ ...prev, [runId]: run }));
        if (run.status === "posted" || run.status === "failed") {
          finish();
          fetchChannels();
          return;
        }
        setTimeout(tick, nextDelay());
      } catch {
        if (handle.cancelled) return;
        setTimeout(tick, 10_000);
      }
    };
    setTimeout(tick, 2_000);
  }

  async function rescueRun(channelId: string, runId: string) {
    setRescuing((prev) => ({ ...prev, [runId]: "Checking Popcorn…" }));
    try {
      const res = await fetch(
        `/api/channels/${channelId}/runs/${runId}/rescue`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setRescuing((prev) => ({
          ...prev,
          [runId]: "Recovered — uploading to TikTok…",
        }));
        pollRun(channelId, runId);
        fetchChannels();
      } else {
        setRescuing((prev) => ({
          ...prev,
          [runId]:
            body.message ?? body.error ?? `Recovery failed (HTTP ${res.status})`,
        }));
      }
    } catch (err) {
      setRescuing((prev) => ({
        ...prev,
        [runId]: err instanceof Error ? err.message : "Recovery failed",
      }));
    }
  }

  async function deleteChannel(channelId: string) {
    if (!confirm("Delete this channel? Past runs stay in history.")) return;
    const res = await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
    if (res.ok) fetchChannels();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {channels.length} channel{channels.length === 1 ? "" : "s"}
        </p>
        <Button onClick={() => setCreateOpen(true)} disabled={tiktokConnections.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          New channel
        </Button>
      </div>

      {tiktokConnections.length === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/[0.03]">
          <CardContent className="py-4 text-sm">
            Connect at least one TikTok account before creating a channel.{" "}
            <a
              href="/connections/tiktok"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Connect TikTok →
            </a>
          </CardContent>
        </Card>
      )}

      {channels.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No channels yet. Create one to start generating videos.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => {
            const activeRun = ch.runs[0]
              ? polling[ch.runs[0].id] ?? ch.runs[0]
              : undefined;
            return (
              <ChannelCard
                key={ch.id}
                channel={ch}
                activeRun={activeRun}
                onRun={() => runChannel(ch.id)}
                onDelete={() => deleteChannel(ch.id)}
                onRescue={
                  activeRun && activeRun.status === "failed"
                    ? () => rescueRun(ch.id, activeRun.id)
                    : undefined
                }
                rescueMessage={activeRun ? rescuing[activeRun.id] : undefined}
              />
            );
          })}
        </div>
      )}

      <CreateChannelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tiktokConnections={tiktokConnections}
        onCreated={() => {
          setCreateOpen(false);
          fetchChannels();
          router.refresh();
        }}
      />
    </div>
  );
}

function ChannelCard({
  channel,
  activeRun,
  onRun,
  onDelete,
  onRescue,
  rescueMessage,
}: {
  channel: Channel;
  activeRun: Run | undefined;
  onRun: () => void;
  onDelete: () => void;
  onRescue?: () => void;
  rescueMessage?: string;
}) {
  const inProgress =
    activeRun?.status === "generating" ||
    activeRun?.status === "ready" ||
    activeRun?.status === "posting";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{channel.name}</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <Music2 className="h-3 w-3" />
              TikTok · @{channel.connection.accountHandle ?? "?"}
            </Badge>
            {channel.durationSec && <span>{channel.durationSec}s</span>}
            {channel.orientation && <span>· {channel.orientation}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={onRun} disabled={inProgress}>
            {inProgress ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run channel
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
            title="Delete channel"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Prompt template
          </p>
          <p className="text-sm whitespace-pre-wrap">
            {channel.promptTemplate}
          </p>
        </div>

        {activeRun && (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <RunStatusIcon status={activeRun.status} />
              <span className="capitalize">
                {prettyStatus(activeRun.status)}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(activeRun.createdAt).toLocaleString()}
              </span>
            </div>
            {activeRun.errorMessage && (
              <div className="mt-1 text-xs text-destructive">
                {activeRun.errorMessage}
              </div>
            )}
            {onRescue && (
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={onRescue}>
                  Try recovery
                </Button>
                <span className="text-xs text-muted-foreground">
                  Re-checks Popcorn — if the video actually finished, resends
                  it to TikTok without burning a new generation.
                </span>
              </div>
            )}
            {rescueMessage && (
              <div className="mt-1 text-xs text-muted-foreground">
                {rescueMessage}
              </div>
            )}
            {activeRun.status === "posted" && (
              <div className="mt-2 flex items-center gap-3 text-xs">
                {activeRun.videoUrl && (
                  <a
                    href={activeRun.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View generated video
                  </a>
                )}
                <span className="text-muted-foreground">
                  Draft sent to your TikTok inbox — publish from the TikTok app.
                </span>
              </div>
            )}
          </div>
        )}

        {channel.runs.length > 1 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Recent runs ({channel.runs.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {channel.runs.slice(1).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 border-t py-1.5 text-xs"
                >
                  <RunStatusIcon status={r.status} />
                  <span className="capitalize">{prettyStatus(r.status)}</span>
                  <span className="ml-auto text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  if (status === "posted") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "generating" || status === "ready" || status === "posting")
    return <Loader2 className="h-4 w-4 animate-spin text-amber-600" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function prettyStatus(s: string) {
  if (s === "generating") return "Generating video…";
  if (s === "ready") return "Posting to TikTok…";
  if (s === "posting") return "Posting to TikTok…";
  if (s === "posted") return "Posted to TikTok inbox";
  if (s === "failed") return "Failed";
  if (s === "pending") return "Queued";
  return s;
}
