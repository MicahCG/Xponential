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
  endpoint: string;
  statusCode: number;
  ranAt: string;
  totalBoards: number;
  sample: BoardSample[];
}

interface TestError {
  ok: false;
  endpoint: string;
  statusCode: number | null;
  ranAt: string;
  message: string;
}

export function PinterestBoardTest() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<TestError | null>(null);

  async function runTest() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/pinterest/boards/test", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError({
          ok: false,
          endpoint: body.endpoint ?? "GET /v5/boards",
          statusCode: body.statusCode ?? res.status,
          ranAt: body.ranAt ?? new Date().toISOString(),
          message: typeof body.error === "string" ? body.error : "Board fetch failed.",
        });
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
          <div className="rounded-md border border-destructive/30 bg-destructive/[0.05] p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium text-destructive">
              <XCircle className="h-4 w-4" />
              Failed — {error.message}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <dt>Endpoint</dt>
              <dd>
                <code>{error.endpoint}</code>
              </dd>
              <dt>Status</dt>
              <dd>{error.statusCode ?? "—"}</dd>
              <dt>Run at</dt>
              <dd>{new Date(error.ranAt).toLocaleString()}</dd>
            </dl>
          </div>
        )}

        {result && (
          <div className="rounded-md border border-green-500/30 bg-green-500/[0.05] p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Success — {result.totalBoards} board
              {result.totalBoards === 1 ? "" : "s"} accessible
            </div>
            <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <dt>Endpoint</dt>
              <dd>
                <code>{result.endpoint}</code>
              </dd>
              <dt>Status</dt>
              <dd>{result.statusCode}</dd>
              <dt>Run at</dt>
              <dd>{new Date(result.ranAt).toLocaleString()}</dd>
            </dl>
            {result.sample.length > 0 && (
              <div className="space-y-1 border-t border-green-500/15 pt-2">
                <p className="text-xs font-medium text-foreground">
                  First {result.sample.length} boards
                </p>
                <ul className="space-y-1 text-xs">
                  {result.sample.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between"
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
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
