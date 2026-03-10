"use client";

import { useState } from "react";
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
import { Loader2, Check, Cookie, ArrowRight, SkipForward } from "lucide-react";

export function CookieStep({ onComplete }: { onComplete: () => void }) {
  const [cookie, setCookie] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!cookie.trim()) {
      setError("Please paste your Twitter cookie first.");
      return;
    }

    setLoading(true);
    setError(null);

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

      setSaved(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Cookie className="h-8 w-8" />
        </div>
        <CardTitle className="text-xl">Add your Twitter cookie</CardTitle>
        <CardDescription>
          Required so the agent can post tweets in your name. Your OAuth
          connection is only used for reading — a session cookie is needed for
          posting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {saved ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950">
              <Check className="h-5 w-5 text-green-600" />
              <span className="font-medium">Cookie saved successfully!</span>
            </div>
            <Button onClick={onComplete} className="w-full">
              Finish Setup
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            {/* Instructions */}
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">
                How to get your Twitter cookie:
              </p>
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
                <li>Log in to your X (Twitter) account in Chrome</li>
                <li>Click the Cookie-Editor extension icon</li>
                <li>
                  Click &quot;Export&quot; and choose &quot;Header String&quot;
                </li>
                <li>Paste the copied string below</li>
              </ol>
            </div>

            {/* Cookie input */}
            <div className="space-y-2">
              <Label htmlFor="setup-twitter-cookie">Cookie Header String</Label>
              <Textarea
                id="setup-twitter-cookie"
                placeholder="Paste your Twitter cookie here..."
                value={cookie}
                onChange={(e) => {
                  setCookie(e.target.value);
                  setError(null);
                }}
                rows={4}
                className="font-mono text-xs"
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={loading || !cookie.trim()}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Cookie"
                )}
              </Button>
              <Button variant="outline" onClick={onComplete}>
                <SkipForward className="mr-2 h-4 w-4" />
                Skip for now
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
