import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PinterestMethodStatus } from "@/components/connections/pinterest-method-status";
import { Pin, Plus, LogIn, ShieldCheck, FileText, Settings2 } from "lucide-react";

export const metadata = { title: "Pinterest - Xponential" };

export default async function PinterestPage() {
  const session = await requireAuth();
  const brand = await getCurrentBrand(session.user!.id as string);

  const connection = await prisma.platformConnection.findFirst({
    where: { brandId: brand.id, platform: "pinterest" },
    select: {
      accountHandle: true,
      accessToken: true,
      status: true,
    },
  });

  const apiConnected =
    !!connection?.accessToken && connection.status === "active";

  const pins = apiConnected
    ? await prisma.postHistory.findMany({
        where: {
          brandId: brand.id,
          platform: "pinterest",
          postingMethod: "pinterest_api",
        },
        orderBy: { postedAt: "desc" },
        take: 30,
        select: {
          id: true,
          content: true,
          imageUrl: true,
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
            <Pin className="h-6 w-6" />
            Pinterest
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
                No Pinterest connection on{" "}
                <span className="font-medium text-foreground">{brand.name}</span>{" "}
                yet.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {apiConnected && (
            <>
              <Link href="/connections/pinterest">
                <Button variant="outline">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Manage connection
                </Button>
              </Link>
              <Link href="/pinterest/logs">
                <Button variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  API logs
                </Button>
              </Link>
            </>
          )}
          {apiConnected ? (
            <Link href="/pinterest/compose">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New pin
              </Button>
            </Link>
          ) : (
            <Link href="/connections/pinterest">
              <Button>
                <LogIn className="mr-2 h-4 w-4" />
                Connect Pinterest
              </Button>
            </Link>
          )}
        </div>
      </div>

      <PinterestMethodStatus apiConnected={apiConnected} />

      {apiConnected && pins.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No pins published yet. Compose your first one.
          </CardContent>
        </Card>
      )}

      {pins.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {pins.map((pin) => (
            <Card key={pin.id} className="overflow-hidden">
              <div className="relative aspect-square bg-muted">
                {pin.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pin.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    no image
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
                  {new Date(pin.postedAt).toLocaleDateString()}
                </p>
                <p className="line-clamp-3 text-sm">
                  {pin.content || "(no description)"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
