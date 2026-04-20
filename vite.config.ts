import { loadEnv, type Plugin, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

function buildEarnUrl(rawUrl = "") {
  const incomingUrl = new URL(rawUrl, "http://localhost");
  const params = new URLSearchParams();

  for (const [key, value] of incomingUrl.searchParams.entries()) {
    if (ALLOWED_PARAMS.has(key) && value.trim()) {
      params.set(key, value);
    }
  }

  if (!params.has("limit")) {
    params.set("limit", "50");
  }

  return `${EARN_VAULTS_URL}?${params}`;
}

function lifiEarnDevProxy(apiKey: string | undefined, integrator: string): Plugin {
  return {
    name: "lifi-earn-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/api/lifi/vaults", async (request, response) => {
        if (!apiKey) {
          response.statusCode = 500;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ message: "LI.FI API key is not configured." }));
          return;
        }

        try {
          const earnResponse = await fetch(buildEarnUrl(request.url), {
            headers: {
              "x-lifi-api-key": apiKey,
              "x-lifi-integrator": integrator,
            },
          });
          const text = await earnResponse.text();
          response.statusCode = earnResponse.status;
          response.setHeader("content-type", earnResponse.headers.get("content-type") ?? "application/json");
          response.end(text);
        } catch {
          response.statusCode = 502;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ message: "Could not reach LI.FI Earn." }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), lifiEarnDevProxy(env.LIFI_API_KEY, env.LIFI_INTEGRATOR || "Clarityiota")],
  };
})
