import { appendFile, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  BackfillProgress,
  runProductConfigurationBackfill
} from "./product-configuration-backfill";

type CliOptions = {
  execute: boolean;
  batchSize: number;
  maxProducts?: number;
  resumeAfter?: string;
  confirmDatabase?: string;
  checkpointFile?: string;
  quarantineFile?: string;
};

function valueAfter(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveInteger(value: string | undefined, fallback?: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`Invalid positive integer: ${value}`);
  return parsed;
}

function parseOptions(args: string[]): CliOptions {
  const execute = args.includes("--execute");
  const batchSize = positiveInteger(valueAfter(args, "--batch-size"), 100)!;
  if (batchSize > 1000) throw new Error("--batch-size cannot exceed 1000");
  const options = {
    execute,
    batchSize,
    maxProducts: positiveInteger(valueAfter(args, "--max-products")),
    resumeAfter: valueAfter(args, "--resume-after"),
    confirmDatabase: valueAfter(args, "--confirm-database"),
    checkpointFile: valueAfter(args, "--checkpoint-file"),
    quarantineFile: valueAfter(args, "--quarantine-file")
  };
  if (execute && (!options.checkpointFile || !options.quarantineFile)) {
    throw new Error("--execute requires both --checkpoint-file and --quarantine-file");
  }
  return options;
}

async function readCheckpoint(path: string | undefined) {
  if (!path) return undefined;
  try {
    return JSON.parse(await readFile(resolve(path), "utf8")) as BackfillProgress;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeCheckpoint(path: string | undefined, progress: BackfillProgress) {
  if (!path) return;
  const target = resolve(path);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(progress, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

async function appendOperationalRecord(path: string | undefined, record: unknown) {
  if (!path) return;
  await appendFile(resolve(path), `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const checkpoint = await readCheckpoint(options.checkpointFile);
  if (checkpoint && options.confirmDatabase && checkpoint.database !== options.confirmDatabase) {
    throw new Error("Checkpoint database does not match --confirm-database");
  }
  const resumeAfter = options.resumeAfter ?? checkpoint?.lastCursor ?? undefined;
  const prisma = new PrismaClient();

  try {
    const result = await runProductConfigurationBackfill(prisma, {
      batchSize: options.batchSize,
      maxProducts: options.maxProducts,
      resumeAfter,
      execute: options.execute,
      confirmDatabase: options.confirmDatabase,
      initialProgress: checkpoint,
      onQuarantine: async (record) => appendOperationalRecord(options.quarantineFile, record),
      onConflict: async (record) => appendOperationalRecord(options.quarantineFile, record),
      onBatchComplete: async (progress) => {
        await writeCheckpoint(options.checkpointFile, progress);
        process.stdout.write(`${JSON.stringify({ event: "batch", ...progress })}\n`);
      }
    });
    await writeCheckpoint(options.checkpointFile, result);
    process.stdout.write(`${JSON.stringify({ event: "complete", dryRun: !options.execute, ...result }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
