const EARN_VAULTS_URL = "https://earn.li.fi/v1/vaults";
const ALLOWED_PARAMS = new Set([
  "asset",
  "chainId",
  "cursor",
  "limit",
  "minTvlUsd",
  "protocol",
  "sortBy",
  "sortDirection",
  "tags",
]);

function buildEarnUrl(query) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (!ALLOWED_PARAMS.has(key)) {
      continue;
    }
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (typeof firstValue === "string" && firstValue.trim()) {
      params.set(key, firstValue);
    }
  }

  if (!params.has("limit")) {
    params.set("limit", "50");
  }

  return `${EARN_VAULTS_URL}?${params}`;
}

export default async function handler(request, response) {
  const apiKey = process.env.LIFI_API_KEY;

  if (!apiKey) {
    response.status(500).json({ message: "LI.FI API key is not configured." });
    return;
  }

  try {
    const earnResponse = await fetch(buildEarnUrl(request.query), {
      headers: {
        "x-lifi-api-key": apiKey,
        "x-lifi-integrator": process.env.LIFI_INTEGRATOR ?? "Clarityiota",
      },
    });

    const text = await earnResponse.text();
    response.status(earnResponse.status);
    response.setHeader("content-type", earnResponse.headers.get("content-type") ?? "application/json");
    response.setHeader("cache-control", "s-maxage=60, stale-while-revalidate=240");
    response.send(text);
  } catch {
    response.status(502).json({ message: "Could not reach LI.FI Earn." });
  }
}
