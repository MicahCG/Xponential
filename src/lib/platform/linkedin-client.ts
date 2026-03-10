export async function getLinkedInProfile(accessToken: string) {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch LinkedIn profile");
  }

  return res.json() as Promise<{
    sub: string;
    name: string;
    email?: string;
  }>;
}

/**
 * Posts a comment on a LinkedIn post.
 * activityId: the numeric activity ID from the post URL (e.g. "7289521182721093633")
 */
export async function postLinkedInComment(
  accessToken: string,
  authorUrn: string,
  activityId: string,
  text: string
): Promise<{ id: string }> {
  const res = await fetch(
    `https://api.linkedin.com/v2/socialActions/urn:li:activity:${activityId}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        actor: authorUrn,
        message: { text },
      }),
    }
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`LinkedIn comment failed: ${error}`);
  }

  const data = await res.json() as { id?: string };
  return { id: data.id ?? activityId };
}

export async function createLinkedInPost(
  accessToken: string,
  authorUrn: string,
  text: string
) {
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`LinkedIn post failed: ${error}`);
  }

  return res.json() as Promise<{ id: string }>;
}
