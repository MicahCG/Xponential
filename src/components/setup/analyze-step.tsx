"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Brain, RefreshCw } from "lucide-react";

const PROGRESS_MESSAGES = [
  "Fetching your tweets and replies...",
  "Analyzing your writing style...",
  "Building your personality profile...",
  "Identifying engagement patterns...",
  "Generating account recommendations...",
  "Almost done...",
];

export function AnalyzeStep({ onComplete }: { onComplete: () => void }) {
  const [progressIdx, setProgressIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const hasStarted = useRef(false);

  const runIngest = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    setProgressIdx(0);

    const interval = setInterval(() => {
      setProgressIdx((prev) =>
        prev < PROGRESS_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 8000);

    try {
      const res = await fetch("/api/personality/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to analyze profile");
        setAnalyzing(false);
        return;
      }

      onComplete();
    } catch {
      setError("Something went wrong. Please try again.");
      setAnalyzing(false);
    } finally {
      clearInterval(interval);
    }
  }, [onComplete]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runIngest();
  }, [runIngest]);

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Brain className="h-8 w-8" />
        </div>
        <CardTitle className="text-xl">Analyzing your profile</CardTitle>
        <CardDescription>
          We&apos;re studying your tweets, replies, and engagement to understand
          your unique voice.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {error ? (
          <>
            <div className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
              {error}
            </div>
            <Button
              onClick={() => {
                hasStarted.current = false;
                runIngest();
              }}
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </>
        ) : analyzing ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {PROGRESS_MESSAGES[progressIdx]}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
