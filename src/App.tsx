import { useEffect, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { ChatbotPanel } from "./components/ChatbotPanel";
import { fetchClaritySnapshot, type ClarityVault } from "./api/earn";
import heroImage from "./assets/hero.png";

const REFRESH_INTERVAL_MS = 300000;

function mergeVaults(current: ClarityVault[], incoming: ClarityVault[]): ClarityVault[] {
  const byId = new Map(current.map((vault) => [vault.id, vault]));
  for (const vault of incoming) {
    byId.set(vault.id, vault);
  }
  return [...byId.values()];
}

function App() {
  const [vaults, setVaults] = useState<ClarityVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [latestSyncISO, setLatestSyncISO] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalVaults, setTotalVaults] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        const snapshot = await fetchClaritySnapshot();
        if (!active) {
          return;
        }
        setVaults(snapshot.vaults);
        setFetchedAt(snapshot.fetchedAt);
        setLatestSyncISO(snapshot.latestSyncISO);
        setWarnings(snapshot.warnings);
        setTotalVaults(snapshot.totalVaults);
        setError(null);
        setLoading(false);

        let cursor = snapshot.nextCursor;
        if (cursor) {
          setLoadingMore(true);
        }
        try {
          while (cursor && active) {
            const nextSnapshot = await fetchClaritySnapshot(cursor);
            if (!active) {
              return;
            }
            setVaults((current) => mergeVaults(current, nextSnapshot.vaults));
            setFetchedAt(nextSnapshot.fetchedAt);
            setLatestSyncISO((current) => nextSnapshot.latestSyncISO ?? current);
            setWarnings((current) => [...new Set([...current, ...nextSnapshot.warnings])]);
            setTotalVaults(nextSnapshot.totalVaults);
            cursor = nextSnapshot.nextCursor;
          }
        } catch {
          if (active) {
            setWarnings((current) => [...new Set([...current, "Some additional LI.FI pages could not load."])]);
          }
        }
      } catch (err) {
        if (!active) {
          return;
        }
        const message = err instanceof Error ? err.message : "Could not fetch live vault data.";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    }

    void loadData();
    const timer = window.setInterval(() => {
      void loadData();
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background-primary text-text-primary">
      <div className="lg:mr-[360px]">
        <section className="border-b border-border bg-background-primary">
          <header className="border-b border-border bg-bg-dark">
            <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-4 md:px-6">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-[2px] bg-accent-light" />
                <p className="font-display text-[30px] leading-none text-text-on-dark">Clarity</p>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-6 lg:py-6">
            <section className="overflow-hidden rounded-[8px] border border-border">
              <div
                className="relative px-5 py-7 md:px-8 md:py-8"
                style={{
                  backgroundImage: `linear-gradient(rgba(248,244,239,0.86), rgba(248,244,239,0.86)), url(${heroImage})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <p className="mb-2 text-xs uppercase tracking-[0.08em] text-text-secondary">DeFi, finally clear.</p>
                <h1 className="max-w-[760px] font-display text-[38px] leading-[1.08] md:text-[52px]">
                  Find the right place for your money.
                </h1>
                <p className="mt-3 max-w-[760px] text-[17px] text-text-secondary">
                  Compare audited yield options in plain language. Base rate, bonus rewards, lock terms, and safety
                  signal all in one view. No wallet connection required.
                </p>
              </div>
            </section>
          </div>
        </section>

        <div className="px-4 pb-6 pt-6 md:px-6 lg:hidden">
          <ChatbotPanel vaults={vaults} />
        </div>

        <main className="mx-auto max-w-[1180px] px-4 pb-28 pt-6 md:px-6">
          <Dashboard
            vaults={vaults}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            fetchedAt={fetchedAt}
            latestSyncISO={latestSyncISO}
            warnings={warnings}
            totalVaults={totalVaults}
          />

          <section id="how-it-works" className="mt-12 grid gap-3 md:grid-cols-3">
            {[
              {
                title: "1. Explore",
                body: "Scan live opportunities without signing in or connecting a wallet.",
              },
              {
                title: "2. Understand",
                body: "See base rate vs temporary bonuses so headline APY is never misleading.",
              },
              {
                title: "3. Decide",
                body: "Open the platform directly when you are comfortable with the trade-offs.",
              },
            ].map((item) => (
              <article key={item.title} className="rounded-[8px] border border-border bg-background-secondary p-4">
                <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                <p className="mt-1 text-sm text-text-secondary">{item.body}</p>
              </article>
            ))}
          </section>

          <footer id="methodology" className="mt-10 border-t border-border pt-5 text-sm text-text-secondary">
            <p>Safety ratings are a framework for thinking, not financial advice.</p>
            <p>Clarity is not affiliated with any listed platform.</p>
            <p>APY data refreshes every 5 minutes from LI.FI.</p>
          </footer>
        </main>
      </div>

      <div className="hidden lg:fixed lg:inset-y-0 lg:right-0 lg:z-50 lg:block lg:w-[360px]">
        <ChatbotPanel vaults={vaults} />
      </div>
    </div>
  );
}

export default App;
