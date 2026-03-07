"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Check, Trash2, Video } from "lucide-react";

export function PopcornForm() {
  const [popcornUserId, setPopcornUserId] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/settings/popcorn");
        if (res.ok) {
          const data = await res.json();
          setCurrentId(data.popcornUserId);
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
    if (!popcornUserId.trim()) {
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
        body: JSON.stringify({ popcornUserId: popcornUserId.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }

      setSuccess("Popcorn User ID saved!");
      setCurrentId(popcornUserId.trim());
      setPopcornUserId("");
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
          Required for video replies. Enter your Popcorn account User ID so
          videos are generated under your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current status */}
        {!fetching && (
          <div
            className={`rounded-md p-3 text-sm ${
              currentId
                ? "bg-green-500/10 text-green-700 dark:text-green-400"
                : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
            }`}
          >
            {currentId ? (
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                Configured: <code className="text-xs">{currentId}</code>
              </span>
            ) : (
              "No Popcorn User ID configured. Video replies will not work until you add one."
            )}
          </div>
        )}

        {/* Input */}
        <div className="space-y-2">
          <Label htmlFor="popcorn-user-id">Popcorn User ID</Label>
          <Input
            id="popcorn-user-id"
            placeholder="e.g. ObTTKRawcHbFFi6Z1fLVL1EViNg2"
            value={popcornUserId}
            onChange={(e) => {
              setPopcornUserId(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            className="font-mono text-sm"
          />
        </div>

        {/* Error / Success */}
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            {success}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={loading || !popcornUserId.trim()}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>

          {currentId && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={deleting}
              className="text-destructive"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
