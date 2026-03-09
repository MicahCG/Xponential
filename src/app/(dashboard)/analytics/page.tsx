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
  BookMarked,
  Users,
} from "lucide-react";
import { EngagementChart } from "@/components/analytics/engagement-chart";
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

  const [connection, posts, autoRepliesPosted, watchedAccounts] =
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
    ]);

  // ── Aggregate totals ──────────────────────────────────────────
  let totalLikes = 0;
  let totalRetweets = 0;
  let totalReplies = 0;
  let totalImpressions = 0;
  let totalBookmarks = 0;

  for (const post of posts) {
    const e = parseEngagement(post.engagement);
    totalLikes += e.likes ?? 0;
    totalRetweets += e.retweets ?? 0;
    totalReplies += e.replies ?? 0;
    totalImpressions += e.impressions ?? 0;
    totalBookmarks += e.bookmarks ?? 0;
  }

  // ── Weekly chart data (last 12 weeks or since joined) ────────
  const memberSince = connection?.connectedAt
    ? new Date(connection.connectedAt)
    : new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);

  const chartStart = new Date(
    Math.max(memberSince.getTime(), Date.now() - 12 * 7 * 24 * 60 * 60 * 1000)
  );

  const weeks = eachWeekOfInterval(
    { start: startOfWeek(chartStart), end: new Date() },
  );

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

  // ── Top 5 posts by total engagement ──────────────────────────
  const topPosts = posts
    .map((p) => {
      const e = parseEngagement(p.engagement);
      return {
        ...p,
        likes: e.likes ?? 0,
        retweets: e.retweets ?? 0,
        repliesCount: e.replies ?? 0,
        total: (e.likes ?? 0) + (e.retweets ?? 0) + (e.replies ?? 0),
      };
    })
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total)
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Total Posts" value={fmt(posts.length)} icon={<MessageCircle className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Likes" value={fmt(totalLikes)} icon={<Heart className="h-4 w-4 text-rose-400" />} />
        <StatCard title="Retweets" value={fmt(totalRetweets)} icon={<Repeat2 className="h-4 w-4 text-green-400" />} />
        <StatCard title="Replies" value={fmt(totalReplies)} icon={<MessageCircle className="h-4 w-4 text-blue-400" />} />
        <StatCard title="Impressions" value={fmt(totalImpressions)} icon={<Eye className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Auto-Replies" value={fmt(autoRepliesPosted)} icon={<Bot className="h-4 w-4 text-purple-400" />} />
      </div>

      {/* ── Engagement chart ── */}
      <EngagementChart data={weeklyData} />

      <div className="grid gap-4 md:grid-cols-2">
        {/* ── Top posts ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Posts by Engagement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No engagement data yet.</p>
            ) : (
              topPosts.map((post) => (
                <div key={post.id} className="space-y-1">
                  <p className="text-sm line-clamp-2 leading-snug">{post.content}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {post.targetAuthor && (
                      <span className="text-muted-foreground/60">→ @{post.targetAuthor}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3 text-rose-400" /> {post.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <Repeat2 className="h-3 w-3 text-green-400" /> {post.retweets}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3 text-blue-400" /> {post.repliesCount}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

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
      </div>
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
