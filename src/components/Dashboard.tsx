import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FilterBar, type DashboardFilters } from "./FilterBar";
import { VaultCard } from "./VaultCard";
import type { ClarityVault } from "../api/earn";

interface DashboardProps {
  vaults: ClarityVault[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  fetchedAt: number | null;
  latestSyncISO: string | null;
  warnings: string[];
  totalVaults: number | null;
}

const CARD_PAGE_SIZE = 8;

const defaultFilters: DashboardFilters = {
  risk: "all",
  lock: "any",
  age: "any",
  apyType: "all",
  sort: "highest_return",
};

interface OpenVaultEvent extends Event {
  detail?: {
    vaultId?: string;
  };
}

function minutesAgo(timestamp: number): string {
  const diff = Math.max(Math.round((Date.now() - timestamp) / 60000), 0);
  if (diff <= 1) {
    return "Updated just now";
  }
  return `Updated ${diff} min ago`;
}

function filterSummary(filters: DashboardFilters, count: number, hiddenCount: number): string {
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
    return hiddenCount > 0 ? `${count} results · ${hiddenCount} hidden by default` : `${count} results`;
  }
  return hiddenCount > 0
    ? `${parts.join(" · ")} (${count} results · ${hiddenCount} hidden)`
    : `${parts.join(" · ")} (${count} results)`;
}

