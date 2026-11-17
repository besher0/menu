import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const userId = process.env.RESET_USER_ID;
  const newPassword = process.env.RESET_USER_PASSWORD;
  if (!userId || !newPassword || newPassword.length < 12 || Buffer.byteLength(newPassword) > 72) {
    throw new Error("Set RESET_USER_ID and a 12-character minimum password within bcrypt's 72-byte limit");
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  });

  if (!user) {
    throw new Error("User not found");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });

  console.log("Password reset completed");
}

main()
  .catch((error) => {
    console.error("Password reset failed. Check inputs and database connectivity.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
