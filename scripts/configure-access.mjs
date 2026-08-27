import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";

function execute(args) {
  const result = spawnSync(wrangler, ["wrangler", ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler failed: ${args.join(" ")}`);
}

console.log("Enter the Cloudflare Access team domain when prompted.");
execute(["secret", "put", "CF_ACCESS_TEAM_DOMAIN", "--config", "wrangler.jsonc"]);
console.log("Enter the Access application audience tag when prompted.");
execute(["secret", "put", "CF_ACCESS_AUD", "--config", "wrangler.jsonc"]);
console.log("Redeploying with Access verification enabled...");
execute(["deploy", "--config", "wrangler.jsonc"]);
const verification = spawnSync(process.execPath, ["scripts/verify-live.mjs"], { cwd: root, stdio: "inherit" });
if (verification.error) throw verification.error;
if (verification.status !== 0) throw new Error("The Access deployment completed, but its public health check failed.");
console.log("SIDEBAND Access configuration complete.");
