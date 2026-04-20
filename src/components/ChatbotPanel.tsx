import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import type { ClarityVault } from "../api/earn";

const STORAGE_KEY = "clarity-profile-state-v1";

type TimeHorizon = "short" | "medium" | "long";
type AmountRange = "small" | "medium" | "large";
type PrimaryConcern = "safety" | "liquidity" | "returns";
type AssetPreference = "stablecoins" | "eth" | "any";
type IncentivePreference = "no" | "maybe" | "yes";

interface AdvisorProfile {
  timeHorizon: TimeHorizon | null;
  amountRange: AmountRange | null;
  primaryConcern: PrimaryConcern | null;
  assetPreference: AssetPreference | null;
  incentivePreference: IncentivePreference | null;
}

interface QuestionOption<TValue extends string> {
  label: string;
  value: TValue;
}

interface ProfileQuestion<TKey extends keyof AdvisorProfile> {
  key: TKey;
  prompt: string;
  options: Array<QuestionOption<NonNullable<AdvisorProfile[TKey]>>>;
}

interface ChatbotPanelProps {
  vaults: ClarityVault[];
}

const questions: Array<ProfileQuestion<keyof AdvisorProfile>> = [
  {
    key: "timeHorizon",
    prompt: "How long do you plan to hold?",
    options: [
      { label: "Less than 3 months", value: "short" },
      { label: "3 months to 1 year", value: "medium" },
      { label: "More than 1 year", value: "long" },
    ],
  },
  {
    key: "amountRange",
    prompt: "What amount are you exploring with?",
    options: [
      { label: "Under $500", value: "small" },
      { label: "$500 to $5k", value: "medium" },
      { label: "$5k+", value: "large" },
    ],
  },
  {
    key: "primaryConcern",
    prompt: "What matters most right now?",
    options: [
      { label: "Safety first", value: "safety" },
      { label: "Easy access", value: "liquidity" },
      { label: "Higher return", value: "returns" },
    ],
  },
  {
    key: "assetPreference",
    prompt: "Which assets feel comfortable?",
    options: [
      { label: "Stablecoins only", value: "stablecoins" },
      { label: "ETH is okay", value: "eth" },
      { label: "Open to any", value: "any" },
    ],
  },
  {
    key: "incentivePreference",
    prompt: "Are you looking for extra incentives too (Added risk)?",
    options: [
      { label: "No, base rate only", value: "no" },
      { label: "Maybe, if clear", value: "maybe" },
      { label: "Yes, include them", value: "yes" },
    ],
  },
];

const emptyProfile: AdvisorProfile = {
  timeHorizon: null,
  amountRange: null,
  primaryConcern: null,
  assetPreference: null,
  incentivePreference: null,
};

function loadProfile(): AdvisorProfile {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyProfile;
  }
  try {
    return { ...emptyProfile, ...(JSON.parse(raw) as Partial<AdvisorProfile>) };
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return emptyProfile;
  }
}

function isStablecoin(symbol: string): boolean {
  return /^(USDC|USDT|DAI|FRAX|USDE|USDS|USD0|TUSD)$/i.test(symbol);
}

function scoreVault(vault: ClarityVault, profile: AdvisorProfile): number {
  let score = vault.safetyRating.score;

  if (profile.primaryConcern === "returns") {
    score += Math.min(vault.headlineAPY, 20) * 0.5;
  }
  if (profile.primaryConcern === "liquidity" && vault.lockCategory === "withdraw_anytime") {
    score += 4;
  }
  if (profile.primaryConcern === "safety" && vault.safetyRating.tier === "low") {
    score += 4;
  }
  if (profile.timeHorizon === "short" && vault.lockCategory === "withdraw_anytime") {
    score += 2;
  }
  if (profile.timeHorizon === "long" && vault.yearsLive >= 1) {
    score += 1.5;
  }
  if (profile.incentivePreference === "yes" && vault.apyBreakdown.incentive > 0) {
    score += 3;
  }
  if (profile.incentivePreference === "no" && vault.apyBreakdown.isClean) {
    score += 2;
  }
  if (profile.amountRange === "large" && vault.tvlUsd > 100_000_000) {
    score += 2;
  }

  return score;
}

function recommendVaults(vaults: ClarityVault[], profile: AdvisorProfile): ClarityVault[] {
  const allowVeryHigh = profile.incentivePreference === "yes" && profile.primaryConcern === "returns";
  const candidates = vaults.filter((vault) => {
    if (vault.headlineAPY < 2) {
      return false;
    }
    if (!allowVeryHigh && vault.headlineAPY > 20) {
      return false;
    }
    if (profile.assetPreference === "stablecoins" && !isStablecoin(vault.tokenSymbol)) {
      return false;
    }
    if (profile.assetPreference === "eth" && !isStablecoin(vault.tokenSymbol) && !vault.tokenSymbol.includes("ETH")) {
      return false;
    }
    if (profile.incentivePreference === "no" && !vault.apyBreakdown.isClean) {
      return false;
    }
    if (profile.primaryConcern === "liquidity" && vault.lockCategory !== "withdraw_anytime") {
      return false;
    }
    return true;
  });

  return [...(candidates.length > 0 ? candidates : vaults)]
    .sort((a, b) => scoreVault(b, profile) - scoreVault(a, profile))
    .slice(0, 3);
}

function profileComplete(profile: AdvisorProfile): boolean {
  return questions.every((question) => profile[question.key] !== null);
}

