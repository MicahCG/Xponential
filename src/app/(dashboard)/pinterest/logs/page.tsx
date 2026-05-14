import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, Check, X } from "lucide-react";

export const metadata = { title: "Pinterest API logs - Xponential" };

export default async function PinterestLogsPage() {
  const session = await requireAuth();
  const brand = await getCurrentBrand(session.user!.id as string);

  const logs = await prisma.pinterestApiLog.findMany({
    where: { brandId: brand.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/pinterest"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Pinterest
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Pinterest API logs</h1>
          <p className="text-muted-foreground">
            Every call to the official Pinterest API v5 is logged here for{" "}
            <span className="font-medium text-foreground">{brand.name}</span>.
            Audit trail for review and debugging.
          </p>
        </div>
        <Link href="/pinterest/compose">
          <Button variant="outline">Compose pin</Button>
        </Link>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No API calls yet. Connect Pinterest and publish a pin to see entries here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <Card key={log.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full ${
                      log.success
                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {log.success ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </span>
                  <span className="font-mono text-xs font-semibold uppercase">
                    {log.method}
                  </span>
                  <code className="text-xs">{log.endpoint}</code>
                  {log.responseStatus != null && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        log.success
                          ? "bg-green-500/10 text-green-700 dark:text-green-400"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      HTTP {log.responseStatus}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>

                {log.errorMessage && (
                  <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                    {log.errorMessage}
                  </div>
                )}

                {log.requestBody !== null && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Request body
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 font-mono text-[11px]">
                      {JSON.stringify(log.requestBody, null, 2)}
                    </pre>
                  </details>
                )}
                {log.responseBody !== null && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Response body
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 font-mono text-[11px]">
                      {JSON.stringify(log.responseBody, null, 2)}
                    </pre>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
