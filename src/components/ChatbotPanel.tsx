import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, RefreshCcw, Send, X } from "lucide-react";
import type { ClarityVault, RiskLabel } from "../api/earn";

const STORAGE_KEY = "clarity-chat-state-v2";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

interface InferredProfile {
  riskTolerance: "conservative" | "moderate" | "aggressive" | null;
  timeHorizon: "days" | "weeks" | "months" | "long-term" | null;
  amountRange: "<$500" | "$500-$5k" | "$5k-$50k" | "$50k+" | null;
  primaryConcern: "safety" | "liquidity" | "returns" | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  vaultIds: string[];
}

interface ChatbotPanelProps {
  vaults: ClarityVault[];
}

function buildInitialMessage(): ChatMessage {
  return {
    id: "assistant-intro",
    role: "assistant",
    text: "Tell me what matters most to you: safety, flexibility, or higher return. I’ll explain options in plain language and flag temporary bonus rates.",
    vaultIds: [],
  };
}

function createMessage(role: ChatMessage["role"], text: string, vaultIds: string[] = []): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    vaultIds,
  };
}

function inferProfile(text: string, previous: InferredProfile): InferredProfile {
  const next: InferredProfile = { ...previous };
  const lower = text.toLowerCase();

  if (/(safe|conservative|low risk|scared|protect)/.test(lower)) {
    next.riskTolerance = "conservative";
    next.primaryConcern = next.primaryConcern ?? "safety";
  } else if (/(moderate|balanced|middle)/.test(lower)) {
    next.riskTolerance = "moderate";
  } else if (/(aggressive|max|highest|riskier|high return)/.test(lower)) {
    next.riskTolerance = "aggressive";
    next.primaryConcern = next.primaryConcern ?? "returns";
  }

  if (/(withdraw|liquid|anytime|need access|emergency)/.test(lower)) {
    next.primaryConcern = "liquidity";
  }
  if (/(return|yield|higher|earn more)/.test(lower) && next.primaryConcern !== "liquidity") {
    next.primaryConcern = "returns";
  }

  if (/(today|tomorrow|few days|short term|day)/.test(lower)) {
    next.timeHorizon = "days";
  } else if (/(weeks|month or two)/.test(lower)) {
    next.timeHorizon = "weeks";
  } else if (/(months)/.test(lower)) {
    next.timeHorizon = "months";
  } else if (/(years|long term|long-term)/.test(lower)) {
    next.timeHorizon = "long-term";
  }

  const moneyMatch = lower.match(/\$?\s?(\d[\d,]*)/);
  if (moneyMatch?.[1]) {
    const amount = Number(moneyMatch[1].replaceAll(",", ""));
    if (amount < 500) {
      next.amountRange = "<$500";
    } else if (amount < 5000) {
      next.amountRange = "$500-$5k";
    } else if (amount < 50000) {
      next.amountRange = "$5k-$50k";
    } else {
      next.amountRange = "$50k+";
    }
  }

  return next;
}

function targetRisk(profile: InferredProfile): RiskLabel | null {
  if (profile.riskTolerance === "conservative") {
    return "Low Risk";
  }
  if (profile.riskTolerance === "moderate") {
    return "Moderate Risk";
  }
  if (profile.riskTolerance === "aggressive") {
    return "High Risk";
  }
  return null;
}

function recommendVaults(vaults: ClarityVault[], profile: InferredProfile): ClarityVault[] {
  const risk = targetRisk(profile);
  const candidates = vaults.filter((vault) => {
    if (risk && vault.safetyRating.label !== risk) {
      return false;
    }
    if (profile.primaryConcern === "liquidity" && vault.lockCategory !== "withdraw_anytime") {
      return false;
    }
    return true;
  });

  return [...(candidates.length > 0 ? candidates : vaults)]
    .sort((a, b) => {
      const scoreA =
        a.safetyRating.score +
        (profile.primaryConcern === "returns" ? a.headlineAPY : 0) +
        (profile.primaryConcern === "liquidity" && a.lockCategory === "withdraw_anytime" ? 2 : 0);
      const scoreB =
        b.safetyRating.score +
        (profile.primaryConcern === "returns" ? b.headlineAPY : 0) +
        (profile.primaryConcern === "liquidity" && b.lockCategory === "withdraw_anytime" ? 2 : 0);
      return scoreB - scoreA;
    })
    .slice(0, 2);
}

