import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  AlertCircle,
  ExternalLink,
  Pin as PinIcon,
  Twitter,
  Music2,
} from "lucide-react";

export const metadata = { title: "Connections - Xponential" };

interface PlatformCardProps {
  title: string;
  iconBg: string;
  icon: React.ReactNode;
  status: "connected" | "partial" | "disconnected";
  statusLabel: string;
  details?: string;
  bullets: { label: string; ok: boolean }[];
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

function PlatformCard(props: PlatformCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-md ${props.iconBg}`}
          >
            {props.icon}
          </div>
          <div>
            <CardTitle className="text-base">{props.title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {props.details ?? props.statusLabel}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            props.status === "connected"
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : props.status === "partial"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-500"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {props.statusLabel}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1.5 text-sm">
          {props.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              {b.ok ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className={
                  b.ok ? "text-foreground" : "text-muted-foreground"
                }
              >
                {b.label}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Link href={props.primaryHref}>
            <Button variant={props.status === "disconnected" ? "default" : "outline"}>
              {props.primaryLabel}
            </Button>
          </Link>
          {props.secondaryHref && props.secondaryLabel && (
            <Link href={props.secondaryHref}>
              <Button variant="ghost" size="sm">
                {props.secondaryLabel}
                <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ConnectionsHubPage() {
  const session = await requireAuth();
  const brand = await getCurrentBrand(session.user!.id as string);

  const connections = await prisma.platformConnection.findMany({
    where: { brandId: brand.id },
    select: {
      platform: true,
      accountHandle: true,
      accessToken: true,
      twitterCookie: true,
      pinterestCookie: true,
      status: true,
      tokenExpires: true,
    },
  });

  const xConn = connections.find((c) => c.platform === "x");
  const pinConn = connections.find((c) => c.platform === "pinterest");
  const tiktokConn = connections.find((c) => c.platform === "tiktok");

  // X status
  const xHasOAuth = !!xConn?.accessToken && xConn.status === "active";
  const xHasCookie = !!xConn?.twitterCookie;
  const xStatus: PlatformCardProps["status"] = xHasOAuth && xHasCookie
    ? "connected"
    : xHasOAuth || xHasCookie
      ? "partial"
      : "disconnected";
  const xStatusLabel = xStatus === "connected"
    ? "Connected"
    : xStatus === "partial"
      ? "Setup incomplete"
      : "Not connected";

  // Pinterest status — uses the Official Pinterest API exclusively in the UI
  const pinHasOAuth = !!pinConn?.accessToken && pinConn.status === "active";
  const pinStatus: PlatformCardProps["status"] = pinHasOAuth
    ? "connected"
    : "disconnected";
  const pinStatusLabel = pinHasOAuth ? "API Connected" : "Not connected";

  // TikTok status
  const tiktokHasOAuth = !!tiktokConn?.accessToken && tiktokConn.status === "active";
  const tiktokStatus: PlatformCardProps["status"] = tiktokHasOAuth
    ? "connected"
    : "disconnected";
  const tiktokStatusLabel = tiktokHasOAuth ? "API Connected" : "Not connected";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
        <p className="text-muted-foreground">
          Manage the platforms connected to{" "}
          <span className="font-medium text-foreground">{brand.name}</span>.
          Switch brands in the top-left to see a different set of connections.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PlatformCard
          title="X / Twitter"
          iconBg="bg-foreground"
          icon={<Twitter className="h-5 w-5 text-background" />}
          status={xStatus}
          statusLabel={xStatusLabel}
          details={
            xConn?.accountHandle ? `@${xConn.accountHandle}` : "Not connected"
          }
          bullets={[
            { label: "OAuth (read + post)", ok: xHasOAuth },
            { label: "Cookie (posting via Apify)", ok: xHasCookie },
          ]}
          primaryHref={
            xHasOAuth
              ? "/connections/x/cookie-setup"
              : "/api/connect/start/x"
          }
          primaryLabel={xStatus === "disconnected" ? "Connect X" : "Manage"}
          secondaryHref={xHasCookie || xHasOAuth ? "/content" : undefined}
          secondaryLabel={xHasCookie || xHasOAuth ? "Open auto-replies" : undefined}
        />

        <PlatformCard
          title="Pinterest"
          iconBg="bg-red-500"
          icon={<PinIcon className="h-5 w-5 text-white" />}
          status={pinStatus}
          statusLabel={pinStatusLabel}
          details={
            pinConn?.accountHandle && pinHasOAuth
              ? `@${pinConn.accountHandle}`
              : "Not connected"
          }
          bullets={[
            { label: "Official Pinterest API (OAuth)", ok: pinHasOAuth },
            {
              label: "Trial Access — Standard Access pending",
              ok: pinHasOAuth,
            },
            { label: "Human-controlled publishing, one pin at a time", ok: true },
          ]}
          primaryHref="/connections/pinterest"
          primaryLabel={
            pinStatus === "disconnected" ? "Connect Pinterest" : "Manage"
          }
          secondaryHref={pinHasOAuth ? "/pinterest" : undefined}
          secondaryLabel={pinHasOAuth ? "Open Pinterest" : undefined}
        />

        <PlatformCard
          title="TikTok"
          iconBg="bg-black"
          icon={<Music2 className="h-5 w-5 text-white" />}
          status={tiktokStatus}
          statusLabel={tiktokStatusLabel}
          details={
            tiktokConn?.accountHandle && tiktokHasOAuth
              ? `@${tiktokConn.accountHandle}`
              : "Not connected"
          }
          bullets={[
            { label: "Official TikTok API (Login Kit + Content Posting)", ok: tiktokHasOAuth },
            { label: "Sandbox / Trial — Production review pending", ok: tiktokHasOAuth },
            { label: "Drafts to inbox; final publish in TikTok app", ok: true },
          ]}
          primaryHref="/connections/tiktok"
          primaryLabel={
            tiktokStatus === "disconnected" ? "Connect TikTok" : "Manage"
          }
          secondaryHref={tiktokHasOAuth ? "/tiktok" : undefined}
          secondaryLabel={tiktokHasOAuth ? "Open TikTok" : undefined}
        />
      </div>

      <Card>
        <CardContent className="py-5">
          <h3 className="mb-1 text-sm font-semibold">Coming soon</h3>
          <p className="text-sm text-muted-foreground">
            Instagram will appear here once its adapter is built. Each platform
            stays in its own world — its own connect flow, its own composer, its
            own settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
