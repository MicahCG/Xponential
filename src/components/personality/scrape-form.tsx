"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { PersonalityProfile } from "@/lib/personality/types";

export function ScrapeForm({
  onComplete,
}: {
  onComplete: (profile: PersonalityProfile) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScrape = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/personality/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetCount: 100 }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to analyze tweets");
        return;
      }

      onComplete(data.profile);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        We&apos;ll fetch your recent tweets from your connected X account and
        analyze your writing style. Make sure your X account is connected first.
      </p>
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Button onClick={handleScrape} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Analyzing your tweets...
          </>
        ) : (
          "Analyze My Tweets"
        )}
      </Button>
    </div>
  );
}
