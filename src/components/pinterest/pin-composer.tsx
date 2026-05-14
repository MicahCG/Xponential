"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Loader2, Pin } from "lucide-react";

export function PinComposer() {
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [boardName, setBoardName] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ pinId: string; pinUrl: string | null } | null>(null);

  const titleLen = title.length;
  const descLen = description.length;
  const imageValid = /^https?:\/\/.+/i.test(imageUrl.trim());

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!imageUrl.trim() || !imageValid) {
      setError("Image URL must be a public http(s) URL.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (titleLen > 100) {
      setError(`Title is ${titleLen}/100 characters.`);
      return;
    }
    if (descLen > 500) {
      setError(`Description is ${descLen}/500 characters.`);
      return;
    }
    if (!boardName.trim()) {
      setError("Board name is required.");
      return;
    }

    setPosting(true);
    try {
      const res = await fetch("/api/pinterest/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageUrl.trim(),
          title: title.trim(),
          description: description.trim(),
          boardName: boardName.trim(),
          ...(destinationUrl.trim() && { destinationUrl: destinationUrl.trim() }),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof body.error === "string" ? body.error : "Failed to post pin."
        );
        return;
      }
      setSuccess({ pinId: body.pinId, pinUrl: body.pinUrl ?? null });
      // Reset most fields, keep board name (you'll often pin to the same board)
      setImageUrl("");
      setTitle("");
      setDescription("");
      setDestinationUrl("");
      router.refresh();
    } finally {
      setPosting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pin className="h-5 w-5" />
          New pin
        </CardTitle>
        <CardDescription>
          Pin lands on the named board on your connected account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="image-url">Image URL</Label>
          <Input
            id="image-url"
            placeholder="https://your-cdn.com/image.jpg"
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setError(null);
            }}
            type="url"
          />
          {imageValid && (
            <div className="relative aspect-square w-40 overflow-hidden rounded-md border bg-muted">
              {/* Preview — uses standard img so we don't have to register every external domain */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl.trim()}
                alt="pin preview"
                className="h-full w-full object-cover"
                onError={() => {/* silently fail preview */}}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">
            Title{" "}
            <span className={titleLen > 100 ? "text-destructive" : "text-muted-foreground"}>
              ({titleLen}/100)
            </span>
          </Label>
          <Input
            id="title"
            placeholder="Cozy autumn living room ideas"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">
            Description{" "}
            <span className={descLen > 500 ? "text-destructive" : "text-muted-foreground"}>
              ({descLen}/500)
            </span>
          </Label>
          <Textarea
            id="description"
            placeholder="A short, SEO-friendly description with relevant keywords…"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setError(null);
            }}
            rows={4}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="board-name">Board name</Label>
            <Input
              id="board-name"
              placeholder="Wedding inspo"
              value={boardName}
              onChange={(e) => {
                setBoardName(e.target.value);
                setError(null);
              }}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="destination-url">Destination URL (optional)</Label>
            <Input
              id="destination-url"
              placeholder="https://your-affiliate-link.com/…"
              value={destinationUrl}
              onChange={(e) => {
                setDestinationUrl(e.target.value);
                setError(null);
              }}
              type="url"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            Pin created.{" "}
            {success.pinUrl ? (
              <a
                href={success.pinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Open on Pinterest
              </a>
            ) : (
              <code className="text-xs">id={success.pinId}</code>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={posting}>
            {posting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Pinning…
              </>
            ) : (
              "Pin it"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
