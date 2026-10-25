import prisma, { TransactionClient } from "../../config/database";

/** Created by reporting. A repeat report restarts the window. */
export function blockPair(tx: TransactionClient, blockerId: string, blockedId: string) {
  return tx.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: { createdAt: new Date() },
  });
}

/** Everyone this user must not be matched with: blocked either way, within the window. */
export async function blockedPartnersOf(userId: string, blockHours: number): Promise<Set<string>> {
  const since = new Date(Date.now() - blockHours * 60 * 60 * 1000);

  const blocks = await prisma.block.findMany({
    where: { createdAt: { gt: since }, OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });

  return new Set(blocks.map((block) => (block.blockerId === userId ? block.blockedId : block.blockerId)));
}
