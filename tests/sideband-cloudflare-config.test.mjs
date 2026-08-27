import test from "node:test";
import assert from "node:assert/strict";
import {
  PLACEHOLDER_DATABASE_ID,
  databaseIdentifier,
  findDatabaseBinding,
  findSidebandDatabase,
  isConfiguredDatabaseIdentifier,
  parseD1DatabaseList,
  updateWranglerDatabaseId,
} from "../scripts/cloudflare-config.mjs";

const realId = "12345678-abcd-4abc-8def-1234567890ab";

test("placeholder D1 identifiers are never accepted as configured", () => {
  assert.equal(isConfiguredDatabaseIdentifier(PLACEHOLDER_DATABASE_ID), false);
  assert.equal(isConfiguredDatabaseIdentifier(realId), true);
  assert.equal(isConfiguredDatabaseIdentifier("not-an-id"), false);
});

test("Wrangler D1 list output tolerates banners and resolves sideband", () => {
  const output = `wrangler 4.92.0\n${JSON.stringify([{ uuid: realId, name: "sideband" }])}\n[WARNING] update available`;
  const databases = parseD1DatabaseList(output);
  assert.equal(databaseIdentifier(findSidebandDatabase(databases)), realId);
});

test("wrangler configuration recovery only updates the D1 binding", () => {
  const source = JSON.stringify({
    name: "sideband-audio-broadcast-workbench",
    d1_databases: [{ binding: "DB", database_name: "sideband", database_id: PLACEHOLDER_DATABASE_ID }],
    r2_buckets: [{ binding: "BUCKET", bucket_name: "sideband-media" }],
  });
  const updated = JSON.parse(updateWranglerDatabaseId(source, realId));
  assert.equal(findDatabaseBinding(updated).database_id, realId);
  assert.deepEqual(updated.r2_buckets, [{ binding: "BUCKET", bucket_name: "sideband-media" }]);
});

test("invalid replacement identifiers are rejected", () => {
  assert.throws(() => updateWranglerDatabaseId("{}", PLACEHOLDER_DATABASE_ID), /invalid D1 database identifier/);
});
