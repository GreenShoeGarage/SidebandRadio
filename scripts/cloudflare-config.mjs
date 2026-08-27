export const PLACEHOLDER_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

const DATABASE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function databaseIdentifier(database) {
  return database?.uuid || database?.id || database?.database_id || null;
}

export function isDatabaseIdentifier(value) {
  return typeof value === "string" && DATABASE_ID_PATTERN.test(value);
}

export function isConfiguredDatabaseIdentifier(value) {
  return isDatabaseIdentifier(value) && value !== PLACEHOLDER_DATABASE_ID;
}

export function findDatabaseBinding(config) {
  return config?.d1_databases?.find(item => item.binding === "DB" || item.database_name === "sideband") || null;
}

export function parseD1DatabaseList(output) {
  const text = String(output || "").trim();
  if (!text) throw new Error("Wrangler returned an empty D1 database list.");

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.result)) return parsed.result;
  } catch {
    // Wrangler can print a version banner around otherwise valid JSON.
  }

  const starts = [...text.matchAll(/\[/g)].map(match => match.index);
  const ends = [...text.matchAll(/\]/g)].map(match => match.index);
  for (const start of starts) {
    for (const end of ends.filter(index => index > start)) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Continue until the complete JSON array is isolated from Wrangler output.
      }
    }
  }
  throw new Error("Wrangler did not return a readable D1 database list.");
}

export function findSidebandDatabase(databases) {
  return databases.find(item => item?.name === "sideband") || null;
}

export function updateWranglerDatabaseId(configText, databaseId) {
  if (!isConfiguredDatabaseIdentifier(databaseId)) {
    throw new Error(`Refusing to write an invalid D1 database identifier: ${databaseId || "missing"}`);
  }
  const config = JSON.parse(configText);
  const binding = findDatabaseBinding(config);
  if (!binding) throw new Error("The DB binding is missing from wrangler.jsonc.");
  binding.database_id = databaseId;
  return `${JSON.stringify(config, null, 2)}\n`;
}