function applyFilters(
  vaults: ClarityVault[],
  filters: DashboardFilters,
  showHighApy: boolean,
  showLowApy: boolean,
): ClarityVault[] {
  return [...vaults]
    .filter((vault) => {
      if (!showHighApy && vault.headlineAPY > 20) {
        return false;
      }
      if (!showLowApy && vault.headlineAPY < 2) {
        return false;
      }
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
  loadingMore,
  error,
  fetchedAt,
  latestSyncISO,
  warnings,
  totalVaults,
}: DashboardProps) {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [showHighApy, setShowHighApy] = useState(false);
  const [showLowApy, setShowLowApy] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const hiddenCount = useMemo(
    () => vaults.filter((vault) => (!showHighApy && vault.headlineAPY > 20) || (!showLowApy && vault.headlineAPY < 2)).length,
    [showHighApy, showLowApy, vaults],
  );
  const filteredVaults = useMemo(
    () => applyFilters(vaults, filters, showHighApy, showLowApy),
    [filters, showHighApy, showLowApy, vaults],
  );
  const totalPages = Math.max(Math.ceil(filteredVaults.length / CARD_PAGE_SIZE), 1);
  const activePage = Math.min(currentPage, totalPages);
  const pageStart = filteredVaults.length === 0 ? 0 : (activePage - 1) * CARD_PAGE_SIZE + 1;
  const pageEnd = Math.min(activePage * CARD_PAGE_SIZE, filteredVaults.length);
  const pageVaults = useMemo(
    () => filteredVaults.slice((activePage - 1) * CARD_PAGE_SIZE, activePage * CARD_PAGE_SIZE),
    [activePage, filteredVaults],
  );
  const summary = useMemo(
    () => filterSummary(filters, filteredVaults.length, hiddenCount),
    [filters, filteredVaults.length, hiddenCount],
  );

  function handleFilterChange(nextFilters: DashboardFilters) {
    setFilters(nextFilters);
    setCurrentPage(1);
  }

  useEffect(() => {
    function handleOpenVault(event: OpenVaultEvent) {
      const vaultId = event.detail?.vaultId;
      const selectedVault = vaults.find((vault) => vault.id === vaultId);
      if (!selectedVault) {
        return;
      }

      const nextShowHighApy = selectedVault.headlineAPY > 20 || showHighApy;
      const nextShowLowApy = selectedVault.headlineAPY < 2 || showLowApy;
      const nextVaults = applyFilters(vaults, defaultFilters, nextShowHighApy, nextShowLowApy);
      const vaultIndex = nextVaults.findIndex((vault) => vault.id === selectedVault.id);
      if (vaultIndex < 0) {
        return;
      }

      setFilters(defaultFilters);
      setShowHighApy(nextShowHighApy);
      setShowLowApy(nextShowLowApy);
      setCurrentPage(Math.floor(vaultIndex / CARD_PAGE_SIZE) + 1);

      window.setTimeout(() => {
        document.getElementById(`vault-${selectedVault.id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 80);
    }

    window.addEventListener("clarity:open-vault", handleOpenVault);
    return () => {
      window.removeEventListener("clarity:open-vault", handleOpenVault);
    };
  }, [showHighApy, showLowApy, vaults]);

  if (loading) {
    return (
      <section>
        <FilterBar filters={filters} onChange={handleFilterChange} />
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
      <FilterBar filters={filters} onChange={handleFilterChange} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-[999px] border border-border bg-white px-3 py-1 text-sm text-text-primary">
          {summary}
        </span>
        <div className="text-sm text-text-secondary">
          {fetchedAt ? minutesAgo(fetchedAt) : "Updated just now"}
          {latestSyncISO ? ` · source sync ${new Date(latestSyncISO).toLocaleTimeString("en-US")}` : ""}
          {loadingMore ? ` · loading more pools (${vaults.length}${totalVaults ? `/${totalVaults}` : ""})` : ""}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setShowHighApy((current) => !current);
            setCurrentPage(1);
          }}
          className={`rounded-[8px] border px-3 py-2 text-sm font-medium ${
            showHighApy
              ? "border-high-risk-border bg-high-risk-bg text-high-risk-badge"
              : "border-border bg-white text-text-primary hover:bg-background-secondary"
          }`}
        >
          {showHighApy ? "Hide APY above 20%" : "Show APY above 20%"}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowLowApy((current) => !current);
            setCurrentPage(1);
          }}
          className={`rounded-[8px] border px-3 py-2 text-sm font-medium ${
            showLowApy
              ? "border-tag-base-bg bg-tag-base-bg text-tag-base-text"
              : "border-border bg-white text-text-primary hover:bg-background-secondary"
          }`}
        >
          {showLowApy ? "Hide APY below 2%" : "Show APY below 2%"}
        </button>
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
          {pageVaults.map((vault, index) => (
            <motion.div key={vault.id} layout>
              <VaultCard vault={vault} index={index} />
            </motion.div>
          ))}
        </div>
      )}

      {filteredVaults.length > CARD_PAGE_SIZE && (
        <nav className="mt-6 flex flex-wrap items-center justify-center gap-3" aria-label="Vault pages">
          <button
            type="button"
            disabled={activePage <= 10}
            onClick={() => setCurrentPage((page) => Math.max(page - 10, 1))}
            className="rounded-[8px] border border-border bg-white px-3 py-2 text-sm font-semibold text-text-primary hover:bg-background-secondary disabled:cursor-not-allowed disabled:opacity-45"
          >
            -10
          </button>
          <button
            type="button"
            disabled={activePage === 1}
            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
            className="rounded-[8px] border border-border bg-white px-3 py-2 text-sm font-semibold text-text-primary hover:bg-background-secondary disabled:cursor-not-allowed disabled:opacity-45"
          >
            Prev
          </button>
          <span className="rounded-[999px] border border-border bg-white px-3 py-2 text-sm text-text-primary">
            Page {activePage} of {totalPages} · {pageStart}-{pageEnd} of {filteredVaults.length}
          </span>
          <button
            type="button"
            disabled={activePage === totalPages}
            onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
            className="rounded-[8px] border border-border bg-white px-3 py-2 text-sm font-semibold text-text-primary hover:bg-background-secondary disabled:cursor-not-allowed disabled:opacity-45"
          >
            Next
          </button>
          <button
            type="button"
            disabled={activePage > totalPages - 10}
            onClick={() => setCurrentPage((page) => Math.min(page + 10, totalPages))}
            className="rounded-[8px] border border-border bg-white px-3 py-2 text-sm font-semibold text-text-primary hover:bg-background-secondary disabled:cursor-not-allowed disabled:opacity-45"
          >
            +10
          </button>
        </nav>
      )}
    </section>
  );
}
