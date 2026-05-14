"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, FolderSearch, XCircle } from "lucide-react";

interface BoardSample {
  id: string;
  name: string;
  privacy: string;
  pinCount: number | null;
}

interface TestResult {
  ok: true;
  totalBoards: number;
  sample: BoardSample[];
}

export function PinterestBoardTest() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runTest() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/pinterest/boards/test", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(
          typeof body.error === "string"
            ? body.error
            : "Board fetch failed."
        );
        return;
      }
      setResult(body as TestResult);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderSearch className="h-5 w-5" />
          Board Access Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Hit <code className="text-xs">GET /v5/boards</code> on your connected
          account. Confirms the OAuth token is valid and{" "}
          <code className="text-xs">boards:read</code> is granted. Result is
          recorded in the API logs below.
        </p>
        <Button onClick={runTest} disabled={loading} variant="outline">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calling Pinterest…
            </>
          ) : (
            "Run Board Access Test"
          )}
        </Button>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {result && (
          <div className="rounded-md border border-green-500/30 bg-green-500/[0.05] p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              {result.totalBoards} board{result.totalBoards === 1 ? "" : "s"}{" "}
              accessible
            </div>
            {result.sample.length > 0 && (
              <ul className="space-y-1 text-xs">
                {result.sample.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between border-t border-green-500/15 py-1 first:border-t-0 first:pt-0"
                  >
                    <span>{b.name}</span>
                    <span className="text-muted-foreground">
                      {b.pinCount != null ? `${b.pinCount} pins` : ""}{" "}
                      {b.privacy === "SECRET" && "· secret"}
                    </span>
                  </li>
                ))}
                {result.totalBoards > result.sample.length && (
                  <li className="pt-1 text-xs text-muted-foreground">
                    …and {result.totalBoards - result.sample.length} more
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
