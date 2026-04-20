import protocolMappingJson from "./protocol-mapping.json";
import protocolMetaJson from "./protocols.json";

const LIFI_VAULTS_ENDPOINT = "/api/lifi/vaults";
const LLAMA_CHART_ENDPOINT = "https://yields.llama.fi/chart";
const LIFI_PAGE_SIZE = 50;

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
  weight?: number;
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
    logoUri?: string;
    url: string;
  };
  tags: string[];
  underlyingTokens: LifiToken[];
  analytics: {
    apy: {
      base: number | null;
      reward: number | null;
      total: number | null;
    };
    apy1d?: number | null;
    apy7d?: number | null;
    apy30d?: number | null;
    tvl: {
      usd: string;
      native?: string;
    };
    updatedAt?: string;
  };
  timeLock?: number | null;
  syncedAt?: string;
  depositPacks?: Array<{ name: string; stepsType: string }>;
  redeemPacks?: Array<{ name: string; stepsType: string }>;
  isTransactional: boolean;
  isRedeemable: boolean;
}

interface LifiVaultResponse {
  data: LifiVault[];
  nextCursor?: string | null;
  total?: number;
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
  protocolLogoPath: string | null;
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
  nextCursor: string | null;
  totalVaults: number | null;
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
const protocolLogoBySlug: Record<string, string> = {
  "aave-v3": "/AAVE.png",
  "ether.fi-stake": "/ETHER.webp",
  "ethena-usde": "/ethena.svg",
  "euler-v2": "/EULER.png",
  maple: "/MAPLE.svg",
  "morpho-v1": "/MORPHO.svg",
  neverland: "/NEVERLAND.svg",
  pendle: "/PENDLE.svg",
  upshift: "/upshift.svg",
  "yo-protocol": "/YO.png",
};
const protocolSlugAliases: Record<string, string> = {
  aave: "aave-v3",
  "aave v3": "aave-v3",
  "ether.fi": "ether.fi-stake",
  etherfi: "ether.fi-stake",
  ethena: "ethena-usde",
  euler: "euler-v2",
  maple: "maple",
  morpho: "morpho-v1",
  neverland: "neverland",
  pendle: "pendle",
  upshift: "upshift",
  "yo protocol": "yo-protocol",
};

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

function resolveLockCategory(vault: LifiVault): { category: LockCategory; label: string } {
  const lockSeconds = asNumber(vault.timeLock, 0);
  if (lockSeconds > 0) {
    const lockDays = lockSeconds / 86400;
    if (lockDays <= 7) {
      return { category: "up_to_7_days", label: "Up to 7 days" };
    }
    if (lockDays <= 30) {
      return { category: "up_to_30_days", label: "Up to 30 days" };
    }
    return { category: "thirty_plus_days", label: "Locked for 30+ days" };
  }
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
    { monthlyUSD: 5, label: "a small app subscription" },
    { monthlyUSD: 12, label: "a streaming plan" },
    { monthlyUSD: 25, label: "a useful AI or design tool" },
    { monthlyUSD: 50, label: "a weekly grocery top-up" },
    { monthlyUSD: 100, label: "a utility bill" },
    { monthlyUSD: 180, label: "a stack of SaaS subscriptions" },
    { monthlyUSD: 350, label: "a coworking desk" },
    { monthlyUSD: 700, label: "a rent-sized monthly offset" },
  ];

  const closest = [...equivalents].sort(
    (a, b) => Math.abs(a.monthlyUSD - monthlyUSD) - Math.abs(b.monthlyUSD - monthlyUSD),
  )[0];

  return `On $${principal.toLocaleString()} that's ~$${Math.round(yearlyUSD)}/year — about ${closest.label} every month`;
}

