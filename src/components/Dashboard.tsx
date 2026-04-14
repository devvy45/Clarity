import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FilterBar, defaultFilters, type DashboardFilters } from "./FilterBar";
import { VaultCard } from "./VaultCard";
import type { ClarityVault } from "../api/earn";

interface DashboardProps {
  vaults: ClarityVault[];
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  latestSyncISO: string | null;
  warnings: string[];
}

function minutesAgo(timestamp: number): string {
  const diff = Math.max(Math.round((Date.now() - timestamp) / 60000), 0);
  if (diff <= 1) {
    return "Updated just now";
  }
  return `Updated ${diff} min ago`;
}

function filterSummary(filters: DashboardFilters, count: number): string {
  const parts: string[] = [];
  if (filters.risk !== "all") {
    parts.push(filters.risk);
  }
  if (filters.lock !== "any") {
    parts.push(filters.lock === "withdraw_anytime" ? "Anytime" : filters.lock.replaceAll("_", " "));
  }
  if (filters.age !== "any") {
    parts.push(filters.age.replace("y", "+ years"));
  }
  if (filters.apyType !== "all") {
    parts.push(
      filters.apyType === "base_only"
        ? "Base Rate Only"
        : filters.apyType === "includes_incentives"
          ? "Includes Incentives"
          : "Boost Available",
    );
  }
  if (parts.length === 0) {
    return `${count} results`;
  }
  return `${parts.join(" · ")} (${count} results)`;
}

function applyFilters(vaults: ClarityVault[], filters: DashboardFilters): ClarityVault[] {
  return [...vaults]
    .filter((vault) => {
      if (filters.risk !== "all" && vault.safetyRating.label !== filters.risk) {
        return false;
      }
      if (filters.lock !== "any" && vault.lockCategory !== filters.lock) {
        return false;
      }
      if (filters.apyType !== "all" && vault.apyType !== filters.apyType) {
        return false;
      }
      if (filters.age === "1y" && vault.yearsLive < 1) {
        return false;
      }
      if (filters.age === "2y" && vault.yearsLive < 2) {
        return false;
      }
      if (filters.age === "4y" && vault.yearsLive < 4) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "highest_return") {
        return b.headlineAPY - a.headlineAPY;
      }
      if (filters.sort === "lowest_risk") {
        return b.safetyRating.score - a.safetyRating.score;
      }
      if (filters.sort === "newest") {
        return (b.launchDate ?? 0) - (a.launchDate ?? 0);
      }
      return b.tvlUsd - a.tvlUsd;
    });
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div
          key={`skeleton-${idx}`}
          className="h-[280px] animate-pulse rounded-[8px] border border-border bg-background-secondary"
        />
      ))}
    </div>
  );
}

export function Dashboard({
  vaults,
  loading,
  error,
  fetchedAt,
  latestSyncISO,
  warnings,
}: DashboardProps) {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);

  const filteredVaults = useMemo(() => applyFilters(vaults, filters), [vaults, filters]);
  const summary = useMemo(() => filterSummary(filters, filteredVaults.length), [filters, filteredVaults.length]);

  if (loading) {
    return (
      <section>
        <FilterBar filters={filters} onChange={setFilters} />
        <LoadingSkeleton />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[8px] border border-high-risk-border bg-high-risk-bg p-4 text-sm text-high-risk-badge">
        {error}
      </section>
    );
  }

  return (
    <section id="dashboard">
      <FilterBar filters={filters} onChange={setFilters} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-[999px] border border-border bg-white px-3 py-1 text-sm text-text-primary">
          {summary}
        </span>
        <div className="text-sm text-text-secondary">
          {fetchedAt ? minutesAgo(fetchedAt) : "Updated just now"}
          {latestSyncISO ? ` · source sync ${new Date(latestSyncISO).toLocaleTimeString("en-US")}` : ""}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 rounded-[8px] border border-tag-warning-bg bg-tag-warning-bg/50 px-3 py-2 text-sm text-tag-warning-text">

        </div>
      )}

      {filteredVaults.length === 0 ? (
        <div className="rounded-[8px] border border-border bg-background-secondary p-6 text-center text-text-secondary">
          No options match this filter combination yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredVaults.map((vault, index) => (
            <motion.div key={vault.id} layout>
              <VaultCard vault={vault} index={index} />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
