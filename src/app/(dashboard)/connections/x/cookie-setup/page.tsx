import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { TwitterCookieForm } from "@/components/settings/twitter-cookie-form";
import { Check, ChevronLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Cookie Setup - Xponential",
};

interface PageProps {
  searchParams: Promise<{ connectionId?: string }>;
}

export default async function CookieSetupPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  const userId = session.user!.id as string;
  const { connectionId } = await searchParams;

  // If connectionId is provided, target that specific X account.
  // Otherwise, fall back to the user's first active X connection.
  const connection = connectionId
    ? await prisma.platformConnection.findFirst({
        where: { id: connectionId, userId, platform: "x" },
        select: { id: true, accountHandle: true },
      })
    : await prisma.platformConnection.findFirst({
        where: { userId, platform: "x", status: "active" },
        orderBy: { connectedAt: "desc" },
        select: { id: true, accountHandle: true },
      });

  if (!connection) {
    redirect("/connections/x");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/connections/x"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        X / Twitter accounts
      </Link>

      {/* Stepper */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white">
            <Check className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            Account linked
          </span>
        </div>
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            2
          </div>
          <span className="text-sm font-medium">Cookie setup</span>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Twitter cookie for @{connection.accountHandle}
        </h1>
        <p className="text-muted-foreground">
          Paste the Twitter session cookie for{" "}
          <span className="font-medium text-foreground">
            @{connection.accountHandle}
          </span>{" "}
          so we can post tweets via Apify on this account&apos;s behalf.
        </p>
      </div>

      <TwitterCookieForm
        connectionId={connection.id}
        onSaveRedirect={`/connections/x?connected=${connection.id}`}
      />

      <div className="text-center">
        <Link
          href="/connections/x"
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Back to X accounts
        </Link>
      </div>
    </div>
  );
}
