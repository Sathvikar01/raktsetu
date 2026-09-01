/**
 * One-time backfill: encrypt any User.mfaSecret values still stored in
 * plaintext (rows created before secret encryption at rest was introduced).
 * Idempotent — already-encrypted values are left untouched.
 * Usage: npm run mfa:backfill
 */
import "dotenv/config";

async function main() {
  const { prisma } = await import("../src/packages/database/client");
  const { encryptSecret, looksEncryptedSecret } = await import("../src/lib/crypto");

  const users = await prisma.user.findMany({
    where: { mfaSecret: { not: null } },
    select: { id: true, mfaSecret: true },
  });
  let migrated = 0;
  for (const user of users) {
    if (!user.mfaSecret || looksEncryptedSecret(user.mfaSecret)) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: encryptSecret(user.mfaSecret) },
    });
    migrated++;
  }
  console.log(JSON.stringify({ msg: "mfa_backfill_complete", scanned: users.length, migrated }));
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", msg: "mfa_backfill_failed", name: (err as Error)?.name }));
  process.exit(1);
});