function buildFallbackReply(
  userInput: string,
  profile: InferredProfile,
  recommended: ClarityVault[],
): { text: string; vaultIds: string[] } {
  const lower = userInput.toLowerCase();
  const first = recommended[0];
  const second = recommended[1];

  if (!first) {
    return {
      text: "I don’t have enough live vault data right now to recommend anything safely. Please refresh once and I’ll retry with current numbers.",
      vaultIds: [],
    };
  }

  if (/(safe|risk)/.test(lower)) {
    return {
      text: `${first.plainEnglishName} looks strongest for a cautious profile. Base rate is ${first.apyBreakdown.base.toFixed(2)}%, and total shown is ${first.apyBreakdown.total.toFixed(2)}% because bonuses may be included. ${first.protocolDisplayName} is ${first.launchYearLabel.toLowerCase()} with ${first.auditCount} audits and ${first.exploitHistory === "clean" ? "a clean exploit record" : "past incidents to review carefully"}. This is not financial advice — do your own research before depositing.`,
      vaultIds: [first.id],
    };
  }

  if (/(compare|difference|which)/.test(lower) && second) {
    return {
      text: `${first.plainEnglishName} vs ${second.plainEnglishName}: the main difference is return source and withdrawal flexibility. ${first.protocolDisplayName} offers base ${first.apyBreakdown.base.toFixed(2)}% with ${first.lockLabel.toLowerCase()}, while ${second.protocolDisplayName} offers base ${second.apyBreakdown.base.toFixed(2)}% and ${second.lockLabel.toLowerCase()}. If you prioritize ${profile.primaryConcern ?? "safety"}, start with the one that matches that constraint first. This is not financial advice — do your own research before depositing.`,
      vaultIds: [first.id, second.id],
    };
  }

  return {
    text: `Based on what you shared, ${first.plainEnglishName}${second ? ` and ${second.plainEnglishName}` : ""} are the best fit right now. I’m prioritizing ${profile.primaryConcern ?? "safety and clarity"} and filtering out options that conflict with that. I can break down any one option line by line if you want. This is not financial advice — do your own research before depositing.`,
    vaultIds: second ? [first.id, second.id] : [first.id],
  };
}

function extractVaultMarkers(text: string): { cleanText: string; vaultIds: string[] } {
  const matches = [...text.matchAll(/\[VAULT_CARD:\s*([^\]]+)\]/g)].map((match) => match[1].trim());
  const cleanText = text.replace(/\[VAULT_CARD:\s*[^\]]+\]/g, "").trim();
  return { cleanText, vaultIds: matches };
}

function systemPrompt(vaults: ClarityVault[], profile: InferredProfile): string {
  const sample = vaults.slice(0, 25).map((vault) => ({
    vaultId: vault.id,
    plainEnglishName: vault.plainEnglishName,
    baseAPY: Number(vault.apyBreakdown.base.toFixed(2)),
    totalAPY: Number(vault.apyBreakdown.total.toFixed(2)),
    incentiveAPY: Number(vault.apyBreakdown.incentive.toFixed(2)),
    incentiveEndDate: vault.apyBreakdown.incentiveEndDate,
    boostAPY: Number(vault.apyBreakdown.boost.toFixed(2)),
    safetyTier: vault.safetyRating.label,
    safetyScore: vault.safetyRating.score,
    protocolAge: vault.launchYearLabel,
    withdrawal: vault.lockLabel,
    auditCount: vault.auditCount,
    exploitHistory: vault.exploitHistory,
    ilRisk: vault.apyBreakdown.ilRisk,
    tradfiAnalogy: vault.tradfiAnalogy,
  }));

  return `You are Clarity's AI advisor, a plain-language guide for people new to DeFi yield.

CURRENT VAULT DATA:
${JSON.stringify(sample)}

INFERRED USER PROFILE:
${JSON.stringify(profile)}

RULES:
- Keep responses to 3-5 sentences unless asked for more.
- Always distinguish base APY from incentive/boost APY.
- Mention temporary incentives whenever discussing safety or return.
- Never recommend a safety tier higher than the user's stated tolerance.
- Use plain language and short analogies.
- If recommending specific options, include one or two markers like [VAULT_CARD: vault-id].
- End recommendation responses with: "This is not financial advice — do your own research before depositing."
- If missing data, say so clearly and do not invent values.`;
}

async function askClaude(
  apiKey: string,
  messages: ChatMessage[],
  vaults: ClarityVault[],
  profile: InferredProfile,
): Promise<{ text: string; vaultIds: string[] }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 420,
      temperature: 0.3,
      system: systemPrompt(vaults, profile),
      messages: messages
        .slice(-8)
        .map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.text })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text =
    payload.content?.find((item) => item.type === "text")?.text ??
    "I couldn't generate a response right now. Please try again in a moment.";
  const { cleanText, vaultIds } = extractVaultMarkers(text);
  return { text: cleanText, vaultIds };
}

