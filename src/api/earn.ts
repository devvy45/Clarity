import protocolMappingJson from "./protocol-mapping.json";
import protocolMetaJson from "./protocols.json";

const LIFI_VAULTS_ENDPOINT = "https://earn.li.fi/v1/earn/vaults";
const LLAMA_POOLS_ENDPOINT = "https://yields.llama.fi/pools";
const LLAMA_PROTOCOLS_ENDPOINT = "https://api.llama.fi/protocols";
const LLAMA_CHART_ENDPOINT = "https://yields.llama.fi/chart";
const LIFI_INTEGRATOR = "clarity-mullet-hack";

const STABLE_TOKENS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "FRAX",
  "USDE",
  "USDS",
  "USD0",
  "TUSD",
]);

const RISK_WEIGHTS = {
  age: 0.2,
  audit: 0.25,
  exploit: 0.25,
  tvl: 0.1,
  stability: 0.1,
  liquidity: 0.1,
} as const;

export type RiskTier = "low" | "moderate" | "high";
export type RiskLabel = "Low Risk" | "Moderate Risk" | "High Risk";
export type LockCategory =
  | "withdraw_anytime"
  | "up_to_7_days"
  | "up_to_30_days"
  | "thirty_plus_days";
export type APYType = "base_only" | "includes_incentives" | "boost_available";

interface LifiToken {
  symbol: string;
  address: string;
  decimals: number;
}

interface LifiVault {
  address: string;
  network: string;
  chainId: number;
  slug: string;
  name: string;
  description?: string;
  protocol: {
    name: string;
    url: string;
  };
  tags: string[];
  underlyingTokens: LifiToken[];
  analytics: {
    apy: {
      base: number;
      reward: number | null;
      total: number;
    };
    apy1d?: number | null;
    apy7d?: number | null;
    apy30d?: number | null;
    tvl: {
      usd: string;
    };
    updatedAt?: string;
  };
  depositPacks?: Array<{ name: string; stepsType: string }>;
  redeemPacks?: Array<{ name: string; stepsType: string }>;
  isTransactional: boolean;
  isRedeemable: boolean;
}

interface LifiVaultResponse {
  data: LifiVault[];
}

interface LlamaPool {
  chain: string;
  project: string;
  symbol: string;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyMean30d: number | null;
  il7d: number | null;
  ilRisk: string | null;
  tvlUsd: number | null;
  rewardTokens: string[] | null;
  pool: string;
}

interface LlamaPoolResponse {
  data: LlamaPool[];
}

interface LlamaProtocol {
  slug: string;
  name: string;
  listedAt?: number;
  tvl?: number;
}

interface ProtocolMapping {
  llamaProject: string;
  llamaProtocolSlug: string;
}

interface ProtocolMeta {
  displayName?: string;
  auditCount?: number;
  auditors?: string[];
  exploitHistory?: "clean" | "incident" | "unknown";
  contractUpgradeable?: boolean;
  bugBounty?: boolean;
  tradfiAnalogy?: string;
  apyBoostAmount?: number;
  apyBoostRequires?: string | null;
  incentiveEndDate?: string | null;
  safetyNoteLow?: string;
  safetyNoteModerate?: string;
  safetyNoteHigh?: string;
}

export interface APYBreakdown {
  base: number;
  incentive: number;
  incentiveEndDate: string | null;
  incentiveToken: string | null;
  incentiveTokenIsVolatile: boolean;
  boost: number;
  boostRequires: string | null;
  total: number;
  isClean: boolean;
  ilRisk: boolean;
  ilAmount: number | null;
}

export interface SafetyRating {
  score: number;
  tier: RiskTier;
  label: RiskLabel;
  note: string;
  breakdown: {
    ageScore: number;
    auditScore: number;
    exploitScore: number;
    tvlScore: number;
    stabilityScore: number;
    liquidityScore: number;
  };
}

export interface ChartPoint {
  timestamp: string;
  apy: number;
  tvlUsd: number;
}

