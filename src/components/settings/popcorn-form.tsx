"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Check, Trash2, Video } from "lucide-react";

const QUALITY_OPTIONS = [
  { value: "budget",       label: "Budget (fastest)" },
  { value: "low",          label: "Low" },
  { value: "medium",       label: "Medium" },
  { value: "high",         label: "High" },
  { value: "premium",      label: "Premium" },
  { value: "professional", label: "Professional (slowest)" },
];

const DURATION_OPTIONS = [
  { value: "15", label: "15 seconds" },
  { value: "30", label: "30 seconds" },
  { value: "45", label: "45 seconds" },
  { value: "60", label: "60 seconds" },
];

const STYLE_PRESETS = [
  "muppet", "cinematic", "anime", "cartoon", "realistic", "watercolor",
  "3d render", "claymation", "pixel art", "vintage film",
];

export function PopcornForm() {
  const [popcornUserId, setPopcornUserId]         = useState("");
  const [currentId, setCurrentId]                 = useState<string | null>(null);
  const [videoStyle, setVideoStyle]               = useState("muppet");
  const [videoQuality, setVideoQuality]           = useState("budget");
  const [videoDuration, setVideoDuration]         = useState("15");
  const [videoOrientation, setVideoOrientation]   = useState("vertical");
  const [promptTemplate, setPromptTemplate]       = useState("Create a video based off this tweet {tweet_url}");
  const [loading, setLoading]     = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [fetching, setFetching]   = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/settings/popcorn");
        if (res.ok) {
          const data = await res.json();
          setCurrentId(data.popcornUserId);
          if (data.videoStyle)          setVideoStyle(data.videoStyle);
          if (data.videoQuality)        setVideoQuality(data.videoQuality);
          if (data.videoDuration)       setVideoDuration(data.videoDuration);
          if (data.videoOrientation)    setVideoOrientation(data.videoOrientation);
          if (data.videoPromptTemplate) setPromptTemplate(data.videoPromptTemplate);
        }
      } catch {
        // ignore
      } finally {
        setFetching(false);
      }
    }
    fetchStatus();
  }, []);

  const handleSave = async () => {
    if (!popcornUserId.trim() && !currentId) {
      setError("Please enter your Popcorn User ID.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/settings/popcorn", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          popcornUserId:       (popcornUserId.trim() || currentId)!,
          videoStyle,
          videoQuality,
          videoDuration,
          videoOrientation,
          videoPromptTemplate: promptTemplate,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save"); return; }

      setSuccess("Settings saved!");
      if (popcornUserId.trim()) {
        setCurrentId(popcornUserId.trim());
        setPopcornUserId("");
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/settings/popcorn", { method: "DELETE" });
      if (res.ok) {
        setCurrentId(null);
        setSuccess("Popcorn User ID removed.");
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to remove");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Popcorn Video
        </CardTitle>
        <CardDescription>
          Configure video generation settings for auto-replies and video posts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Connection status */}
        {!fetching && (
          <div className={`rounded-md p-3 text-sm ${currentId ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"}`}>
            {currentId ? (
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                Connected: <code className="text-xs">{currentId}</code>
              </span>
            ) : (
              "No Popcorn User ID configured. Video generation will not work until you add one."
            )}
          </div>
        )}

        {/* Popcorn User ID */}
        <div className="space-y-2">
          <Label htmlFor="popcorn-user-id">Popcorn User ID</Label>
          <Input
            id="popcorn-user-id"
            placeholder="e.g. ObTTKRawcHbFFi6Z1fLVL1EViNg2"
            value={popcornUserId}
            onChange={(e) => { setPopcornUserId(e.target.value); setError(null); }}
            className="font-mono text-sm"
          />
        </div>

        <div className="border-t pt-4 space-y-4">
          <p className="text-sm font-medium">Video generation defaults</p>
          <p className="text-xs text-muted-foreground -mt-2">Applied to all auto-reply and video post generation.</p>

          {/* Style */}
          <div className="space-y-2">
            <Label htmlFor="video-style">Style</Label>
            <div className="flex gap-2">
              <Input
                id="video-style"
                placeholder="e.g. muppet, cinematic, anime..."
                value={videoStyle}
                onChange={(e) => setVideoStyle(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setVideoStyle(s)}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${videoStyle === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Quality + Duration row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Quality</Label>
              <Select value={videoQuality} onValueChange={setVideoQuality}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={videoDuration} onValueChange={setVideoDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Orientation */}
          <div className="space-y-2">
            <Label>Orientation</Label>
            <div className="flex gap-2">
              {["vertical", "horizontal"].map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setVideoOrientation(o)}
                  className={`flex-1 py-1.5 rounded text-sm border transition-colors capitalize ${videoOrientation === o ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt template */}
          <div className="space-y-2">
            <Label htmlFor="prompt-template">Auto-reply prompt template</Label>
            <Textarea
              id="prompt-template"
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{"{tweet_url}"}</code> as a placeholder — it will be replaced with the tweet being replied to.
            </p>
          </div>
        </div>

        {/* Error / Success */}
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {success && <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">{success}</div>}

        {/* Buttons */}
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={loading || fetching}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save settings"}
          </Button>
          {currentId && (
            <Button variant="outline" onClick={handleDelete} disabled={deleting} className="text-destructive">
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
