import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronUp, ExternalLink, Info } from "lucide-react";
import { fetchVaultChart, type ChartPoint, type ClarityVault } from "../api/earn";

interface VaultCardProps {
  vault: ClarityVault;
  index: number;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function riskStyle(tier: ClarityVault["safetyRating"]["tier"]) {
  if (tier === "low") {
    return {
      border: "border-l-[4px] border-l-low-risk-border",
      tint: "bg-low-risk-bg/50",
      badge: "bg-low-risk-bg text-low-risk-badge border-low-risk-border",
    };
  }
  if (tier === "moderate") {
    return {
      border: "border-l-[4px] border-l-mod-risk-border",
      tint: "bg-mod-risk-bg/40",
      badge: "bg-mod-risk-bg text-mod-risk-badge border-mod-risk-border",
    };
  }
  return {
    border: "border-l-[4px] border-l-high-risk-border",
    tint: "bg-high-risk-bg/40",
    badge: "bg-high-risk-bg text-high-risk-badge border-high-risk-border",
  };
}

function buildApyStability(chartData: ChartPoint[]): string {
  if (chartData.length < 10) {
    return "Stability signal unavailable with current history window.";
  }
  const last7 = chartData.slice(-7);
  const last30 = chartData.slice(-30);
  const avg7 = last7.reduce((sum, item) => sum + item.apy, 0) / last7.length;
  const avg30 = last30.reduce((sum, item) => sum + item.apy, 0) / last30.length;
  const divergence = Math.abs(avg7 - avg30);
  return divergence <= 0.4
    ? "Stable: recent 7-day average is close to the 30-day baseline."
    : "Volatile: recent 7-day average diverges from the 30-day baseline.";
}

export function VaultCard({ vault, index }: VaultCardProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const styles = riskStyle(vault.safetyRating.tier);

  useEffect(() => {
    if (!showAdvanced || !vault.llamaPoolId || chartData.length > 0 || chartLoading) {
      return;
    }
    let active = true;
    setChartLoading(true);
    setChartError(null);

    void fetchVaultChart(vault.llamaPoolId)
      .then((data) => {
        if (!active) {
          return;
        }
        setChartData(data);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setChartError("Could not load APY history right now.");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setChartLoading(false);
      });

    return () => {
      active = false;
    };
  }, [showAdvanced, vault.llamaPoolId, chartData.length, chartLoading]);

  const apyTags = useMemo(() => {
    const tags: Array<{ label: string; className: string }> = [];
    tags.push({
      label: `Base: ${formatPercent(vault.apyBreakdown.base)}`,
      className: "bg-tag-base-bg text-tag-base-text",
    });
    if (vault.apyBreakdown.incentive > 0) {
      tags.push({
        label: `+ Incentive: ${formatPercent(vault.apyBreakdown.incentive)}`,
        className: "bg-tag-incentive-bg text-tag-incentive-text",
      });
      tags.push({
        label: vault.apyBreakdown.incentiveEndDate
          ? `ends ~${new Date(vault.apyBreakdown.incentiveEndDate).toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            })}`
          : "end date unavailable",
        className: "bg-tag-expiry-bg text-tag-expiry-text",
      });
    }
    if (vault.apyBreakdown.boost > 0) {
      tags.push({
        label: `+ Boost: ${formatPercent(vault.apyBreakdown.boost)}`,
        className: "bg-tag-boost-bg text-tag-boost-text",
      });
    }
    if (vault.apyBreakdown.boostRequires) {
      tags.push({
        label: "Requires token lock",
        className: "bg-tag-warning-bg text-tag-warning-text",
      });
    }
    if (vault.apyBreakdown.ilRisk) {
      tags.push({
        label: "IL risk",
        className: "bg-tag-warning-bg text-tag-warning-text",
      });
    }
    if (vault.rewardTokenWarning) {
      tags.push({
        label: vault.rewardTokenWarning,
        className: "bg-tag-warning-bg text-tag-warning-text",
      });
    }
    if (vault.apyBreakdown.isClean) {
      tags.push({
        label: "Base Rate Only",
        className: "bg-tag-clean-bg text-tag-clean-text",
      });
    }
    return tags;
  }, [vault]);

  return (
    <motion.article
      id={`vault-${vault.id}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={`rounded-[8px] border border-border ${styles.border} ${styles.tint} p-5 shadow-card transition-transform duration-200 hover:-translate-y-[2px] hover:shadow-hover`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.06em] text-text-secondary">
            {vault.protocolDisplayName}
          </p>
          <h3 className="mt-1 font-display text-[26px] leading-[1.15] text-text-primary">
            {vault.plainEnglishName}
          </h3>
          <p className="mt-1 text-sm text-text-secondary">{vault.launchYearLabel}</p>
        </div>
        <div className={`rounded-[999px] border px-3 py-1 text-sm font-semibold ${styles.badge}`}>
          {vault.safetyRating.label}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <p className="font-display text-[30px] leading-none text-text-primary">
          Earn ~{formatPercent(vault.headlineAPY)} per year
        </p>
        {!vault.apyBreakdown.isClean && (
          <span
            className="inline-flex items-center text-text-secondary"
            title="This rate includes temporary or conditional rewards."
          >
            <Info size={15} />
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {apyTags.map((tag) => (
          <span
            key={tag.label}
            className={`rounded-[999px] px-2 py-1 font-mono text-[12px] ${tag.className}`}
          >
            {tag.label}
          </span>
        ))}
      </div>

      <p className="mb-4 text-sm text-text-primary">{vault.realMoneyLabel}</p>
      <p className="mb-1 text-sm font-semibold text-text-primary">{vault.safetyRating.note}</p>
      <p className="mb-1 text-sm text-text-secondary">{vault.lockLabel}</p>
      <p className="mb-4 text-sm text-text-secondary">{vault.tradfiAnalogy}</p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover"
          onClick={() => setShowAdvanced((current) => !current)}
        >
          {showAdvanced ? "Hide details" : "Show details"}
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <a
          href={vault.depositUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-[8px] bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Deposit
          <ExternalLink size={14} />
        </a>
      </div>

      <AnimatePresence initial={false}>
        {showAdvanced && (
          <motion.section
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 border-t border-border pt-4 text-sm text-text-primary">
              <div className="grid gap-2 md:grid-cols-2">
                <p>
                  Platform: <span className="font-semibold">{vault.protocolDisplayName}</span>
                </p>
                <p>
                  Total deposited:{" "}
                  <span className="font-mono font-semibold">${formatCurrency(vault.tvlUsd)}</span>
                </p>
                <p>
                  Safety rating:{" "}
                  <span className="font-mono font-semibold">{vault.safetyRating.score}/10</span>
                </p>
                <p>TVL signal: {vault.tvlTrendLabel}</p>
              </div>

              <div className="mt-4 h-[160px] rounded-[8px] border border-border bg-white px-2 py-2">
                {chartLoading && <p className="px-2 py-6 text-text-secondary">Loading APY history...</p>}
                {chartError && <p className="px-2 py-6 text-tag-warning-text">{chartError}</p>}
                {!chartLoading && !chartError && chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={`apy-${vault.id}`} x1="0" x2="0" y1="0" y2="1">
                          <stop offset="5%" stopColor="#2D6A4F" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#2D6A4F" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="timestamp" hide />
                      <YAxis width={34} tick={{ fontSize: 11, fill: "#6B6560" }} />
                      <Tooltip
                        formatter={(value) =>
                          typeof value === "number" ? `${value.toFixed(2)}%` : String(value ?? "")
                        }
                        labelFormatter={() => "APY"}
                      />
                      <Area
                        type="monotone"
                        dataKey="apy"
                        stroke="#2D6A4F"
                        strokeWidth={2}
                        fill={`url(#apy-${vault.id})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {chartData.length > 0 && (
                <p className="mt-2 text-sm text-text-secondary">{buildApyStability(chartData)}</p>
              )}

              <div className="mt-4 grid gap-2 rounded-[8px] border border-border bg-background-primary p-3 text-sm">
                <p className="font-semibold">APY breakdown</p>
                <p>Base: {formatPercent(vault.apyBreakdown.base)}</p>
                <p>Incentive: {formatPercent(vault.apyBreakdown.incentive)}</p>
                <p>Boost: {formatPercent(vault.apyBreakdown.boost)}</p>
                <p>Total shown: {formatPercent(vault.apyBreakdown.total)}</p>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <p>
                  Audits: <span className="font-semibold">{vault.auditCount}</span>
                </p>
                <p>
                  Exploit history:{" "}
                  <span className="font-semibold capitalize">{vault.exploitHistory}</span>
                </p>
                <p>
                  Upgradeable contract:{" "}
                  <span className="font-semibold">{vault.contractUpgradeable ? "Yes" : "No"}</span>
                </p>
                <p>
                  Bug bounty: <span className="font-semibold">{vault.bugBounty ? "Yes" : "No"}</span>
                </p>
                <p>Chain: {vault.chain}</p>
                <p>Vault mechanics: {vault.apyBreakdown.ilRisk ? "LP strategy" : "Lending / staking"}</p>
              </div>

              {vault.apyBreakdown.ilRisk && (
                <p className="mt-2 text-tag-warning-text">
                  Value risk from price moves (IL): {vault.apyBreakdown.ilAmount?.toFixed(2) ?? "N/A"}%
                  over 7 days.
                </p>
              )}

              <div className="mt-3 grid gap-1 text-xs text-text-secondary">
                <p>Safety factor weights: Age 20%, Audits 25%, Exploit history 25%, TVL 10%, APY stability 10%, Withdrawal flexibility 10%.</p>
                <p>
                  Factor scores: age {vault.safetyRating.breakdown.ageScore.toFixed(2)} | audits{" "}
                  {vault.safetyRating.breakdown.auditScore.toFixed(2)} | exploit{" "}
                  {vault.safetyRating.breakdown.exploitScore.toFixed(2)} | tvl{" "}
                  {vault.safetyRating.breakdown.tvlScore.toFixed(2)} | stability{" "}
                  {vault.safetyRating.breakdown.stabilityScore.toFixed(2)} | liquidity{" "}
                  {vault.safetyRating.breakdown.liquidityScore.toFixed(2)}
                </p>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
