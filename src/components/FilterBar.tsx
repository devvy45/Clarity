import { twMerge } from "tailwind-merge";
import type { APYType, RiskLabel } from "../api/earn";
import { getLockCategoryLabel, type LockCategory } from "../api/earn";

export type SortOption = "highest_return" | "lowest_risk" | "newest" | "most_deposited";
export type AgeFilter = "any" | "1y" | "2y" | "4y";

export interface DashboardFilters {
  risk: "all" | RiskLabel;
  lock: "any" | LockCategory;
  age: AgeFilter;
  apyType: "all" | APYType;
  sort: SortOption;
}

interface FilterBarProps {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
}

const CHIP_BASE =
  "shrink-0 rounded-[8px] border px-3 py-2 text-sm font-medium transition-colors";

const LABEL_CLASS = "mb-2 text-[12px] uppercase tracking-[0.06em] text-text-secondary";

function chipClass(active: boolean): string {
  return twMerge(
    CHIP_BASE,
    active
      ? "border-transparent bg-accent text-white"
      : "border-border bg-white text-text-primary hover:bg-background-secondary",
  );
}

export const defaultFilters: DashboardFilters = {
  risk: "all",
  lock: "any",
  age: "any",
  apyType: "all",
  sort: "highest_return",
};

export function FilterBar({ filters, onChange }: FilterBarProps) {
  return (
    <section className="mb-6 border-b border-border pb-5">
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
        <div className="min-w-0">
          <p className={LABEL_CLASS}>Risk Level</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["all", "Low Risk", "Moderate Risk", "High Risk"].map((value) => (
              <button
                key={value}
                type="button"
                className={chipClass(filters.risk === value)}
                onClick={() => onChange({ ...filters, risk: value as DashboardFilters["risk"] })}
              >
                {value === "all" ? "All" : value}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <p className={LABEL_CLASS}>Lock Time</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["any", "withdraw_anytime", "up_to_7_days", "up_to_30_days", "thirty_plus_days"] as const).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  className={chipClass(filters.lock === value)}
                  onClick={() => onChange({ ...filters, lock: value })}
                >
                  {value === "any" ? "Any" : getLockCategoryLabel(value)}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="min-w-0">
          <p className={LABEL_CLASS}>Protocol Age</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { label: "Any", value: "any" },
              { label: "1+ years", value: "1y" },
              { label: "2+ years", value: "2y" },
              { label: "4+ years", value: "4y" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={chipClass(filters.age === option.value)}
                onClick={() => onChange({ ...filters, age: option.value as AgeFilter })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <p className={LABEL_CLASS}>APY Type</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { label: "All APY", value: "all" },
              { label: "Base Rate Only", value: "base_only" },
              { label: "Includes Incentives", value: "includes_incentives" },
              { label: "Boost Available", value: "boost_available" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={chipClass(filters.apyType === option.value)}
                onClick={() => onChange({ ...filters, apyType: option.value as DashboardFilters["apyType"] })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <p className={LABEL_CLASS}>Sort</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { label: "Highest Return", value: "highest_return" },
              { label: "Lowest Risk", value: "lowest_risk" },
              { label: "Newest", value: "newest" },
              { label: "Most Deposited", value: "most_deposited" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={chipClass(filters.sort === option.value)}
                onClick={() => onChange({ ...filters, sort: option.value as SortOption })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
