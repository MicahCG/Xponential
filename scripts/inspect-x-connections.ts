import { prisma } from "../src/lib/prisma";

async function main() {
  const conns = await prisma.platformConnection.findMany({
    where: { platform: "x" },
    select: {
      id: true,
      userId: true,
      accountHandle: true,
      accountId: true,
      status: true,
      connectedAt: true,
      tokenExpires: true,
      accessToken: true,
      refreshToken: true,
    },
    orderBy: { connectedAt: "desc" },
  });

  for (const c of conns) {
    const at = c.accessToken ?? "";
    const rt = c.refreshToken ?? "";
    console.log({
      id: c.id,
      userId: c.userId,
      handle: c.accountHandle,
      accountId: c.accountId,
      status: c.status,
      connectedAt: c.connectedAt,
      tokenExpires: c.tokenExpires,
      accessTokenLen: at.length,
      accessTokenPrefix: at.slice(0, 12),
      accessTokenSuffix: at.slice(-6),
      refreshTokenLen: rt.length,
      refreshTokenPrefix: rt.slice(0, 12),
    });
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
