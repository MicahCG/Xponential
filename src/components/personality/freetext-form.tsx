"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { PersonalityProfile } from "@/lib/personality/types";

export function FreetextForm({
  onComplete,
}: {
  onComplete: (profile: PersonalityProfile) => void;
}) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (description.length < 20) {
      setError("Please write at least 20 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/personality/freetext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to analyze description");
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
      <div className="space-y-2">
        <Label htmlFor="description">Describe your online personality</Label>
        <Textarea
          id="description"
          placeholder="Example: Confident but not arrogant. Heavy on tech metaphors. Occasional pop culture references. Never use corporate jargon. Emoji-light. I tend to be sarcastic and love a good hot take about AI hype."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
        />
        <p className="text-xs text-muted-foreground">
          Be as specific as possible. Include what you DO and DON&apos;T want.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={description.length < 20 || loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          "Analyze & Create Profile"
        )}
      </Button>
    </div>
  );
}