export interface ClarityVault {
  id: string;
  slug: string;
  chain: string;
  tokenSymbol: string;
  protocolSlug: string;
  protocolDisplayName: string;
  protocolUrl: string;
  plainEnglishName: string;
  tradfiAnalogy: string;
  lockCategory: LockCategory;
  lockLabel: string;
  launchDate: number | null;
  launchYearLabel: string;
  yearsLive: number;
  tvlUsd: number;
  tvlTrendLabel: string;
  depositUrl: string;
  llamaPoolId: string | null;
  headlineAPY: number;
  apyBreakdown: APYBreakdown;
  safetyRating: SafetyRating;
  realMoneyLabel: string;
  auditCount: number;
  auditors: string[];
  exploitHistory: "clean" | "incident" | "unknown";
  contractUpgradeable: boolean;
  bugBounty: boolean;
  rewardTokenWarning: string | null;
  apyType: APYType;
}

export interface ClaritySnapshot {
  vaults: ClarityVault[];
  fetchedAt: number;
  latestSyncISO: string | null;
  warnings: string[];
}

interface LlamaChartResponse {
  data: Array<{
    timestamp: string;
    apy: number | null;
    tvlUsd: number | null;
  }>;
}

const protocolMapping = protocolMappingJson as Record<string, ProtocolMapping>;
const protocolMeta = protocolMetaJson as Record<string, ProtocolMeta>;
const chartCache = new Map<string, ChartPoint[]>();

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function normalizeChain(chain: string): string {
  return chain.replace(/\s+/g, "").toLowerCase();
}

function resolveLockCategory(vault: LifiVault): { category: LockCategory; label: string } {
  if (vault.isRedeemable) {
    return { category: "withdraw_anytime", label: "Withdraw anytime" };
  }
  return { category: "thirty_plus_days", label: "Locked for 30+ days" };
}

