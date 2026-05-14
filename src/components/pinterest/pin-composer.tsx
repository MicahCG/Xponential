"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Pin, ShieldCheck, Send } from "lucide-react";

interface Board {
  id: string;
  name: string;
  privacy: string;
  pinCount: number | null;
}

export function PinComposer() {
  const router = useRouter();

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [boardId, setBoardId] = useState<string>("");

  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [altText, setAltText] = useState("");

  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    pinId: string;
    pinUrl: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pinterest/boards")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.boards)) {
          setBoards(data.boards);
          if (data.boards.length > 0) {
            setBoardId(data.boards[0].id);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setBoardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!boardId) {
      setError("Pick a board from your Pinterest account.");
      return;
    }

    setPosting(true);
    try {
      const res = await fetch("/api/pinterest/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "api",
          imageUrl: imageUrl.trim(),
          title: title.trim(),
          description: description.trim(),
          boardId,
          ...(destinationUrl.trim() && {
            destinationUrl: destinationUrl.trim(),
          }),
          ...(altText.trim() && { altText: altText.trim() }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof body.error === "string" ? body.error : "Failed to publish pin."
        );
        return;
      }
      setSuccess({
        pinId: body.pinId,
        pinUrl: body.pinUrl ?? null,
      });
      setImageUrl("");
      setTitle("");
      setDescription("");
      setDestinationUrl("");
      setAltText("");
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
            Publishing via the{" "}
            <span className="font-medium">Official Pinterest API</span>
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pin className="h-5 w-5" />
            New pin
          </CardTitle>
          <CardDescription>
            Each pin requires explicit human approval — one pin at a time, no
            bulk posting, no scheduled auto-publishing.
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl.trim()}
                  alt="pin preview"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">
              Title{" "}
              <span
                className={
                  titleLen > 100 ? "text-destructive" : "text-muted-foreground"
                }
              >
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
              <span
                className={
                  descLen > 500 ? "text-destructive" : "text-muted-foreground"
                }
              >
                ({descLen}/500)
              </span>
            </Label>
            <Textarea
              id="description"
              placeholder="SEO-friendly description with relevant keywords…"
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
              <Label htmlFor="board">Board</Label>
              <Select value={boardId} onValueChange={setBoardId}>
                <SelectTrigger id="board">
                  <SelectValue
                    placeholder={boardsLoading ? "Loading…" : "Select a board"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {boards.length === 0 && !boardsLoading && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No boards found
                    </div>
                  )}
                  {boards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {b.privacy === "SECRET" && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (secret)
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <div className="space-y-2">
            <Label htmlFor="alt-text">Alt text (accessibility, optional)</Label>
            <Input
              id="alt-text"
              placeholder="What the image shows, for screen readers"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Safety guarantees</p>
            <ul className="space-y-0.5">
              <li>• One pin per submission. No bulk publishing.</li>
              <li>• No scheduled auto-posting from this page.</li>
              <li>
                • A human must click{" "}
                <span className="font-medium">Publish pin</span> for anything
                to be sent.
              </li>
              <li>• Every API call is logged in /pinterest/logs for audit.</li>
            </ul>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
              Pin published.{" "}
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
                  Publishing…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Publish pin
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
