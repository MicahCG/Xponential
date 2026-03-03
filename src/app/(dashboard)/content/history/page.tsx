import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export default async function HistoryPage() {
  const session = await requireAuth();

  const posts = await prisma.postHistory.findMany({
    where: { userId: session.user!.id },
    orderBy: { postedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Post History</h1>
        <p className="text-muted-foreground">
          View your posting history and engagement data
        </p>
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No posts yet. Generate and publish content to see it here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {post.platform}
                    </Badge>
                    <Badge variant="secondary" className="capitalize">
                      {post.postType.replace("_", " ")}
                    </Badge>
                    {post.targetAuthor && (
                      <span className="text-xs text-muted-foreground">
                        to @{post.targetAuthor}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(post.postedAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="whitespace-pre-wrap text-foreground">
                  {post.content}
                </CardDescription>
                {post.platformPostId && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Post ID: {post.platformPostId}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
