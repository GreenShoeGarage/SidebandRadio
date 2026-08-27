import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  databaseIdentifier,
  findDatabaseBinding,
  findSidebandDatabase,
  isConfiguredDatabaseIdentifier,
  parseD1DatabaseList,
  updateWranglerDatabaseId,
} from "./cloudflare-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";

function listDatabases() {
  const result = spawnSync(wrangler, ["wrangler", "d1", "list", "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error("Cloudflare D1 databases could not be listed. Confirm `npx wrangler login` uses the correct account.");
  }
  return parseD1DatabaseList(`${result.stdout || ""}\n${result.stderr || ""}`);
}

export function ensureCloudflareConfig() {
  const configText = readFileSync(configPath, "utf8");
  const binding = findDatabaseBinding(JSON.parse(configText));
  if (!binding) throw new Error("The DB binding is missing from wrangler.jsonc.");

  if (isConfiguredDatabaseIdentifier(binding.database_id)) {
    console.log(`D1 binding ready: ${binding.database_id}`);
    return binding.database_id;
  }

  const override = process.env.SIDEBAND_D1_DATABASE_ID?.trim();
  let databaseId = override;
  if (!databaseId) {
    console.log("The release contains a placeholder D1 identifier; finding the existing sideband database...");
    databaseId = databaseIdentifier(findSidebandDatabase(listDatabases()));
  }
  if (!isConfiguredDatabaseIdentifier(databaseId)) {
    throw new Error(
      "No existing D1 database named `sideband` was found. Run `npm run setup:cloudflare` once to create and configure it."
    );
  }

  writeFileSync(configPath, updateWranglerDatabaseId(configText, databaseId), "utf8");
  console.log(`Recovered D1 binding: ${databaseId}`);
  return databaseId;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    ensureCloudflareConfig();
  } catch (error) {
    console.error(`\nSIDEBAND deployment configuration failed:\n${error.message}\n`);
    process.exitCode = 1;
  }
}
