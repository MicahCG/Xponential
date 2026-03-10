export async function getLinkedInProfile(accessToken: string) {
  const res = await fetch(
    "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new Error("Failed to fetch LinkedIn profile");
  }

  const data = await res.json() as {
    id: string;
    localizedFirstName: string;
    localizedLastName: string;
  };

  return {
    sub: data.id,
    name: `${data.localizedFirstName} ${data.localizedLastName}`.trim(),
  };
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
