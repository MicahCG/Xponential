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
