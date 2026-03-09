import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Repeat2,
  MessageCircle,
  Eye,
  Bot,
  Users,
} from "lucide-react";
import { EngagementChart } from "@/components/analytics/engagement-chart";
import { FollowerChart } from "@/components/analytics/follower-chart";
import { format, eachWeekOfInterval, startOfWeek } from "date-fns";

interface EngagementData {
  likes?: number;
  retweets?: number;
  replies?: number;
  impressions?: number;
  bookmarks?: number;
}

function parseEngagement(raw: unknown): EngagementData {
  if (!raw || typeof raw !== "object") return {};
  return raw as EngagementData;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default async function AnalyticsPage() {
  const session = await requireAuth();
  const userId = session.user!.id!;

  const [connection, posts, autoRepliesPosted, watchedAccounts, followerSnapshots] =
    await Promise.all([
      prisma.platformConnection.findFirst({
        where: { userId, platform: "x" },
        select: { connectedAt: true, accountHandle: true },
      }),
      prisma.postHistory.findMany({
        where: { userId },
        select: {
          id: true,
          postedAt: true,
          postType: true,
          content: true,
          targetAuthor: true,
          engagement: true,
        },
        orderBy: { postedAt: "asc" },
      }),
      prisma.autoReplyLog.count({
        where: { userId, status: "posted" },
      }),
      prisma.watchedAccount.findMany({
        where: { userId, isEnabled: true },
        select: {
          accountHandle: true,
          followersCount: true,
          replyCount: true,
        },
        orderBy: { followersCount: "desc" },
      }),
      prisma.followerSnapshot.findMany({
        where: { userId, platform: "x" },
        select: { followers: true, capturedAt: true },
        orderBy: { capturedAt: "asc" },
      }),
    ]);

  // ── Aggregate totals (replies only) ──────────────────────────
  const replyPosts = posts.filter((p) => p.postType === "reply");
  let totalLikes = 0;
  let totalReplies = 0;
  let totalImpressions = 0;

  for (const post of replyPosts) {
    const e = parseEngagement(post.engagement);
    totalLikes += e.likes ?? 0;
    totalReplies += e.replies ?? 0;
    totalImpressions += e.impressions ?? 0;
  }

  // ── Follower chart data ───────────────────────────────────────
  const followerData = followerSnapshots.map((s) => ({
    date: format(new Date(s.capturedAt), "MMM d"),
    followers: s.followers,
  }));

  // ── Weekly activity chart (last 12 weeks) ────────────────────
  const memberSince = connection?.connectedAt
    ? new Date(connection.connectedAt)
    : new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);

  const chartStart = new Date(
    Math.max(memberSince.getTime(), Date.now() - 12 * 7 * 24 * 60 * 60 * 1000)
  );

  const weeks = eachWeekOfInterval({
    start: startOfWeek(chartStart),
    end: new Date(),
  });

  const weeklyData = weeks.map((weekStart) => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const weekPosts = posts.filter((p) => {
      const d = new Date(p.postedAt);
      return d >= weekStart && d < weekEnd;
    });
    const weekLikes = weekPosts.reduce(
      (sum, p) => sum + (parseEngagement(p.engagement).likes ?? 0),
      0
    );
    const weekRetweets = weekPosts.reduce(
      (sum, p) => sum + (parseEngagement(p.engagement).retweets ?? 0),
      0
    );
    return {
      week: format(weekStart, "MMM d"),
      posts: weekPosts.length,
      likes: weekLikes,
      retweets: weekRetweets,
    };
  });

  // ── Top replies by impressions then likes ─────────────────────
  const topReplies = replyPosts
    .map((p) => {
      const e = parseEngagement(p.engagement);
      return {
        ...p,
        likes: e.likes ?? 0,
        repliesCount: e.replies ?? 0,
        impressions: e.impressions ?? 0,
      };
    })
    .filter((p) => p.impressions > 0 || p.likes > 0)
    .sort((a, b) => b.impressions - a.impressions || b.likes - a.likes)
    .slice(0, 5);

  const memberSinceLabel = connection?.connectedAt
    ? format(new Date(connection.connectedAt), "MMMM d, yyyy")
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          {memberSinceLabel
            ? `Your X performance since ${memberSinceLabel}`
            : "Your X performance overview"}
          {connection?.accountHandle && ` · @${connection.accountHandle}`}
        </p>
      </div>

      {/* ── Summary stat cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Auto-Replies Posted" value={fmt(autoRepliesPosted)} icon={<Bot className="h-4 w-4 text-purple-400" />} />
        <StatCard title="Impressions" value={fmt(totalImpressions)} icon={<Eye className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Likes on Replies" value={fmt(totalLikes)} icon={<Heart className="h-4 w-4 text-rose-400" />} />
        <StatCard title="Replies to Replies" value={fmt(totalReplies)} icon={<MessageCircle className="h-4 w-4 text-blue-400" />} />
      </div>

      {/* ── Follower growth chart ── */}
      <FollowerChart data={followerData} />

      {/* ── Activity over time chart ── */}
      <EngagementChart data={weeklyData} />

      {/* ── Watched accounts ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Watched Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {watchedAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No watched accounts yet.</p>
          ) : (
            watchedAccounts.map((acct) => (
              <div key={acct.accountHandle} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">@{acct.accountHandle}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{fmt(acct.followersCount ?? 0)} followers</span>
                  <Badge variant="outline" className="text-xs">
                    {acct.replyCount} replies
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Best performing replies ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">🏆 Best Performing Replies</CardTitle>
        </CardHeader>
        <CardContent>
          {topReplies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reply engagement data yet — metrics are polled every 48h after posting.
            </p>
          ) : (
            <div className="space-y-4">
              {topReplies.map((reply, i) => (
                <div key={reply.id} className="flex gap-4 rounded-lg border p-4">
                  <span className="text-2xl font-bold text-muted-foreground/30 leading-none w-6 shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm leading-snug line-clamp-3">{reply.content}</p>
                    {reply.targetAuthor && (
                      <p className="text-xs text-muted-foreground">
                        → replied to <span className="font-medium">@{reply.targetAuthor}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-sm font-medium">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Eye className="h-3.5 w-3.5" />
                        <span>{fmt(reply.impressions)}</span>
                        <span className="text-xs font-normal text-muted-foreground/60">views</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-rose-500">
                        <Heart className="h-3.5 w-3.5" />
                        <span>{fmt(reply.likes)}</span>
                        <span className="text-xs font-normal text-muted-foreground/60">likes</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-blue-500">
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>{fmt(reply.repliesCount)}</span>
                        <span className="text-xs font-normal text-muted-foreground/60">replies</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
