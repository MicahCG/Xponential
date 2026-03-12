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
  text: string,
  videoUrl?: string
): Promise<{ id: string }> {
  // If a video URL is provided, upload it first and attach as media
  if (videoUrl) {
    return createLinkedInVideoPost(accessToken, authorUrn, text, videoUrl);
  }

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

/**
 * Posts a video to LinkedIn using the 3-step upload flow:
 * 1. Register upload → get uploadUrl + assetUrn
 * 2. PUT video binary to uploadUrl
 * 3. Create ugcPost referencing the asset
 */
async function createLinkedInVideoPost(
  accessToken: string,
  authorUrn: string,
  text: string,
  videoUrl: string
): Promise<{ id: string }> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
  };

  // Step 1: Register the upload
  const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers,
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
        owner: authorUrn,
        serviceRelationships: [{
          relationshipType: "OWNER",
          identifier: "urn:li:userGeneratedContent",
        }],
      },
    }),
  });

  if (!registerRes.ok) {
    const err = await registerRes.text();
    throw new Error(`LinkedIn video register failed: ${err}`);
  }

  const registerData = await registerRes.json() as {
    value: {
      asset: string;
      uploadMechanism: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
          uploadUrl: string;
        };
      };
    };
  };

  const uploadUrl = registerData.value.uploadMechanism[
    "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
  ].uploadUrl;
  const assetUrn = registerData.value.asset;

  // Step 2: Download the video and upload to LinkedIn
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);
  const videoBuffer = await videoRes.arrayBuffer();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "video/mp4" },
    body: videoBuffer,
  });

  if (!uploadRes.ok && uploadRes.status !== 201) {
    const err = await uploadRes.text();
    throw new Error(`LinkedIn video upload failed (${uploadRes.status}): ${err}`);
  }

  // Step 3: Create the post with the video asset
  const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers,
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "VIDEO",
          media: [{
            status: "READY",
            description: { text: "AI-generated video" },
            media: assetUrn,
            title: { text: "AI Video" },
          }],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  if (!postRes.ok) {
    const err = await postRes.text();
    throw new Error(`LinkedIn video post failed: ${err}`);
  }

  return postRes.json() as Promise<{ id: string }>;
}
