import { requireAuth } from "@/lib/auth-helpers";
import { listConnectionsForPlatform } from "@/lib/connection-context";
import { ChannelList } from "@/components/video/channel-list";
import { Clapperboard } from "lucide-react";

export const metadata = { title: "Video Studio - Xponential" };

export default async function VideoPage() {
  const session = await requireAuth();
  const userId = session.user!.id as string;

  const tiktokConnections = await listConnectionsForPlatform(userId, "tiktok");
  const activeTiktok = tiktokConnections
    .filter((c) => c.status === "active" && c.hasAccessToken)
    .map((c) => ({
      id: c.id,
      accountHandle: c.accountHandle,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Clapperboard className="h-6 w-6" />
          Video Studio
        </h1>
        <p className="text-muted-foreground">
          Channels generate videos through Popcorn and send them as drafts to
          your TikTok inbox. Each channel is a reusable prompt template + target
          account. Click <strong>Run channel</strong> to kick off a new video.
        </p>
      </div>

      <ChannelList tiktokConnections={activeTiktok} />
    </div>
  );
}
