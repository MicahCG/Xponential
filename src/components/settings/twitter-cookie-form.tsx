"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Check, Trash2, Cookie } from "lucide-react";

interface TwitterCookieFormProps {
  /** When set, redirect to this URL after a successful save instead of showing a success message */
  onSaveRedirect?: string;
}

export function TwitterCookieForm({ onSaveRedirect }: TwitterCookieFormProps) {
  const router = useRouter();
  const [cookie, setCookie] = useState("");
  const [hasCookie, setHasCookie] = useState(false);
  const [cookiePreview, setCookiePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch current state on mount
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/settings/twitter-cookie");
        if (res.ok) {
          const data = await res.json();
          setHasCookie(data.hasCookie);
          setCookiePreview(data.cookiePreview);
        }
      } catch {
        // ignore — will just show as not configured
      } finally {
        setFetching(false);
      }
    }
    fetchStatus();
  }, []);

  const handleSave = async () => {
    if (!cookie.trim()) {
      setError("Please paste your Twitter cookie first.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/settings/twitter-cookie", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: cookie.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to save cookie");
        return;
      }

      if (onSaveRedirect) {
        router.push(onSaveRedirect);
        return;
      }

      setSuccess("Twitter cookie saved successfully!");
      setHasCookie(true);
      setCookiePreview(cookie.trim().substring(0, 40) + "...");
      setCookie("");
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
      const res = await fetch("/api/settings/twitter-cookie", {
        method: "DELETE",
      });

      if (res.ok) {
        setHasCookie(false);
        setCookiePreview(null);
        setSuccess("Twitter cookie removed.");
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to remove cookie");
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
          <Cookie className="h-5 w-5" />
          Twitter Cookie
        </CardTitle>
        <CardDescription>
          Required for posting tweets via Apify. Your X OAuth token is still used
          for reading timelines and profiles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current status */}
        {!fetching && (
          <div
            className={`rounded-md p-3 text-sm ${
              hasCookie
                ? "bg-green-500/10 text-green-700 dark:text-green-400"
                : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
            }`}
          >
            {hasCookie ? (
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                Cookie configured: <code className="text-xs">{cookiePreview}</code>
              </span>
            ) : (
              "No Twitter cookie configured. Posting tweets will not work until you add one."
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">How to get your Twitter cookie:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              Install the{" "}
              <a
                href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Cookie-Editor
              </a>{" "}
              Chrome extension
            </li>
            <li>Log in to your X (Twitter) account</li>
            <li>Click the Cookie-Editor extension icon</li>
            <li>Click &quot;Export&quot; and choose &quot;Header String&quot;</li>
            <li>Paste the copied string below</li>
          </ol>
        </div>

        {/* Cookie input */}
        <div className="space-y-2">
          <Label htmlFor="twitter-cookie">Cookie Header String</Label>
          <Textarea
            id="twitter-cookie"
            placeholder="Paste your Twitter cookie here..."
            value={cookie}
            onChange={(e) => {
              setCookie(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            rows={4}
            className="font-mono text-xs"
          />
        </div>

        {/* Error / Success messages */}
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
          <Button onClick={handleSave} disabled={loading || !cookie.trim()}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Cookie"
            )}
          </Button>

          {hasCookie && (
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
