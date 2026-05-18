"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Save,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react";

interface Props {
  connectionId: string;
  accountHandle: string | null;
}

interface RunRow {
  id: string;
  status: string;
  videoUrl: string | null;
  platformPostId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export function TikTokTemplateCard({ connectionId, accountHandle }: Props) {
  const router = useRouter();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [savedPrompt, setSavedPrompt] = useState("");
  const [duration, setDuration] = useState<string>("");
  const [orientation, setOrientation] = useState<string>("portrait");
  const [style, setStyle] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Currently-active run (the one we're polling)
  const [activeRun, setActiveRun] = useState<RunRow | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunRow[]>([]);

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiktok/connections/${connectionId}/template`
      );
      if (!res.ok) {
        setError("Failed to load template");
        return;
      }
      const data = await res.json();
      setChannelId(data.channelId);
      setPrompt(data.promptTemplate ?? "");
      setSavedPrompt(data.promptTemplate ?? "");
      setDuration(data.durationSec != null ? String(data.durationSec) : "");
      setOrientation(data.orientation ?? "portrait");
      setStyle(data.style ?? "");
      setRecentRuns(data.recentRuns ?? []);
      const inflight = (data.recentRuns ?? []).find(
        (r: RunRow) =>
          r.status === "generating" || r.status === "ready" || r.status === "posting"
      );
      if (inflight) setActiveRun(inflight);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  // Poll active run while in progress
  useEffect(() => {
    if (!activeRun || !channelId) return;
    if (
      activeRun.status === "posted" ||
      activeRun.status === "failed"
    )
      return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/channels/${channelId}/runs/${activeRun.id}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const run = data.run as RunRow | undefined;
        if (!run || cancelled) return;
        setActiveRun(run);
        if (run.status === "posted" || run.status === "failed") {
          fetchTemplate();
          return;
        }
        if (!cancelled) setTimeout(tick, 5000);
      } catch {
        if (!cancelled) setTimeout(tick, 8000);
      }
    };
    const t = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeRun, channelId, fetchTemplate]);

  async function saveTemplate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tiktok/connections/${connectionId}/template`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promptTemplate: prompt,
            durationSec: duration ? Number(duration) : null,
            orientation: orientation || null,
            style: style || null,
          }),
        }
      );
      if (!res.ok) {
        setError("Failed to save template");
        return;
      }
      setSavedPrompt(prompt);
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!channelId) return;
    if (!prompt.trim()) {
      setError("Add a prompt before generating.");
      return;
    }
    // Auto-save before generating so the run uses the current text
    if (prompt !== savedPrompt) {
      await saveTemplate();
    }
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/run`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof body.error === "string" ? body.error : "Failed to start generation"
        );
        return;
      }
      // Bootstrap the active run from what the server returned
      const newRun: RunRow = {
        id: body.runId,
        status: body.status ?? "generating",
        videoUrl: null,
        platformPostId: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setActiveRun(newRun);
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  const inProgress =
    activeRun &&
    (activeRun.status === "generating" ||
      activeRun.status === "ready" ||
      activeRun.status === "posting");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Video prompt template</CardTitle>
        <CardDescription>
          The prompt below is sent to Popcorn each time you click Generate.
          Popcorn builds the video, then Xponential sends it as a draft to{" "}
          <span className="font-medium text-foreground">@{accountHandle}</span>
          &apos;s TikTok inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt for Popcorn</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setError(null);
                }}
                placeholder="A 30-second cinematic short of … (Popcorn turns this into a video)"
                rows={5}
                maxLength={4000}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{prompt.length}/4000</span>
                {prompt !== savedPrompt && (
                  <span className="text-amber-600">Unsaved changes</span>
                )}
              </div>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Advanced options
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="duration">Duration (s)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={15}
                    max={180}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="orientation">Orientation</Label>
                  <Select value={orientation} onValueChange={setOrientation}>
                    <SelectTrigger id="orientation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Portrait 9:16</SelectItem>
                      <SelectItem value="square">Square 1:1</SelectItem>
                      <SelectItem value="landscape">Landscape 16:9</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="style">Style hint</Label>
                  <Input
                    id="style"
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    placeholder="cinematic, warm tones, hand-held"
                    maxLength={500}
                  />
                </div>
              </div>
            </details>

            {error && (
              <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {activeRun && (
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <RunStatusIcon status={activeRun.status} />
                  <span>{prettyStatus(activeRun.status)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(activeRun.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                {activeRun.errorMessage && (
                  <div className="mt-1 text-xs text-destructive">
                    {activeRun.errorMessage}
                  </div>
                )}
                {activeRun.status === "posted" && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
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
                      Draft sent to @{accountHandle}&apos;s TikTok inbox — open
                      TikTok to review and publish.
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={saveTemplate}
                disabled={saving || prompt === savedPrompt}
                variant="outline"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save template
              </Button>
              <Button
                onClick={generate}
                disabled={running || !!inProgress || !prompt.trim()}
              >
                {running || inProgress ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate video
                  </>
                )}
              </Button>
            </div>

            {recentRuns.length > 1 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Recent runs ({recentRuns.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {recentRuns.slice(0, 5).map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 border-t py-1.5 text-xs"
                    >
                      <RunStatusIcon status={r.status} />
                      <span>{prettyStatus(r.status)}</span>
                      <span className="ml-auto text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
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
  if (s === "generating") return "Popcorn is generating the video…";
  if (s === "ready") return "Posting draft to TikTok…";
  if (s === "posting") return "Posting draft to TikTok…";
  if (s === "posted") return "Draft sent to TikTok inbox";
  if (s === "failed") return "Failed";
  if (s === "pending") return "Queued";
  return s;
}
