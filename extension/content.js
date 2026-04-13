(async function clarityAaveInsight() {
  if (!window.location.hostname.includes("app.aave.com")) {
    return;
  }
  if (sessionStorage.getItem("clarity_insight_dismissed") === "1") {
    return;
  }
  if (document.getElementById("clarity-insight-host")) {
    return;
  }

  const DASHBOARD_URL = "http://localhost:5173";
  const CLARITY_API_BASE = "http://localhost:5173";

  function detectToken() {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("underlyingAsset") || params.get("asset") || params.get("token");
    if (!tokenParam) {
      return "USDC";
    }
    if (tokenParam.startsWith("0x")) {
      return "USDC";
    }
    return tokenParam.toUpperCase();
  }

  function titleCase(slug) {
    return String(slug)
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  async function fetchFromClarityApi(token) {
    const url = `${CLARITY_API_BASE}/api/extension/best-rate?token=${encodeURIComponent(token)}&protocol=aave-v3`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Clarity API failed with ${response.status}`);
    }
    return response.json();
  }

  async function fallbackFromLlama(token) {
    const response = await fetch("https://yields.llama.fi/pools");
    if (!response.ok) {
      throw new Error(`Llama pools failed with ${response.status}`);
    }
    const payload = await response.json();
    const pools = Array.isArray(payload.data) ? payload.data : [];
    const normalizedToken = token.toUpperCase();
    const matching = pools.filter(
      (pool) =>
        String(pool.symbol || "").toUpperCase() === normalizedToken && String(pool.chain || "").toLowerCase() !== "",
    );
    const aave = matching.find((pool) => pool.project === "aave-v3");
    const alternatives = matching
      .filter((pool) => pool.project !== "aave-v3" && Number.isFinite(pool.apy))
      .sort((a, b) => (b.apy || 0) - (a.apy || 0));

    if (!aave || alternatives.length === 0) {
      return null;
    }

    const better = alternatives[0];
    const delta = (better.apy || 0) - (aave.apy || 0);
    if (delta <= 0.15) {
      return null;
    }

    return {
      currentProtocol: "Aave",
      currentRate: Number(aave.apy || 0),
      betterProtocol: titleCase(better.project),
      betterRate: Number(better.apy || 0),
      delta: Number(delta),
      token,
    };
  }

  async function resolveInsight(token) {
    try {
      const fromApi = await fetchFromClarityApi(token);
      if (fromApi && fromApi.delta > 0) {
        return {
          currentProtocol: fromApi.currentProtocol || "Aave",
          currentRate: Number(fromApi.currentRate || 0),
          betterProtocol: fromApi.betterProtocol,
          betterRate: Number(fromApi.betterRate || 0),
          delta: Number(fromApi.delta || 0),
          token,
        };
      }
    } catch (_) {
      // Continue to fallback.
    }
    return fallbackFromLlama(token);
  }

  const token = detectToken();
  const insight = await resolveInsight(token);
  if (!insight) {
    return;
  }

  const host = document.createElement("div");
  host.id = "clarity-insight-host";
  host.style.position = "fixed";
  host.style.bottom = "20px";
  host.style.right = "20px";
  host.style.zIndex = "2147483647";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    * {
      box-sizing: border-box;
      font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .trigger {
      border: 1px solid #d7d1c7;
      border-radius: 8px;
      background: #ffffff;
      color: #1c1917;
      padding: 10px 12px;
      width: 300px;
      box-shadow: 0 8px 24px rgba(28, 25, 23, 0.16);
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      text-align: left;
    }
    .panel {
      margin-top: 10px;
      border: 1px solid #e5ddd5;
      border-radius: 8px;
      background: #fffdf9;
      width: 340px;
      box-shadow: 0 10px 28px rgba(28, 25, 23, 0.2);
      padding: 14px;
      display: none;
    }
    .panel.open {
      display: block;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6b6560;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #1a2e1f;
      display: inline-block;
      margin-right: 8px;
    }
    .close {
      border: none;
      background: transparent;
      cursor: pointer;
      color: #6b6560;
      font-size: 14px;
      padding: 0;
      line-height: 1;
    }
    .line {
      margin: 0 0 8px;
      color: #1c1917;
      font-size: 14px;
    }
    .delta {
      font-size: 24px;
      color: #166534;
      font-weight: 700;
      margin: 8px 0 2px;
    }
    .cta {
      margin-top: 10px;
      display: block;
      border: none;
      background: #c4764a;
      color: white;
      width: 100%;
      text-align: center;
      border-radius: 8px;
      padding: 10px;
      text-decoration: none;
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 700;
    }
    .cta:hover {
      background: #a85e38;
    }
  `;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <button class="trigger">Clarity found a better rate for ${insight.token} ↗</button>
    <div class="panel">
      <div class="header">
        <span><span class="dot"></span>Clarity Insight</span>
        <button class="close">×</button>
      </div>
      <p class="line">You're viewing ${insight.currentProtocol} ${insight.token} (${insight.currentRate.toFixed(2)}%).</p>
      <p class="delta">+${insight.delta.toFixed(2)}% higher</p>
      <p class="line">for your risk level on ${insight.betterProtocol}.</p>
      <a class="cta" target="_blank" rel="noreferrer">View Comparison</a>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(wrapper);

  const trigger = wrapper.querySelector(".trigger");
  const panel = wrapper.querySelector(".panel");
  const close = wrapper.querySelector(".close");
  const cta = wrapper.querySelector(".cta");

  if (cta) {
    const compareUrl = `${DASHBOARD_URL}/?token=${encodeURIComponent(insight.token)}&from=aave&better=${encodeURIComponent(
      insight.betterProtocol,
    )}`;
    cta.setAttribute("href", compareUrl);
  }

  if (trigger && panel) {
    trigger.addEventListener("click", () => {
      panel.classList.toggle("open");
    });
  }

  if (close) {
    close.addEventListener("click", () => {
      sessionStorage.setItem("clarity_insight_dismissed", "1");
      host.remove();
    });
  }
})();
