import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const userId = "cmrul17ex002xktyww4lto8pt";
const newPassword = "WysmjxZp@K6@xVq";

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true }
  });

  if (!user) {
    throw new Error(`User ${userId} was not found.`);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });

  console.log(`Password was reset for ${user.email} (${user.id}).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
