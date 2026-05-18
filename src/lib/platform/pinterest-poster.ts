import { prisma } from "@/lib/prisma";

const APIFY_API_BASE = "https://api.apify.com/v2";

export class PinterestPostError extends Error {
  readonly httpCode?: number;
  readonly isAuthError: boolean;
  readonly rawErrors?: unknown;

  constructor(opts: {
    message: string;
    httpCode?: number;
    isAuthError?: boolean;
    rawErrors?: unknown;
  }) {
    super(opts.message);
    this.name = "PinterestPostError";
    this.httpCode = opts.httpCode;
    this.isAuthError = opts.isAuthError ?? false;
    this.rawErrors = opts.rawErrors;
  }
}

function getApifyToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new PinterestPostError({
      message: "APIFY_API_TOKEN is not configured.",
      isAuthError: true,
    });
  }
  return token;
}

function getActorId(): string {
  const id = process.env.APIFY_PINTEREST_POSTER_ACTOR;
  if (!id) {
    throw new PinterestPostError({
      message:
        "APIFY_PINTEREST_POSTER_ACTOR is not configured. Pick a Pinterest pin-creator actor and set its ID in Vercel env.",
    });
  }
  return id;
}

async function getPinterestCookie(workspaceId: string, connectionId?: string): Promise<string> {
  const connection = connectionId
    ? await prisma.platformConnection.findFirst({
        where: { id: connectionId, workspaceId },
      })
    : await prisma.platformConnection.findFirst({
        where: { workspaceId, platform: "pinterest", status: "active" },
      });

  if (!connection) {
    throw new PinterestPostError({
      message:
        "Pinterest account not connected for this workspace. Connect Pinterest first.",
      isAuthError: true,
    });
  }
  if (!connection.pinterestCookie) {
    throw new PinterestPostError({
      message:
        "Pinterest cookie is not set. Paste your Pinterest session cookie in connection settings.",
      isAuthError: true,
    });
  }
  return connection.pinterestCookie;
}

export interface CreatePinInput {
  workspaceId: string;
  connectionId?: string;
  imageUrl: string;
  title: string;
  description: string;
  boardName?: string;
  boardUrl?: string;
  destinationUrl?: string;
  /** Apify run timeout, seconds. Pinterest browser automation typically takes 30–90s. */
  timeoutSec?: number;
}

export interface CreatePinResult {
  pinId: string;
  pinUrl?: string;
}

/**
 * Creates a pin on Pinterest via an Apify actor using stored cookie auth.
 *
 * Default input shape covers most pin-creator actors. If your chosen actor uses
 * a different schema, set APIFY_PINTEREST_POSTER_INPUT to a JSON string of the
 * full input object and the cookie/imageUrl/title/description/board fields will
 * be merged into it (template values are overridden by call-site values).
 */
export async function createPin(input: CreatePinInput): Promise<CreatePinResult> {
  if (!input.imageUrl || !/^https?:\/\//.test(input.imageUrl)) {
    throw new PinterestPostError({
      message: "Pin image URL must be a public http(s) URL.",
    });
  }
  if (!input.title || input.title.trim().length === 0) {
    throw new PinterestPostError({ message: "Pin title is required." });
  }
  if (input.title.length > 100) {
    throw new PinterestPostError({
      message: `Pin title too long (${input.title.length}/100 characters).`,
    });
  }
  if (input.description.length > 500) {
    throw new PinterestPostError({
      message: `Pin description too long (${input.description.length}/500 characters).`,
    });
  }
  if (!input.boardName && !input.boardUrl) {
    throw new PinterestPostError({
      message: "Either boardName or boardUrl is required so the pin lands somewhere.",
    });
  }

  const cookie = await getPinterestCookie(input.workspaceId, input.connectionId);
  const token = getApifyToken();
  const actorId = getActorId();

  const callValues = {
    cookie,
    imageUrl: input.imageUrl,
    title: input.title,
    description: input.description,
    ...(input.boardName && { boardName: input.boardName, board: input.boardName }),
    ...(input.boardUrl && { boardUrl: input.boardUrl }),
    ...(input.destinationUrl && {
      destinationUrl: input.destinationUrl,
      link: input.destinationUrl,
    }),
  };

  let actorInput: Record<string, unknown>;
  const inputTemplate = process.env.APIFY_PINTEREST_POSTER_INPUT;
  if (inputTemplate) {
    const template = JSON.parse(inputTemplate) as Record<string, unknown>;
    actorInput = { ...template, ...callValues };
  } else {
    actorInput = callValues;
  }

  const timeoutSec = input.timeoutSec ?? 120;
  const runUrl = `${APIFY_API_BASE}/acts/${actorId}/runs?token=${token}&waitForFinish=${timeoutSec}`;

  const runResponse = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(actorInput),
  });

  if (!runResponse.ok) {
    const errBody = await runResponse.text();
    throw new PinterestPostError({
      message: `Apify API error (HTTP ${runResponse.status}): ${errBody.slice(0, 300)}`,
      httpCode: runResponse.status,
      rawErrors: { status: runResponse.status, body: errBody },
    });
  }

  const run = await runResponse.json();
  if (run.data?.status !== "SUCCEEDED") {
    throw new PinterestPostError({
      message: `Apify run did not succeed: status=${run.data?.status ?? "unknown"} runId=${run.data?.id}`,
      rawErrors: run.data,
    });
  }

  const datasetId = run.data?.defaultDatasetId;
  if (!datasetId) {
    throw new PinterestPostError({
      message: "Apify run completed but returned no dataset ID.",
      rawErrors: run.data,
    });
  }

  const datasetResponse = await fetch(
    `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${token}`
  );
  if (!datasetResponse.ok) {
    throw new PinterestPostError({
      message: `Failed to fetch Apify dataset: HTTP ${datasetResponse.status}`,
    });
  }

  const items = (await datasetResponse.json()) as Record<string, unknown>[];
  if (items.length === 0) {
    throw new PinterestPostError({
      message:
        "Apify actor returned no results — the pin may not have been created.",
      rawErrors: { runId: run.data?.id },
    });
  }

  const result = items[0];

  if (
    result.status_message &&
    typeof result.status_message === "string" &&
    !result.pin_id &&
    !result.pinId &&
    !result.id
  ) {
    const statusMsg = result.status_message as string;
    throw new PinterestPostError({
      message: `Pinterest posting failed: ${statusMsg}`,
      rawErrors: result,
      isAuthError: /cookie|auth|login/i.test(statusMsg),
    });
  }

  const pinId =
    (result.pin_id as string) ??
    (result.pinId as string) ??
    (result.id as string) ??
    (run.data?.id as string);

  const pinUrl =
    (result.pin_url as string) ??
    (result.pinUrl as string) ??
    (result.url as string);

  return { pinId, pinUrl };
}
