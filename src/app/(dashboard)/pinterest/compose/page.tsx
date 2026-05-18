import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import {
  getCurrentConnection,
  listConnectionsForPlatform,
} from "@/lib/connection-context";
import { PinComposer } from "@/components/pinterest/pin-composer";
import { PlatformAccountPicker } from "@/components/connections/platform-account-picker";

export const metadata = { title: "Compose pin - Xponential" };

export default async function ComposePinPage() {
  const session = await requireAuth();
  const userId = session.user!.id as string;

  const [accounts, current] = await Promise.all([
    listConnectionsForPlatform(userId, "pinterest"),
    getCurrentConnection(userId, "pinterest"),
  ]);

  const apiConnected = !!current && current.hasAccessToken && current.status === "active";
  if (!apiConnected) {
    redirect("/connections/pinterest");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Compose a pin</h1>
        <p className="text-muted-foreground">
          Publishing via the official Pinterest API.
        </p>
        <div>
          <PlatformAccountPicker
            platform="pinterest"
            accounts={accounts}
            currentId={current?.id ?? null}
            connectHref="/api/connect/start/pinterest"
            label="Pinterest account"
          />
        </div>
      </div>
      <PinComposer />
    </div>
  );
}
