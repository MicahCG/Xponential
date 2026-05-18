"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Inbox,
  ShieldCheck,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
} from "lucide-react";

export function TikTokDraftComposer() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("");

  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    ok: boolean;
    endpoint: string;
    statusCode: number | null;
    message: string;
    publishId?: string;
    ranAt: string;
  } | null>(null);

  const captionLen = caption.length;
  const urlValid = /^https:\/\/.+\.(mp4|mov)(\?.*)?$/i.test(videoUrl.trim());

  async function submit() {
    setError(null);
    setResult(null);
    if (!videoUrl.trim()) {
      setError("Video URL is required.");
      return;
    }
    if (!/^https:\/\//i.test(videoUrl.trim())) {
      setError("Video URL must use HTTPS.");
      return;
    }
    if (captionLen > 2200) {
      setError(`Caption is ${captionLen}/2200 characters.`);
      return;
    }

    setPosting(true);
    const ranAt = new Date().toISOString();
    try {
      const res = await fetch("/api/tiktok/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: videoUrl.trim(),
          caption: caption.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setResult({
          ok: false,
          endpoint: body.endpoint ?? "POST /v2/post/publish/inbox/video/init/",
          statusCode: body.statusCode ?? res.status,
          message:
            typeof body.error === "string"
              ? body.error
              : "Failed to send TikTok draft.",
          ranAt,
        });
        return;
      }

      setResult({
        ok: true,
        endpoint: body.endpoint ?? "POST /v2/post/publish/inbox/video/init/",
        statusCode: body.statusCode ?? 200,
        message:
          body.message ?? "Draft sent to your TikTok inbox.",
        publishId: body.publishId,
        ranAt,
      });
      setVideoUrl("");
      setCaption("");
      router.refresh();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-green-500/40 bg-green-500/[0.03]">
        <CardContent className="flex items-center gap-2 py-4 text-sm">
          <ShieldCheck className="h-4 w-4 text-green-600" />
          <span>
            Sending via the{" "}
            <span className="font-medium">Official TikTok Content Posting API</span>
          </span>
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/[0.03]">
        <CardContent className="flex gap-2 py-3 text-xs text-muted-foreground">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            This app is currently in{" "}
            <span className="font-medium text-foreground">Sandbox / Trial</span>{" "}
            mode. Drafts can only be sent to TikTok accounts added as Target
            Users on the developer app.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            New TikTok draft
          </CardTitle>
          <CardDescription>
            One video at a time. We send a draft to your TikTok inbox; you
            review and publish from the TikTok app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="video-url">Video URL (https, mp4 or mov)</Label>
            <Input
              id="video-url"
              placeholder="https://your-cdn.com/video.mp4"
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                setError(null);
              }}
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              The hosting domain must be verified in your TikTok developer
              portal&apos;s URL Properties. We&apos;ve verified{" "}
              <code>xponential-two.vercel.app</code>.
            </p>
            {urlValid && (
              <video
                src={videoUrl.trim()}
                controls
                className="mt-2 w-full max-w-xs rounded-md border bg-muted"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="caption">
              Caption (optional, your reference)
              <span
                className={
                  captionLen > 2200
                    ? " ml-2 text-destructive"
                    : " ml-2 text-muted-foreground"
                }
              >
                ({captionLen}/2200)
              </span>
            </Label>
            <Textarea
              id="caption"
              placeholder="Saved with the draft on Xponential's side. Final caption is edited in the TikTok app before publishing."
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                setError(null);
              }}
              rows={4}
            />
          </div>

          <div className="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Safety guarantees</p>
            <ul className="space-y-0.5">
              <li>• One video per submission. No bulk uploads.</li>
              <li>• No scheduled or automatic sending from this page.</li>
              <li>
                • Draft is sent to your TikTok inbox. Final publish always
                happens in the TikTok app.
              </li>
              <li>
                • A human must click <span className="font-medium">Send draft to TikTok</span> for anything to be sent.
              </li>
              <li>• Every API call is logged in /tiktok/logs for audit.</li>
            </ul>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {result && (
            <div
              className={
                "rounded-md border p-3 text-sm " +
                (result.ok
                  ? "border-green-500/30 bg-green-500/[0.05]"
                  : "border-destructive/30 bg-destructive/[0.05]")
              }
            >
              <div
                className={
                  "mb-2 flex items-center gap-2 font-medium " +
                  (result.ok
                    ? "text-green-700 dark:text-green-400"
                    : "text-destructive")
                }
              >
                {result.ok ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {result.message}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <dt>Endpoint</dt>
                <dd>
                  <code>{result.endpoint}</code>
                </dd>
                <dt>Status</dt>
                <dd>{result.statusCode ?? "—"}</dd>
                <dt>Run at</dt>
                <dd>{new Date(result.ranAt).toLocaleString()}</dd>
                {result.publishId && (
                  <>
                    <dt>Publish ID</dt>
                    <dd className="font-mono">{result.publishId}</dd>
                  </>
                )}
              </dl>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <Link
                  href="/tiktok/logs"
                  className="inline-flex items-center gap-1 underline"
                >
                  <FileText className="h-3 w-3" />
                  View API logs
                </Link>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={submit} disabled={posting}>
              {posting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send draft to TikTok
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
