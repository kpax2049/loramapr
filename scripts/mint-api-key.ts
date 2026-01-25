import "dotenv/config";
import { PrismaClient, ApiKeyScope } from "@prisma/client";
import { generateApiKey, hashApiKey } from "../src/common/security/apiKey";

type Args = {
  help?: boolean;
  scopes?: string;
  label?: string;
  ownerId?: string;
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.scopes) {
  console.error("Missing --scopes.");
  printHelp();
  process.exit(1);
}

const scopes = parseScopes(args.scopes);
const prisma = new PrismaClient();

async function run(): Promise<void> {
  const plaintextKey = generateApiKey();
  const keyHash = hashApiKey(plaintextKey);

  await prisma.apiKey.create({
    data: {
      keyHash,
      scopes,
      label: args.label ?? undefined,
      owner: args.ownerId ? { connect: { id: args.ownerId } } : undefined
    }
  });

  console.log("API key:", plaintextKey);
  console.log("Scopes:", scopes.join(","));
  if (args.label) {
    console.log("Label:", args.label);
  }
  if (args.ownerId) {
    console.log("Owner ID:", args.ownerId);
  }
  console.log("Store this key securely; it will not be shown again.");
}

run()
  .catch((error) => {
    console.error("Failed to mint API key:", error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

function parseArgs(argv: string[]): Args {
  const parsed: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--help" || value === "-h") {
      parsed.help = true;
      continue;
    }
    if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        parsed[key as keyof Args] = next;
        i += 1;
      } else {
        parsed[key as keyof Args] = "true" as unknown as never;
      }
    }
  }
  return parsed;
}

function parseScopes(value: string): ApiKeyScope[] {
  const rawScopes = value
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  if (rawScopes.length === 0) {
    console.error("No scopes provided.");
    process.exit(1);
  }

  const validScopes = new Set(Object.values(ApiKeyScope));
  const scopes = rawScopes.map((scope) => scope.toUpperCase());
  for (const scope of scopes) {
    if (!validScopes.has(scope as ApiKeyScope)) {
      console.error(`Invalid scope: ${scope}`);
      process.exit(1);
    }
  }

  return scopes as ApiKeyScope[];
}

function printHelp(): void {
  console.log(`Usage: npm run apikey:mint -- --scopes INGEST,QUERY [options]

Options:
  --scopes     Comma-separated scopes (required). Example: INGEST,QUERY
  --label      Optional label for the API key
  --ownerId    Optional owner user ID
  --help       Show help
`);
}
