"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export interface TikTokConnectionOption {
  id: string;
  accountHandle: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tiktokConnections: TikTokConnectionOption[];
  onCreated: () => void;
}

export function CreateChannelDialog({
  open,
  onOpenChange,
  tiktokConnections,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [connectionId, setConnectionId] = useState(
    tiktokConnections[0]?.id ?? ""
  );
  const [duration, setDuration] = useState<string>("");
  const [orientation, setOrientation] = useState<string>("portrait");
  const [style, setStyle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Channel name is required.");
      return;
    }
    if (!promptTemplate.trim()) {
      setError("Prompt template is required.");
      return;
    }
    if (!connectionId) {
      setError("Pick a TikTok account.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        promptTemplate: promptTemplate.trim(),
        connectionId,
      };
      if (duration.trim()) payload.durationSec = Number(duration);
      if (orientation) payload.orientation = orientation;
      if (style.trim()) payload.style = style.trim();

      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          typeof body.error === "string"
            ? body.error
            : "Failed to create channel."
        );
        return;
      }
      setName("");
      setPromptTemplate("");
      setDuration("");
      setStyle("");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a channel</DialogTitle>
          <DialogDescription>
            A channel is a reusable video-generation config. Running it sends
            a Popcorn-generated video to your connected TikTok account&apos;s
            inbox for review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="channel-name">Channel name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Eco Wedding Shorts"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="channel-prompt">Prompt template</Label>
            <Textarea
              id="channel-prompt"
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              placeholder="A 30-second cinematic short of a candlelit eco wedding table with linen napkins, soft-focus dried florals, golden hour light, gentle hand-held camera, ambient acoustic guitar."
              rows={5}
              maxLength={100000}
            />
            <p className="text-xs text-muted-foreground">
              Passed verbatim to Popcorn&apos;s create_movie as the brief.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="channel-target">TikTok account</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger id="channel-target">
                <SelectValue placeholder="Pick a TikTok account" />
              </SelectTrigger>
              <SelectContent>
                {tiktokConnections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    @{c.accountHandle ?? "unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="channel-duration">Duration (s, optional)</Label>
              <Input
                id="channel-duration"
                type="number"
                min={15}
                max={180}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="channel-orientation">Orientation</Label>
              <Select value={orientation} onValueChange={setOrientation}>
                <SelectTrigger id="channel-orientation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait (9:16)</SelectItem>
                  <SelectItem value="square">Square (1:1)</SelectItem>
                  <SelectItem value="landscape">Landscape (16:9)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="channel-style">Style hint (optional)</Label>
            <Input
              id="channel-style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="cinematic, warm tones, hand-held"
              maxLength={500}
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create channel"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
