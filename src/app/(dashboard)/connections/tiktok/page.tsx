import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBrand } from "@/lib/brand-context";
import { TikTokMethodStatus } from "@/components/connections/tiktok-method-status";
import { TikTokOAuthConnect } from "@/components/connections/tiktok-oauth-connect";

export const metadata = {
  title: "Connect TikTok - Xponential",
};

export default async function TikTokConnectPage() {
  const session = await requireAuth();
  const brand = await getCurrentBrand(session.user!.id as string);

  const connection = await prisma.platformConnection.findFirst({
    where: { brandId: brand.id, platform: "tiktok" },
    select: {
      id: true,
      accountHandle: true,
      accountId: true,
      status: true,
      accessToken: true,
      tokenExpires: true,
      scopes: true,
    },
  });

  const apiConnected =
    !!connection?.accessToken && connection.status === "active";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {apiConnected ? "TikTok connection" : "Connect TikTok"}
        </h1>
        <p className="text-muted-foreground">
          {apiConnected ? (
            <>
              TikTok Content Posting API connected for{" "}
              <span className="font-medium text-foreground">{brand.name}</span>.
            </>
          ) : (
            <>
              Connect{" "}
              <span className="font-medium text-foreground">{brand.name}</span> to
              TikTok via the official Login Kit. Each video draft is sent to your
              TikTok inbox — you review and publish from the TikTok app.
            </>
          )}
        </p>
      </div>

      <TikTokMethodStatus apiConnected={apiConnected} />

      <TikTokOAuthConnect
        connected={apiConnected}
        accountHandle={apiConnected ? (connection?.accountHandle ?? null) : null}
        tokenExpiresAt={
          apiConnected && connection?.tokenExpires
            ? connection.tokenExpires.toISOString()
            : null
        }
        brandName={brand.name}
      />

      {apiConnected && (
        <div className="rounded-md border border-muted bg-muted/30 p-4 text-sm">
          <p className="mb-2 font-medium">Account details</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <dt>Handle</dt>
            <dd className="text-foreground">@{connection?.accountHandle}</dd>
            <dt>open_id</dt>
            <dd className="font-mono">
              {connection?.accountId
                ? connection.accountId.slice(0, 6) + "…" + connection.accountId.slice(-4)
                : "—"}
            </dd>
            <dt>Granted scopes</dt>
            <dd className="font-mono text-foreground">
              {connection?.scopes ?? "—"}
            </dd>
          </dl>
          <div className="mt-3 flex gap-3 text-xs">
            <Link
              href="/tiktok/compose"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Compose a video draft →
            </Link>
            <Link
              href="/tiktok/logs"
              className="underline underline-offset-2 hover:text-foreground"
            >
              View API logs →
            </Link>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Xponential&apos;s handling of TikTok data is described in our{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link
          href="/terms"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Terms of Service
        </Link>
        .
      </p>
    </div>
  );
}
