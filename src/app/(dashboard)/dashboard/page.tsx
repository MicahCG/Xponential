import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link2, Brain, PenTool, History, Clock, MessageSquare } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSetupComplete } from "@/lib/setup-check";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const session = await requireAuth();
  const userId = session.user!.id!;

  // Redirect to FTUE if setup is incomplete
  const setupDone = await isSetupComplete(userId);
  if (!setupDone) redirect("/setup");

  const [connections, profile, pendingCount, recentPosts, pendingReplies] = await Promise.all([
    prisma.platformConnection.findMany({
      where: { userId },
      select: { platform: true, status: true, accountHandle: true },
    }),
    prisma.personalityProfile.findFirst({
      where: { userId, isActive: true },
      select: { method: true },
    }),
    prisma.contentQueue.count({
      where: { userId, status: "pending" },
    }),
    prisma.postHistory.findMany({
      where: { userId },
      orderBy: { postedAt: "desc" },
      take: 5,
      select: {
        id: true,
        platform: true,
        postType: true,
        content: true,
        postedAt: true,
      },
    }),
    prisma.autoReplyLog.findMany({
      where: { userId, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        targetAuthor: true,
        targetTweetText: true,
        replyContent: true,
        replyType: true,
        createdAt: true,
      },
    }),
  ]);

  const activeConnections = connections.filter((c) => c.status === "active");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to Xponential. Here&apos;s your overview.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/connections" className="h-full">
          <Card className="h-full transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Connections</CardTitle>
              <Link2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {activeConnections.length > 0 ? (
                <div className="flex gap-2">
                  {activeConnections.map((c) => (
                    <Badge key={c.platform} variant="default" className="capitalize">
                      {c.platform}: @{c.accountHandle}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Badge variant="secondary">Not connected</Badge>
              )}
              <CardDescription className="mt-2">
                {activeConnections.length > 0
                  ? `${activeConnections.length} platform(s) connected`
                  : "Connect X and LinkedIn to start posting"}
              </CardDescription>
            </CardContent>
          </Card>
        </Link>

        <Link href="/personality" className="h-full">
          <Card className="h-full transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Personality</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {profile ? (
                <Badge variant="default" className="capitalize">
                  {profile.method}
                </Badge>
              ) : (
                <Badge variant="secondary">Not configured</Badge>
              )}
              <CardDescription className="mt-2">
                {profile
                  ? "Voice profile active"
                  : "Set up your voice profile for authentic content"}
              </CardDescription>
            </CardContent>
          </Card>
        </Link>

        <Link href="/content" className="h-full">
          <Card className="h-full transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Content Queue</CardTitle>
              <PenTool className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingCount}</div>
              <CardDescription className="mt-2">
                Pending items in queue
              </CardDescription>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Pending Approval Replies */}
      {pendingReplies.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Pending Approval</h2>
              <Badge variant="secondary">{pendingReplies.length}</Badge>
            </div>
            <Link href="/auto-replies" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {pendingReplies.map((reply) => (
              <Link key={reply.id} href="/auto-replies">
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Replying to @{reply.targetAuthor}
                        </span>
                        {reply.replyType === "video" && (
                          <Badge variant="outline" className="text-xs">
                            video
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(reply.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      &ldquo;{reply.targetTweetText}&rdquo;
                    </p>
                    {reply.replyContent && (
                      <p className="text-sm truncate">
                        {reply.replyContent}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recentPosts.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Recent Posts</h2>
          </div>
          <div className="space-y-2">
            {recentPosts.map((post) => (
              <Card key={post.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {post.platform}
                  </Badge>
                  <p className="truncate text-sm">{post.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
