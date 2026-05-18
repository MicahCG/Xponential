import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  getCurrentConnection,
  listConnectionsForPlatform,
} from "@/lib/connection-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PinterestMethodStatus } from "@/components/connections/pinterest-method-status";
import { PlatformAccountPicker } from "@/components/connections/platform-account-picker";
import {
  Pin,
  Plus,
  LogIn,
  ShieldCheck,
  FileText,
  Settings2,
} from "lucide-react";

export const metadata = { title: "Pinterest - Xponential" };

export default async function PinterestPage() {
  const session = await requireAuth();
  const userId = session.user!.id as string;

  const [accounts, current] = await Promise.all([
    listConnectionsForPlatform(userId, "pinterest"),
    getCurrentConnection(userId, "pinterest"),
  ]);

  const apiConnected = !!current && current.hasAccessToken && current.status === "active";

  // Pull pins for the currently-selected connection's brand
  let pins: Array<{
    id: string;
    content: string;
    imageUrl: string | null;
    platformPostId: string | null;
    postedAt: Date;
  }> = [];
  if (apiConnected && current) {
    const full = await prisma.platformConnection.findUnique({
      where: { id: current.id },
      select: { brandId: true },
    });
    if (full) {
      pins = await prisma.postHistory.findMany({
        where: {
          brandId: full.brandId,
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
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Pin className="h-6 w-6" />
            Pinterest
          </h1>
          {accounts.length > 0 ? (
            <div className="mt-2">
              <PlatformAccountPicker
                platform="pinterest"
                accounts={accounts}
                currentId={current?.id ?? null}
                connectHref="/api/connect/start/pinterest"
                label="Pinterest account"
              />
            </div>
          ) : (
            <p className="mt-1 text-muted-foreground">
              No Pinterest accounts connected yet.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {apiConnected && (
            <>
              <Link href="/connections/pinterest">
                <Button variant="outline">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Manage accounts
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
            No pins published yet from @{current?.accountHandle ?? "this account"}.
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
