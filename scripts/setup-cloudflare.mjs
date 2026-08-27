import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));

function execute(args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(wrangler, ["wrangler", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    if (capture) process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`Wrangler failed: ${args.join(" ")}`);
  }
  return capture ? `${result.stdout || ""}\n${result.stderr || ""}` : "";
}

function listDatabases() {
  const output = execute(["d1", "list", "--json"], { capture: true });
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("Wrangler did not return a readable D1 database list.");
  return JSON.parse(output.slice(start, end + 1));
}

function runProject(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Project command failed: ${command} ${args.join(" ")}`);
}

function updateDatabaseBinding(databaseId) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const binding = config.d1_databases?.find(item => item.binding === "DB" || item.database_name === "sideband");
  if (!binding) throw new Error("The DB binding is missing from wrangler.jsonc.");
  binding.database_id = databaseId;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

console.log("\nSIDEBAND — one-time Cloudflare setup\n");
console.log("Running the complete test suite...");
runProject(npm, ["test"]);
execute(["whoami"]);

let database = listDatabases().find(item => item.name === "sideband");
if (!database) {
  console.log("\nCreating D1 database: sideband");
  const created = execute(["d1", "create", "sideband"], { capture: true });
  const id = created.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0];
  database = listDatabases().find(item => item.name === "sideband") || (id ? { uuid: id } : null);
}
const databaseId = database?.uuid || database?.id;
if (!databaseId) throw new Error("The sideband D1 database exists, but its identifier could not be determined.");
updateDatabaseBinding(databaseId);
console.log(`D1 binding ready: ${databaseId}`);

const buckets = execute(["r2", "bucket", "list"], { capture: true, allowFailure: true });
if (!buckets.includes("sideband-media")) {
  console.log("\nCreating private R2 bucket: sideband-media");
  execute(["r2", "bucket", "create", "sideband-media"]);
} else {
  console.log("R2 bucket ready: sideband-media");
}

console.log("\nApplying D1 migrations...");
execute(["d1", "migrations", "apply", "sideband", "--remote", "--config", "wrangler.jsonc"]);

console.log("\nDeploying SIDEBAND to https://greenshoegarage.com/radio/ ...");
execute(["deploy", "--config", "wrangler.jsonc"]);
runProject(process.execPath, ["scripts/verify-live.mjs"]);

console.log(`
Infrastructure and the public application are deployed.

One manual security step remains:
  1. In Cloudflare Zero Trust, create one self-hosted Access application.
  2. Add these two protected paths:
       greenshoegarage.com/radio/studio*
       greenshoegarage.com/radio/api/admin/*
  3. Add an Allow policy for your operator identity.
  4. Run: npm run configure:access
`);