export function ChatbotPanel({ vaults }: ChatbotPanelProps) {
  const [profile, setProfile] = useState<AdvisorProfile>(() => loadProfile());
  const [searchQuery, setSearchQuery] = useState("");
  const activeQuestion = questions.find((question) => profile[question.key] === null);
  const recommendedVaults = recommendVaults(vaults, profile);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchedVaults =
    normalizedSearch.length === 0
      ? []
      : vaults
          .filter((vault) => {
            const haystack = [
              vault.plainEnglishName,
              vault.protocolDisplayName,
              vault.tokenSymbol,
              vault.chain,
              vault.tradfiAnalogy,
              vault.lockLabel,
              vault.safetyRating.label,
            ]
              .join(" ")
              .toLowerCase();
            return haystack.includes(normalizedSearch);
          })
          .slice(0, 4);

  function answerQuestion<TKey extends keyof AdvisorProfile>(key: TKey, value: NonNullable<AdvisorProfile[TKey]>) {
    setProfile((current) => {
      const next = { ...current, [key]: value };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function resetProfile() {
    setProfile(emptyProfile);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function openVault(vaultId: string) {
    window.dispatchEvent(new CustomEvent("clarity:open-vault", { detail: { vaultId } }));
  }

  return (
    <aside className="flex h-full min-h-[520px] flex-col rounded-[8px] border border-border bg-bg-dark p-5 text-text-on-dark shadow-card lg:min-h-screen lg:rounded-none lg:border-y-0 lg:border-r-0 lg:p-6">
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-8">
          <label htmlFor="advisor-search" className="mb-2 block text-xs uppercase tracking-[0.06em] text-text-on-dark/65">
            Search Pools
          </label>
          <input
            id="advisor-search"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Low risk ETH, stablecoins, withdraw anytime..."
            className="w-full rounded-[8px] border border-white/15 bg-white/10 px-4 py-3 text-sm text-text-on-dark outline-none placeholder:text-text-on-dark/45 focus:border-white/30"
          />
          {normalizedSearch.length > 0 && (
            <div className="mt-3 space-y-2">
              {searchedVaults.length > 0 ? (
                searchedVaults.map((vault) => (
                  <button
                    key={`search-${vault.id}`}
                    type="button"
                    onClick={() => openVault(vault.id)}
                    className="block w-full rounded-[8px] border border-white/15 bg-white/10 p-3 text-left text-sm hover:bg-white/15"
                  >
                    <div className="flex items-center gap-2">
                      {vault.protocolLogoPath && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white p-1.5">
                          <img src={vault.protocolLogoPath} alt="" className="max-h-full max-w-full object-contain" />
                        </span>
                      )}
                      <p className="font-semibold">{vault.plainEnglishName}</p>
                    </div>
                    <p className="mt-2 text-text-on-dark/75">
                      Base {vault.apyBreakdown.base.toFixed(2)}% · Total {vault.apyBreakdown.total.toFixed(2)}% ·{" "}
                      {vault.safetyRating.label}
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-sm text-text-on-dark/70">No close matches yet. Try protocol, asset, chain, or risk words.</p>
              )}
            </div>
          )}
        </div>

        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-[28px] leading-tight">Let&apos;s build your profile.</p>
            <p className="mt-2 text-sm text-text-on-dark/75">Five quick answers, then I&apos;ll narrow the list.</p>
          </div>
          <button
            type="button"
            onClick={resetProfile}
            className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-white/15 px-2 py-1 text-xs text-text-on-dark/85 hover:bg-white/10"
          >
            <RefreshCcw size={13} />
            Reset
          </button>
        </div>

        {activeQuestion ? (
          <div>
            <div className="mb-4 rounded-[8px] border border-white/15 bg-white/10 p-4 text-[17px] leading-relaxed">
              {activeQuestion.prompt}
            </div>
            <div className="space-y-3">
              {activeQuestion.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => answerQuestion(activeQuestion.key, option.value)}
                  className="w-full rounded-[8px] bg-background-primary px-4 py-3 text-left text-sm font-semibold text-bg-dark hover:bg-white"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-text-on-dark/65">
              Question {questions.findIndex((question) => question.key === activeQuestion.key) + 1} of {questions.length}
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-4 rounded-[8px] border border-white/15 bg-white/10 p-4 text-sm leading-relaxed">
              Profile ready. These options best match your answers, using the pools already loaded on this page.
            </div>

            {recommendedVaults.length === 0 && (
              <p className="text-sm text-text-on-dark/75">Live vault data is still loading. Recommendations will appear here.</p>
            )}

            <div className="space-y-3">
              {recommendedVaults.map((vault) => (
                <button
                  key={vault.id}
                  type="button"
                  onClick={() => openVault(vault.id)}
                  className="block w-full rounded-[8px] border border-white/15 bg-white/10 p-3 text-left text-sm hover:bg-white/15"
                >
                  <div className="flex items-center gap-2">
                    {vault.protocolLogoPath && (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white p-1.5">
                        <img src={vault.protocolLogoPath} alt="" className="max-h-full max-w-full object-contain" />
                      </span>
                    )}
                    <p className="font-semibold">{vault.plainEnglishName}</p>
                  </div>
                  <p className="mt-2 text-text-on-dark/75">
                    Base {vault.apyBreakdown.base.toFixed(2)}% · Total {vault.apyBreakdown.total.toFixed(2)}% ·{" "}
                    {vault.safetyRating.label}
                  </p>
                </button>
              ))}
            </div>

            {profileComplete(profile) && (
              <p className="mt-4 text-xs text-text-on-dark/65">
                This is a matching aid, not financial advice. Review lock terms and incentives before depositing.
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
