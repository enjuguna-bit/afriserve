import { prisma } from "../src/db/prismaClient.js";

async function main() {
  const result = await prisma.users.updateMany({
    where: {
      locked_until: { not: null }
    },
    data: {
      locked_until: null,
      failed_login_attempts: 0
    }
  });
  console.log(`Unlocked ${result.count} users successfully.`);
}

main().catch(console.error);
