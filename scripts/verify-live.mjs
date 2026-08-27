const configuredBase = String(process.env.SIDEBAND_PUBLIC_URL || "https://greenshoegarage.com/radio/");
const base = `${configuredBase.replace(/\/+$/, "")}/`;
const healthUrl = new URL("api/health/public", base);
let lastError;

for (let attempt = 1; attempt <= 6; attempt += 1) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10000) });
    const payload = await response.json();
    if (!response.ok || payload.status !== "available") throw new Error(`Health response was ${response.status}.`);
    console.log(`SIDEBAND ${payload.version} is available at ${base}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 6) await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

console.error(`Deployment completed, but the public health check failed: ${lastError?.message || lastError}`);
console.error(`Check the Worker route and open ${healthUrl}`);
process.exit(1);