function normalizeApy(value: unknown): number {
  return asNumber(value, 0);
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
  meta: ProtocolMeta,
): APYBreakdown {
  const base = normalizeApy(vault.analytics.apy.base);
  const incentive = normalizeApy(vault.analytics.apy.reward);
  const boost = asNumber(meta.apyBoostAmount, 0);
  const reportedTotal = normalizeApy(vault.analytics.apy.total);
  const total = Math.max(reportedTotal || base + incentive + boost, 0);
  const incentiveEndDate = meta.incentiveEndDate ?? null;

  return {
    base,
    incentive,
    incentiveEndDate,
    incentiveToken: null,
    incentiveTokenIsVolatile: false,
    boost,
    boostRequires: meta.apyBoostRequires ?? null,
    total,
    isClean: incentive <= 0 && boost <= 0,
    ilRisk: vault.tags.some((tag) => /lp|pool/i.test(tag)),
    ilAmount: null,
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

function tvlTrendLabel(tvlUsd: number): string {
  if (!tvlUsd) {
    return "TVL trend unavailable";
  }
  if (tvlUsd > 1_000_000_000) {
    return "Large deposit base";
  }
  if (tvlUsd > 100_000_000) {
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
  const normalizedName = vault.protocol.name.toLowerCase();
  const mapping = protocolMapping[vault.protocol.name] ?? protocolMapping[normalizedName];
  return mapping?.llamaProtocolSlug ?? protocolSlugAliases[normalizedName] ?? normalizedName;
}

function protocolLogoPath(slug: string): string | null {
  return protocolLogoBySlug[slug] ?? null;
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

function buildVaults(vaultPayload: LifiVaultResponse, warnings: string[]): ClarityVault[] {
  const transactionalVaults = vaultPayload.data.filter((vault) => vault.isTransactional);

  return transactionalVaults.map((vault) => {
    const mappedProtocolSlug = protocolSlugFrom(vault);
    const meta = protocolMeta[mappedProtocolSlug] ?? protocolMeta[vault.protocol.name] ?? {};
    const launchDate = vault.syncedAt ? new Date(vault.syncedAt).getTime() : null;
    const lock = resolveLockCategory(vault);
    const breakdown = buildAPYBreakdown(vault, meta);
    const tvlUsd = asNumber(vault.analytics.tvl.usd, 0);
    const safety = computeSafetyRating({
      launchDate,
      auditCount: asNumber(meta.auditCount, 0),
      exploitHistory: meta.exploitHistory ?? "unknown",
      tvlUsd,
      apyCurrent: breakdown.total,
      apyMean30d: normalizeApy(vault.analytics.apy30d) || breakdown.total,
      lockCategory: lock.category,
      meta,
    });

    const symbol = vault.underlyingTokens[0]?.symbol ?? "TOKEN";
    const launchInfo = launchYearLabel(launchDate);
    const name = buildVaultName(symbol, safety.label);
    const incentiveEndDateLabel = formatDateLabel(breakdown.incentiveEndDate);
    if (!incentiveEndDateLabel && breakdown.incentive > 0) {
      warnings.push(`Incentive end date unavailable for ${vault.protocol.name} ${symbol}.`);
    }

    return {
      id: vault.slug,
      slug: vault.slug,
      chain: vault.network,
      tokenSymbol: symbol.toUpperCase(),
      protocolSlug: mappedProtocolSlug,
      protocolDisplayName: meta.displayName ?? vault.protocol.name,
      protocolUrl: vault.protocol.url,
      protocolLogoPath: protocolLogoPath(mappedProtocolSlug),
      plainEnglishName: name,
      tradfiAnalogy: meta.tradfiAnalogy ?? "Like a savings product with market-linked returns",
      lockCategory: lock.category,
      lockLabel: lock.label,
      launchDate,
      launchYearLabel: launchInfo.label,
      yearsLive: launchInfo.yearsLive,
      tvlUsd,
      tvlTrendLabel: tvlTrendLabel(tvlUsd),
      depositUrl: vault.protocol.url,
      llamaPoolId: null,
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
}

export async function fetchClaritySnapshot(cursor?: string | null): Promise<ClaritySnapshot> {
  const warnings: string[] = [];
  const params = new URLSearchParams({
    limit: String(LIFI_PAGE_SIZE),
    sortBy: "tvl",
  });
  if (cursor) {
    params.set("cursor", cursor);
  }

  const vaultsResp = await fetch(`${LIFI_VAULTS_ENDPOINT}?${params}`);

  if (!vaultsResp.ok) {
    throw new Error(`LI.FI vault request failed with status ${vaultsResp.status}`);
  }

  const vaultPayload = (await vaultsResp.json()) as LifiVaultResponse;
  const transactionalVaults = vaultPayload.data.filter((vault) => vault.isTransactional);
  const latestSyncISO = transactionalVaults
    .map((vault) => vault.analytics.updatedAt ?? vault.syncedAt ?? null)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    vaults: buildVaults(vaultPayload, warnings),
    fetchedAt: Date.now(),
    latestSyncISO,
    warnings: [...new Set(warnings)],
    nextCursor: vaultPayload.nextCursor ?? null,
    totalVaults: vaultPayload.total ?? null,
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