export function ChatbotPanel({ vaults }: ChatbotPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([buildInitialMessage()]);
  const [profile, setProfile] = useState<InferredProfile>({
    riskTolerance: null,
    timeHorizon: null,
    amountRange: null,
    primaryConcern: null,
  });

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { messages: ChatMessage[]; profile: InferredProfile };
      if (parsed.messages?.length) {
        setMessages(parsed.messages);
      }
      if (parsed.profile) {
        setProfile(parsed.profile);
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, profile }));
  }, [messages, profile]);

  const vaultById = useMemo(() => new Map(vaults.map((vault) => [vault.id, vault])), [vaults]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isThinking) {
      return;
    }

    const userMessage = createMessage("user", text);
    const nextMessages = [...messages, userMessage];
    const nextProfile = inferProfile(text, profile);

    setMessages(nextMessages);
    setProfile(nextProfile);
    setInput("");
    setIsThinking(true);

    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
      const recommended = recommendVaults(vaults, nextProfile);
      const fallback = buildFallbackReply(text, nextProfile, recommended);
      let reply = fallback;

      if (apiKey) {
        reply = await askClaude(apiKey, nextMessages, vaults, nextProfile);
        if (reply.vaultIds.length === 0) {
          reply = {
            text: reply.text,
            vaultIds: fallback.vaultIds,
          };
        }
      }

      setMessages((current) => [...current, createMessage("assistant", reply.text, reply.vaultIds)]);
    } catch {
      const recommended = recommendVaults(vaults, nextProfile);
      const fallback = buildFallbackReply(text, nextProfile, recommended);
      setMessages((current) => [...current, createMessage("assistant", fallback.text, fallback.vaultIds)]);
    } finally {
      setIsThinking(false);
    }
  }

  function handleReset() {
    const starter = buildInitialMessage();
    setMessages([starter]);
    setProfile({
      riskTolerance: null,
      timeHorizon: null,
      amountRange: null,
      primaryConcern: null,
    });
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mb-3 flex h-[76vh] w-[min(420px,92vw)] flex-col overflow-hidden rounded-[8px] border border-border bg-background-secondary shadow-hover"
          >
            <header className="flex items-center justify-between bg-bg-dark px-3 py-3 text-text-on-dark">
              <div>
                <p className="text-sm font-semibold">Clarity Advisor</p>
                <p className="text-xs opacity-80">Conversational, no quiz required</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 text-xs text-text-on-dark/90 hover:text-white"
                >
                  <RefreshCcw size={14} />
                  Start over
                </button>
                <button type="button" onClick={() => setIsOpen(false)} className="text-text-on-dark/90 hover:text-white">
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {messages.map((message) => (
                <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[85%] rounded-[8px] bg-accent px-3 py-2 text-sm text-white"
                        : "max-w-[92%] rounded-[8px] border border-border bg-white px-3 py-2 text-sm text-text-primary"
                    }
                  >
                    <p>{message.text}</p>
                    {message.vaultIds.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.vaultIds.map((vaultId) => {
                          const vault = vaultById.get(vaultId);
                          if (!vault) {
                            return null;
                          }
                          return (
                            <a
                              key={vault.id}
                              href={`#vault-${vault.id}`}
                              className="block rounded-[8px] border border-border bg-background-primary px-2 py-2 text-xs text-text-primary hover:border-accent"
                            >
                              <p className="font-semibold">{vault.plainEnglishName}</p>
                              <p>
                                Base {vault.apyBreakdown.base.toFixed(2)}% · Total {vault.apyBreakdown.total.toFixed(2)}% ·{" "}
                                {vault.safetyRating.label}
                              </p>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isThinking && <p className="text-sm text-text-secondary">Thinking...</p>}
            </div>

            <form onSubmit={handleSend} className="flex gap-2 border-t border-border bg-white p-3">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about safety, flexibility, or return..."
                className="flex-1 rounded-[8px] border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={isThinking}
                className="rounded-[8px] bg-accent px-3 py-2 text-white disabled:opacity-60"
              >
                <Send size={15} />
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-[8px] bg-accent px-4 py-3 text-sm font-semibold text-white shadow-card hover:bg-accent-hover"
      >
        <MessageCircle size={17} />
        {isOpen ? "Close Advisor" : "Open Advisor"}
      </button>
    </div>
  );
}
