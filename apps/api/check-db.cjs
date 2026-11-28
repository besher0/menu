require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const url = new URL(process.env.DATABASE_URL);

  console.log("Neon Host:", url.hostname);
  console.log("Database:", url.pathname);

  const result = await prisma.$queryRaw`
    SELECT
      current_database() AS database_name,
      current_schema() AS schema_name,
      current_user AS db_user,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Product'
          AND column_name = 'configurationTree'
      ) AS has_configuration_tree
  `;

  console.table(result);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());