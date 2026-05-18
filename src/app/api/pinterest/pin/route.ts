import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace-context";
import {
  loadActiveConnection,
  createPin as createPinViaApi,
  PinterestApiError,
} from "@/lib/platform/pinterest-client";
import { createPin as createPinViaApify, PinterestPostError } from "@/lib/platform/pinterest-poster";

const pinSchema = z.object({
  method: z.enum(["api", "fallback"]).default("api"),
  imageUrl: z.string().url().max(2000),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
  // API path: boardId is preferred (returned by /api/pinterest/boards)
  boardId: z.string().trim().max(100).optional(),
  // Fallback path uses boardName or boardUrl
  boardName: z.string().trim().max(100).optional(),
  boardUrl: z.string().url().max(500).optional(),
  destinationUrl: z.string().url().max(2000).optional(),
  altText: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspace = await getCurrentWorkspace(session.user.id);

  const body = await request.json();
  const parsed = pinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.method === "api") {
    if (!parsed.data.boardId) {
      return NextResponse.json(
        { error: "boardId is required for the official API path. Select a board from your account." },
        { status: 400 }
      );
    }

    const conn = await loadActiveConnection(workspace.id, { userId: session.user.id });
    if (!conn || !conn.accessToken) {
      return NextResponse.json(
        {
          error:
            "Pinterest API is not connected for this workspace. Click 'Connect with Pinterest' first.",
        },
        { status: 400 }
      );
    }

    try {
      const result = await createPinViaApi(conn, {
        boardId: parsed.data.boardId,
        title: parsed.data.title,
        description: parsed.data.description,
        imageUrl: parsed.data.imageUrl,
        link: parsed.data.destinationUrl,
        altText: parsed.data.altText,
      });

      const record = await prisma.postHistory.create({
        data: {
          userId: session.user.id,
          workspaceId: workspace.id,
          platform: "pinterest",
          postType: "original",
          content: parsed.data.description,
          imageUrl: parsed.data.imageUrl,
          platformPostId: result.id,
          postingMethod: "pinterest_api",
        },
        select: { id: true },
      });

      return NextResponse.json({
        ok: true,
        method: "pinterest_api",
        pinId: result.id,
        pinUrl: result.link,
        historyId: record.id,
        endpoint: "POST /v5/pins",
        statusCode: 200,
      });
    } catch (err) {
      if (err instanceof PinterestApiError) {
        return NextResponse.json(
          {
            error: err.message,
            endpoint: "POST /v5/pins",
            statusCode: err.httpCode,
            responseBody: err.responseBody,
          },
          { status: err.isAuthError ? 401 : 502 }
        );
      }
      console.error("[pinterest/pin] API path unexpected error:", err);
      return NextResponse.json(
        {
          error: "Unexpected error from Pinterest API path.",
          endpoint: "POST /v5/pins",
        },
        { status: 500 }
      );
    }
  }

  // ── Fallback path (cookie / Apify) ──
  if (!parsed.data.boardName && !parsed.data.boardUrl) {
    return NextResponse.json(
      {
        error:
          "Fallback path requires boardName or boardUrl since it doesn't have access to your board list.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await createPinViaApify({
      workspaceId: workspace.id,
      imageUrl: parsed.data.imageUrl,
      title: parsed.data.title,
      description: parsed.data.description,
      boardName: parsed.data.boardName,
      boardUrl: parsed.data.boardUrl,
      destinationUrl: parsed.data.destinationUrl,
    });

    const record = await prisma.postHistory.create({
      data: {
        userId: session.user.id,
        workspaceId: workspace.id,
        platform: "pinterest",
        postType: "original",
        content: parsed.data.description,
        imageUrl: parsed.data.imageUrl,
        platformPostId: result.pinId,
        postingMethod: "apify_cookie",
      },
      select: { id: true },
    });

    return NextResponse.json({
      ok: true,
      method: "apify_cookie",
      pinId: result.pinId,
      pinUrl: result.pinUrl ?? null,
      historyId: record.id,
    });
  } catch (err) {
    if (err instanceof PinterestPostError) {
      return NextResponse.json(
        { error: err.message, isAuthError: err.isAuthError },
        { status: err.isAuthError ? 401 : 502 }
      );
    }
    console.error("[pinterest/pin] fallback path unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error from Pinterest fallback path." },
      { status: 500 }
    );
  }
}
