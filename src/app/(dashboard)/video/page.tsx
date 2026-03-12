"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Loader2,
  Video,
  Sparkles,
  Send,
  CheckCircle2,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

type Stage =
  | "idle"
  | "creating"
  | "polling"
  | "ready"
  | "posting"
  | "posted";

const INITIAL_DELAY_MS = 3 * 60 * 1000;  // wait 3 min before first check
const POLL_INTERVAL_MS = 30 * 1000;       // then every 30s
const MAX_POLL_MINUTES = 60;

// ─── Stage metadata ──────────────────────────────────────────

const stageInfo: Record<
  Stage,
  { label: string; description: string; color: string }
> = {
  idle: {
    label: "Ready",
    description: "Describe your video and we'll generate it via Popcorn.",
    color: "bg-muted text-muted-foreground",
  },
  creating: {
    label: "Submitting to Popcorn",
    description: "Sending your prompt to the MCP API...",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  polling: {
    label: "Generating Video",
    description: "Popcorn is creating your video. First check in 3 min, then every 30s.",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  },
  ready: {
    label: "Video Ready",
    description: "Preview your video, write a caption, then post it.",
    color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  posting: {
    label: "Posting Tweet",
    description: "Sending to X via Apify...",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
  posted: {
    label: "Posted!",
    description: "Your video tweet was published successfully.",
    color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
};

// ─── Page ────────────────────────────────────────────────────

export default function VideoPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [prompt, setPrompt] = useState("");
  const [movieRootId, setMovieRootId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [tweetId, setTweetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startPolling = (rootId: string) => {
    setElapsedSeconds(0);

    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);

    const doPoll = async () => {
      try {
        const res = await fetch(`/api/video/status?movieRootId=${rootId}`);
        const data = await res.json();

        if (!res.ok) {
          stopPolling();
          setError(data.error ?? "Failed to check video status");
          setStage("idle");
          return;
        }

        if (data.status === "ready" && data.videoUrl) {
          stopPolling();
          setVideoUrl(data.videoUrl);
          setStage("ready");
          return;
        }

        // Check timeout
        setElapsedSeconds((s) => {
          if (s >= MAX_POLL_MINUTES * 60) {
            stopPolling();
            setError("Video generation timed out after 60 minutes. Try again.");
            setStage("idle");
          }
          return s;
        });
      } catch {
        stopPolling();
        setError("Network error while checking video status.");
        setStage("idle");
      }
    };

    // Wait 3 minutes before first check, then every 30s after
    const initialTimer = setTimeout(() => {
      doPoll();
      pollRef.current = setInterval(doPoll, POLL_INTERVAL_MS);
    }, INITIAL_DELAY_MS);

    // Store so we can clear it on cancel
    pollRef.current = initialTimer as unknown as ReturnType<typeof setInterval>;
  };

  const handleCreate = async () => {
    if (!prompt.trim()) return;
    setError(null);
    setStage("creating");

    try {
      const res = await fetch("/api/video/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create video");
        setStage("idle");
        return;
      }

      setMovieRootId(data.movieRootId);
      setStage("polling");
      startPolling(data.movieRootId);
    } catch {
      setError("Network error. Please try again.");
      setStage("idle");
    }
  };

  const handlePost = async () => {
    if (!caption.trim() || !videoUrl) return;
    setError(null);
    setStage("posting");

    try {
      const res = await fetch("/api/video/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: caption.trim(), videoUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to post tweet");
        setStage("ready");
        return;
      }

      setTweetId(data.tweetId);
      setStage("posted");
    } catch {
      setError("Network error. Please try again.");
      setStage("ready");
    }
  };

  const handleReset = () => {
    stopPolling();
    setStage("idle");
    setPrompt("");
    setMovieRootId(null);
    setVideoUrl(null);
    setCaption("");
    setTweetId(null);
    setError(null);
    setElapsedSeconds(0);
  };

  const info = stageInfo[stage];
  const isGenerating = stage === "creating" || stage === "polling";
  const elapsedDisplay = elapsedSeconds > 0
    ? elapsedSeconds >= 60
      ? `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`
      : `${elapsedSeconds}s`
    : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Video Studio</h1>
        <p className="text-muted-foreground">
          Generate a Popcorn video, preview it, and post it as a tweet.
        </p>
      </div>

      {/* Status bar */}
      <div className={cn("rounded-lg px-4 py-3 flex items-center gap-3 text-sm font-medium", info.color)}>
        {stage === "creating" || stage === "polling" || stage === "posting" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : stage === "posted" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : stage === "ready" ? (
          <Video className="h-4 w-4 shrink-0" />
        ) : (
          <Sparkles className="h-4 w-4 shrink-0" />
        )}
        <div>
          <span className="font-semibold">{info.label}</span>
          <span className="font-normal opacity-80"> — {info.description}</span>
          {stage === "polling" && elapsedDisplay && (
            <span className="ml-2 opacity-60">{elapsedDisplay} elapsed</span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Prompt */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
              stage === "idle" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>1</div>
            <CardTitle className="text-base">Video Prompt</CardTitle>
          </div>
          <CardDescription>Describe what you want the video to be about.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A cinematic shot of a trader watching crypto charts spike to the moon, dramatic music, vertical format..."
            rows={4}
            disabled={stage !== "idle"}
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{prompt.length} chars</span>
            <Button
              onClick={handleCreate}
              disabled={!prompt.trim() || stage !== "idle"}
            >
              {stage === "idle" ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Video
                </>
              ) : (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Processing indicator */}
      {(isGenerating || stage === "ready" || stage === "posting" || stage === "posted") && (
        <Card className={cn(isGenerating && "border-purple-200 dark:border-purple-800")}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                stage === "polling" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>2</div>
              <CardTitle className="text-base">Video Generation</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {isGenerating ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-500 shrink-0" />
                  <span>
                    {stage === "creating"
                      ? "Submitting prompt to Popcorn MCP API..."
                      : elapsedSeconds < INITIAL_DELAY_MS / 1000
                        ? `First check in ${Math.ceil((INITIAL_DELAY_MS / 1000 - elapsedSeconds) / 60)}m ${(INITIAL_DELAY_MS / 1000 - elapsedSeconds) % 60}s...`
                        : "Checking every 30 seconds..."}
                  </span>
                </div>
                {movieRootId && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Job ID: {movieRootId}
                  </p>
                )}
                {/* Progress bar animation */}
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Video generated successfully
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Video preview + caption */}
      {(stage === "ready" || stage === "posting" || stage === "posted") && videoUrl && (
        <Card className={cn(stage === "ready" && "border-green-200 dark:border-green-800")}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                stage === "ready" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>3</div>
              <CardTitle className="text-base">Preview & Caption</CardTitle>
            </div>
            <CardDescription>Watch the video, write your tweet caption, then post.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Video player */}
            <div className="rounded-lg overflow-hidden border bg-black flex items-center justify-center">
              <video
                src={videoUrl}
                controls
                className="max-h-[480px] w-full object-contain"
                preload="metadata"
              />
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write your tweet caption..."
                rows={3}
                maxLength={280}
                disabled={stage !== "ready"}
                className="resize-none"
              />
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-xs",
                  caption.length > 260 ? "text-destructive" : "text-muted-foreground"
                )}>
                  {caption.length}/280
                </span>
                <Button
                  onClick={handlePost}
                  disabled={!caption.trim() || stage !== "ready"}
                >
                  {stage === "posting" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Post Tweet
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Posted confirmation */}
      {stage === "posted" && tweetId && (
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Tweet posted successfully!</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">ID: {tweetId}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`https://x.com/i/web/status/${tweetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    View on X
                  </a>
                </Button>
                <Button size="sm" variant="ghost" onClick={handleReset}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  New Video
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reset while generating */}
      {isGenerating && (
        <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          Cancel & start over
        </Button>
      )}
    </div>
  );
}
