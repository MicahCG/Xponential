import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  getCurrentConnection,
  listConnectionsForPlatform,
} from "@/lib/connection-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TikTokMethodStatus } from "@/components/connections/tiktok-method-status";
import { PlatformAccountPicker } from "@/components/connections/platform-account-picker";
import { TikTokTemplateCard } from "@/components/tiktok/tiktok-template-card";
import {
  Music2,
  Send,
  LogIn,
  ShieldCheck,
  FileText,
  Settings2,
} from "lucide-react";

export const metadata = { title: "TikTok - Xponential" };

export default async function TikTokPage() {
  const session = await requireAuth();
  const userId = session.user!.id as string;

  const [accounts, current] = await Promise.all([
    listConnectionsForPlatform(userId, "tiktok"),
    getCurrentConnection(userId, "tiktok"),
  ]);

  const apiConnected = !!current && current.hasAccessToken && current.status === "active";

  const drafts = apiConnected && current
    ? await prisma.postHistory.findMany({
        where: {
          userId,
          platform: "tiktok",
          postingMethod: "tiktok_api",
        },
        orderBy: { postedAt: "desc" },
        take: 30,
        select: {
          id: true,
          content: true,
          videoUrl: true,
          platformPostId: true,
          postedAt: true,
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Music2 className="h-6 w-6" />
            TikTok
          </h1>
          {accounts.length > 0 && (
            <div className="mt-2">
              <PlatformAccountPicker
                platform="tiktok"
                accounts={accounts}
                currentId={current?.id ?? null}
                connectHref="/api/connect/start/tiktok"
                label="TikTok account"
              />
            </div>
          )}
          {accounts.length === 0 && (
            <p className="mt-1 text-muted-foreground">
              No TikTok accounts connected yet.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {apiConnected && (
            <>
              <Link href="/connections/tiktok">
                <Button variant="outline">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Manage accounts
                </Button>
              </Link>
              <Link href="/tiktok/logs">
                <Button variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  API logs
                </Button>
              </Link>
            </>
          )}
          {apiConnected ? (
            <Link href="/tiktok/compose">
              <Button variant="outline">
                <Send className="mr-2 h-4 w-4" />
                Send video URL
              </Button>
            </Link>
          ) : (
            <Link href="/connections/tiktok">
              <Button>
                <LogIn className="mr-2 h-4 w-4" />
                Connect TikTok
              </Button>
            </Link>
          )}
        </div>
      </div>

      <TikTokMethodStatus apiConnected={apiConnected} />

      {apiConnected && current && (
        <TikTokTemplateCard
          connectionId={current.id}
          accountHandle={current.accountHandle}
        />
      )}

      {apiConnected && drafts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No drafts sent yet from @{current?.accountHandle ?? "this account"}.
          </CardContent>
        </Card>
      )}

      {drafts.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {drafts.map((d) => (
            <Card key={d.id} className="overflow-hidden">
              <div className="relative aspect-[9/16] bg-muted">
                {d.videoUrl ? (
                  <video
                    src={d.videoUrl}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    no video
                  </div>
                )}
                <div className="absolute right-1 top-1">
                  <span className="flex items-center gap-1 rounded bg-green-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    <ShieldCheck className="h-3 w-3" />
                    API
                  </span>
                </div>
              </div>
              <CardContent className="space-y-1 p-3">
                <p className="text-xs text-muted-foreground">
                  Sent {new Date(d.postedAt).toLocaleDateString()}
                </p>
                <p className="line-clamp-3 text-sm">
                  {d.content || "(no caption)"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
