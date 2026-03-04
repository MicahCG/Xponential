"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, ScanSearch } from "lucide-react";

const PROGRESS_MESSAGES = [
  "Fetching your tweets and replies...",
  "Analyzing your writing style...",
  "Identifying engagement patterns...",
  "Generating account recommendations...",
  "Almost done...",
];

export function IngestButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleIngest = async () => {
    setLoading(true);
    setError(null);
    setProgressIdx(0);

    // Cycle through progress messages
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
        setError(data.error ?? "Failed to ingest profile");
        return;
      }

      // Navigate to account selection page
      router.push("/personality/accounts");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Button
        onClick={handleIngest}
        disabled={loading}
        variant="outline"
        size="sm"
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {PROGRESS_MESSAGES[progressIdx]}
          </>
        ) : (
          <>
            <ScanSearch className="mr-2 h-4 w-4" />
            Ingest My Profile
          </>
        )}
      </Button>
    </div>
  );
}