function formatDateLabel(dateISO: string | null): string | null {
  if (!dateISO) {
    return null;
  }
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function buildRealMoneyLabel(principal: number, apyBreakdown: APYBreakdown): string {
  const yearlyUSD = principal * (apyBreakdown.base / 100);
  const monthlyUSD = yearlyUSD / 12;
  const equivalents = [
    { monthlyUSD: 8, label: "a streaming subscription" },
    { monthlyUSD: 15, label: "your monthly streaming bundle" },
    { monthlyUSD: 50, label: "a week of groceries" },
    { monthlyUSD: 100, label: "your electricity bill" },
    { monthlyUSD: 200, label: "a short domestic flight" },
    { monthlyUSD: 500, label: "a month of rent in a tier-2 city" },
  ];

  const closest = [...equivalents].sort(
    (a, b) => Math.abs(a.monthlyUSD - monthlyUSD) - Math.abs(b.monthlyUSD - monthlyUSD),
  )[0];

  return `On $${principal.toLocaleString()} that's ~$${Math.round(yearlyUSD)}/year — about ${closest.label} every month`;
}

function riskLabelFromTier(tier: RiskTier): RiskLabel {
  if (tier === "low") {
    return "Low Risk";
  }
  if (tier === "moderate") {
    return "Moderate Risk";
  }
  return "High Risk";
}

function resolveSafetyNote(meta: ProtocolMeta, tier: RiskTier): string {
  if (tier === "low") {
    return meta.safetyNoteLow ?? "Longer track record and stronger safety indicators.";
  }
  if (tier === "moderate") {
    return meta.safetyNoteModerate ?? "Reasonable balance of return potential and operational risk.";
  }
  return meta.safetyNoteHigh ?? "Higher uncertainty and larger downside if conditions change.";
}

function buildAPYBreakdown(
  vault: LifiVault,
  pool: LlamaPool | null,
  meta: ProtocolMeta,
): APYBreakdown {
  const base = asNumber(pool?.apyBase, asNumber(vault.analytics.apy.base, 0));
  const incentive = asNumber(pool?.apyReward, asNumber(vault.analytics.apy.reward, 0));
  const boost = asNumber(meta.apyBoostAmount, 0);
  const total = Math.max(base + incentive + boost, 0);
  const incentiveEndDate = meta.incentiveEndDate ?? null;

  const rewardTokens = pool?.rewardTokens ?? [];
  const incentiveToken = rewardTokens.length > 0 && !rewardTokens[0].startsWith("0x")
    ? rewardTokens[0]
    : null;
  const incentiveTokenIsVolatile = Boolean(
    incentiveToken && !STABLE_TOKENS.has(incentiveToken.toUpperCase()),
  );

  const ilAmount = pool?.il7d ?? null;
  const ilRisk = Boolean((pool?.ilRisk && pool.ilRisk !== "no") || (ilAmount !== null && ilAmount !== 0));

  return {
    base,
    incentive,
    incentiveEndDate,
    incentiveToken,
    incentiveTokenIsVolatile,
    boost,
    boostRequires: meta.apyBoostRequires ?? null,
    total,
    isClean: incentive <= 0 && boost <= 0,
    ilRisk,
    ilAmount,
  };
}

function scoreTVL(value: number): number {
  if (value > 1_000_000_000) {
    return 1;
  }
  if (value > 100_000_000) {
    return 0.8;
  }
  if (value > 10_000_000) {
    return 0.65;
  }
  if (value > 1_000_000) {
    return 0.5;
  }
  return 0.35;
}

function computeSafetyRating(params: {
  launchDate: number | null;
  auditCount: number;
  exploitHistory: "clean" | "incident" | "unknown";
  tvlUsd: number;
  apyCurrent: number;
  apyMean30d: number;
  lockCategory: LockCategory;
  meta: ProtocolMeta;
}): SafetyRating {
  const now = Date.now();
  const ageDays = params.launchDate ? Math.max((now - params.launchDate) / 86_400_000, 0) : 0;
  const ageScore = params.launchDate ? Math.min(ageDays / 1095, 1) : 0.45;
  const auditScore = Math.min(params.auditCount / 6, 1);
  const exploitScore = params.exploitHistory === "clean" ? 1 : params.exploitHistory === "incident" ? 0.3 : 0.6;
  const tvlScore = scoreTVL(params.tvlUsd);
  const baseline = params.apyMean30d === 0 ? 1 : Math.abs(params.apyMean30d);
  const apyDelta = Math.abs(params.apyCurrent - params.apyMean30d) / baseline;
  const stabilityScore = 1 - Math.min(apyDelta, 1);
  const liquidityScore = params.lockCategory === "withdraw_anytime" ? 1 : 0.6;

  const rawScore =
    ageScore * RISK_WEIGHTS.age +
    auditScore * RISK_WEIGHTS.audit +
    exploitScore * RISK_WEIGHTS.exploit +
    tvlScore * RISK_WEIGHTS.tvl +
    stabilityScore * RISK_WEIGHTS.stability +
    liquidityScore * RISK_WEIGHTS.liquidity;

  const tier: RiskTier = rawScore >= 0.75 ? "low" : rawScore >= 0.5 ? "moderate" : "high";
  const score = Number((rawScore * 10).toFixed(1));

  return {
    score,
    tier,
    label: riskLabelFromTier(tier),
    note: resolveSafetyNote(params.meta, tier),
    breakdown: {
      ageScore: Number(ageScore.toFixed(3)),
      auditScore: Number(auditScore.toFixed(3)),
      exploitScore: Number(exploitScore.toFixed(3)),
      tvlScore: Number(tvlScore.toFixed(3)),
      stabilityScore: Number(stabilityScore.toFixed(3)),
      liquidityScore: Number(liquidityScore.toFixed(3)),
    },
  };
}

function resolveAPYType(breakdown: APYBreakdown): APYType {
  if (breakdown.boost > 0 || breakdown.boostRequires) {
    return "boost_available";
  }
  if (breakdown.incentive > 0) {
    return "includes_incentives";
  }
  return "base_only";
}

function matchLlamaPool(vault: LifiVault, poolsByProject: Map<string, LlamaPool[]>) {
  const mapping = protocolMapping[vault.protocol.name];
  const project = mapping?.llamaProject ?? vault.protocol.name;
  const candidates = poolsByProject.get(project) ?? [];
  if (candidates.length === 0) {
    return null;
  }

  const tokenSymbol = normalizeSymbol(vault.underlyingTokens[0]?.symbol ?? vault.name);
  const chainName = normalizeChain(vault.network);

  const ranked = [...candidates].sort((a, b) => {
    const aChainScore = normalizeChain(a.chain) === chainName ? 2 : 0;
    const bChainScore = normalizeChain(b.chain) === chainName ? 2 : 0;
    const aSymbolScore = normalizeSymbol(a.symbol) === tokenSymbol ? 2 : 0;
    const bSymbolScore = normalizeSymbol(b.symbol) === tokenSymbol ? 2 : 0;
    const aDiff = Math.abs(asNumber(a.apy, 0) - asNumber(vault.analytics.apy.total, 0));
    const bDiff = Math.abs(asNumber(b.apy, 0) - asNumber(vault.analytics.apy.total, 0));
    const aScore = aChainScore + aSymbolScore;
    const bScore = bChainScore + bSymbolScore;
    if (aScore !== bScore) {
      return bScore - aScore;
    }
    if (aDiff !== bDiff) {
      return aDiff - bDiff;
    }
    return asNumber(b.tvlUsd, 0) - asNumber(a.tvlUsd, 0);
  });

  return ranked[0];
}

function buildVaultName(symbol: string, tierLabel: RiskLabel): string {
  if (STABLE_TOKENS.has(symbol.toUpperCase())) {
    return `${symbol.toUpperCase()} Savings — ${tierLabel}`;
  }
  if (symbol.toUpperCase().includes("ETH")) {
    return `ETH Income Option — ${tierLabel}`;
  }
  return `${symbol.toUpperCase()} Yield Option — ${tierLabel}`;
}

function launchYearLabel(launchDate: number | null): { label: string; yearsLive: number } {
  if (!launchDate) {
    return { label: "Live date unavailable", yearsLive: 0 };
  }
  const date = new Date(launchDate);
  const yearsLive = Math.max((Date.now() - launchDate) / (365 * 86_400_000), 0);
  return {
    label: `Live since ${date.getUTCFullYear()}`,
    yearsLive,
  };
}

function tvlTrendLabel(pool: LlamaPool | null): string {
  if (!pool?.tvlUsd) {
    return "TVL trend unavailable";
  }
  if (pool.tvlUsd > 1_000_000_000) {
    return "Large deposit base";
  }
  if (pool.tvlUsd > 100_000_000) {
    return "Healthy deposit base";
  }
  return "Smaller deposit base";
}

function rewardWarningLabel(breakdown: APYBreakdown): string | null {
  if (breakdown.incentive <= 0) {
    return null;
  }
  if (breakdown.incentiveToken && breakdown.incentiveTokenIsVolatile) {
    return `Rewards paid in ${breakdown.incentiveToken}`;
  }
  return "Includes bonus rewards";
}

function protocolSlugFrom(vault: LifiVault): string {
  const mapping = protocolMapping[vault.protocol.name];
  return mapping?.llamaProtocolSlug ?? vault.protocol.name;
}

export function getLockCategoryLabel(category: LockCategory): string {
  if (category === "withdraw_anytime") {
    return "Withdraw Anytime";
  }
  if (category === "up_to_7_days") {
    return "Up to 7 days";
  }
  if (category === "up_to_30_days") {
    return "Up to 30 days";
  }
  return "30+ days";
}

export async function fetchClaritySnapshot(): Promise<ClaritySnapshot> {
  const warnings: string[] = [];
  const [vaultsResp, poolsResp, protocolsResp] = await Promise.all([
    fetch(LIFI_VAULTS_ENDPOINT, { headers: { "x-lifi-integrator": LIFI_INTEGRATOR } }),
    fetch(LLAMA_POOLS_ENDPOINT),
    fetch(LLAMA_PROTOCOLS_ENDPOINT),
  ]);

  if (!vaultsResp.ok) {
    throw new Error(`LI.FI vault request failed with status ${vaultsResp.status}`);
  }
  if (!poolsResp.ok) {
    throw new Error(`DeFiLlama pools request failed with status ${poolsResp.status}`);
  }
  if (!protocolsResp.ok) {
    throw new Error(`DeFiLlama protocols request failed with status ${protocolsResp.status}`);
  }

  const vaultPayload = (await vaultsResp.json()) as LifiVaultResponse;
  const poolsPayload = (await poolsResp.json()) as LlamaPoolResponse;
  const protocolsPayload = (await protocolsResp.json()) as LlamaProtocol[];

  const poolsByProject = new Map<string, LlamaPool[]>();
  for (const pool of poolsPayload.data) {
    const list = poolsByProject.get(pool.project) ?? [];
    list.push(pool);
    poolsByProject.set(pool.project, list);
  }

  const protocolsBySlug = new Map<string, LlamaProtocol>();
  for (const protocol of protocolsPayload) {
    protocolsBySlug.set(protocol.slug, protocol);
  }

  const transactionalVaults = vaultPayload.data.filter((vault) => vault.isTransactional);
  const latestSyncISO = transactionalVaults
    .map((vault) => vault.analytics.updatedAt ?? null)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const vaults: ClarityVault[] = transactionalVaults.map((vault) => {
    const mappedProtocolSlug = protocolSlugFrom(vault);
    const meta = protocolMeta[mappedProtocolSlug] ?? protocolMeta[vault.protocol.name] ?? {};
    const llamaProtocol = protocolsBySlug.get(mappedProtocolSlug);
    const launchDate = llamaProtocol?.listedAt ? llamaProtocol.listedAt * 1000 : null;
    const matchedPool = matchLlamaPool(vault, poolsByProject);
    const lock = resolveLockCategory(vault);
    const breakdown = buildAPYBreakdown(vault, matchedPool, meta);
    const safety = computeSafetyRating({
      launchDate,
      auditCount: asNumber(meta.auditCount, 0),
      exploitHistory: meta.exploitHistory ?? "unknown",
      tvlUsd: asNumber(matchedPool?.tvlUsd, asNumber(vault.analytics.tvl.usd, 0)),
      apyCurrent: breakdown.total,
      apyMean30d: asNumber(matchedPool?.apyMean30d, breakdown.total),
      lockCategory: lock.category,
      meta,
    });

    const symbol = vault.underlyingTokens[0]?.symbol ?? "TOKEN";
    const launchInfo = launchYearLabel(launchDate);
    const name = buildVaultName(symbol, safety.label);
    const incentiveEndDateLabel = formatDateLabel(breakdown.incentiveEndDate);
    if (!incentiveEndDateLabel && breakdown.incentive > 0) {
      warnings.push(
        `Incentive end date unavailable for ${vault.protocol.name} ${symbol}. DeFiLlama emission endpoint is paid.`,
      );
    }

    return {
      id: vault.slug,
      slug: vault.slug,
      chain: vault.network,
      tokenSymbol: symbol.toUpperCase(),
      protocolSlug: mappedProtocolSlug,
      protocolDisplayName: meta.displayName ?? vault.protocol.name,
      protocolUrl: vault.protocol.url,
      plainEnglishName: name,
      tradfiAnalogy: meta.tradfiAnalogy ?? "Like a savings product with market-linked returns",
      lockCategory: lock.category,
      lockLabel: lock.label,
      launchDate,
      launchYearLabel: launchInfo.label,
      yearsLive: launchInfo.yearsLive,
      tvlUsd: asNumber(matchedPool?.tvlUsd, asNumber(vault.analytics.tvl.usd, 0)),
      tvlTrendLabel: tvlTrendLabel(matchedPool),
      depositUrl: vault.protocol.url,
      llamaPoolId: matchedPool?.pool ?? null,
      headlineAPY: breakdown.total,
      apyBreakdown: breakdown,
      safetyRating: safety,
      realMoneyLabel: buildRealMoneyLabel(1000, breakdown),
      auditCount: asNumber(meta.auditCount, 0),
      auditors: meta.auditors ?? [],
      exploitHistory: meta.exploitHistory ?? "unknown",
      contractUpgradeable: Boolean(meta.contractUpgradeable),
      bugBounty: Boolean(meta.bugBounty),
      rewardTokenWarning: rewardWarningLabel(breakdown),
      apyType: resolveAPYType(breakdown),
    };
  });

  return {
    vaults,
    fetchedAt: Date.now(),
    latestSyncISO,
    warnings: [...new Set(warnings)],
  };
}

export async function fetchVaultChart(poolId: string): Promise<ChartPoint[]> {
  if (chartCache.has(poolId)) {
    return chartCache.get(poolId) ?? [];
  }

  const response = await fetch(`${LLAMA_CHART_ENDPOINT}/${poolId}`);
  if (!response.ok) {
    throw new Error(`Chart request failed for pool ${poolId}`);
  }

  const payload = (await response.json()) as LlamaChartResponse;
  const points = payload.data
    .map((point) => ({
      timestamp: point.timestamp,
      apy: asNumber(point.apy, 0),
      tvlUsd: asNumber(point.tvlUsd, 0),
    }))
    .slice(-30);

  chartCache.set(poolId, points);
  return points;
}
