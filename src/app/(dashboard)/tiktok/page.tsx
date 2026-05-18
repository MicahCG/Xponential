import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TikTokMethodStatus } from "@/components/connections/tiktok-method-status";
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
  const brand = await getCurrentBrand(session.user!.id as string);

  const connection = await prisma.platformConnection.findFirst({
    where: { brandId: brand.id, platform: "tiktok" },
    select: {
      accountHandle: true,
      accessToken: true,
      status: true,
    },
  });

  const apiConnected =
    !!connection?.accessToken && connection.status === "active";

  const drafts = apiConnected
    ? await prisma.postHistory.findMany({
        where: {
          brandId: brand.id,
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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Music2 className="h-6 w-6" />
            TikTok
          </h1>
          <p className="text-muted-foreground">
            {apiConnected ? (
              <>
                Connected as{" "}
                <span className="font-medium text-foreground">
                  @{connection!.accountHandle}
                </span>{" "}
                for{" "}
                <span className="font-medium text-foreground">{brand.name}</span>.
              </>
            ) : (
              <>
                No TikTok connection on{" "}
                <span className="font-medium text-foreground">{brand.name}</span>{" "}
                yet.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {apiConnected && (
            <>
              <Link href="/connections/tiktok">
                <Button variant="outline">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Manage connection
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
              <Button>
                <Send className="mr-2 h-4 w-4" />
                Send draft
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

      {apiConnected && drafts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No drafts sent yet. Compose your first video draft.
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
