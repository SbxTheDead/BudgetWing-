"use client";

import type { LegState } from "@/app/hooks/useAgent";
import { costTier, money, TIER_HEX } from "@/app/lib/format";
import { WalletIcon } from "./icons";

interface BudgetBarProps {
  budget: number;
  spent: number;
  currency?: string;
  legs: LegState[];
  passengers?: number;
  savings?: number;
  /** True while the agent is still quoting — adds the live sheen. */
  live?: boolean;
}

/** Fill runs mint → amber → coral as the envelope empties. */
function fillFor(ratio: number): string {
  if (ratio > 1) return "linear-gradient(90deg,#ef4444,#f87171)";
  if (ratio > 0.85) return "linear-gradient(90deg,#10b981,#f59e0b 55%,#ef4444)";
  if (ratio > 0.6) return "linear-gradient(90deg,#10b981,#f59e0b)";
  return "linear-gradient(90deg,#059669,#10b981 60%,#34d399)";
}

export default function BudgetBar({
  budget,
  spent,
  currency = "USD",
  legs,
  passengers = 1,
  savings = 0,
  live = false,
}: BudgetBarProps) {
  const safeBudget = budget > 0 ? budget : 0;
  const ratio = safeBudget ? spent / safeBudget : 0;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const remaining = safeBudget - spent;
  const over = remaining < 0;

  const prices = legs.map((l) => l.price ?? 0).filter((p) => p > 0);
  const maxLegPrice = prices.length ? Math.max(...prices) : 0;

  return (
    <section className="panel grain rounded-2xl p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-haze">
          <WalletIcon size={13} className="text-jet-bright" />
          Budget envelope
        </h2>
        <span className="font-data text-[10px] uppercase tracking-[0.14em] text-haze-dim">
          {legs.length} leg{legs.length === 1 ? "" : "s"}
          {passengers > 1 ? ` · ${passengers} pax` : ""}
        </span>
      </header>

      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="font-data text-[26px] leading-none text-chalk">
          {money(spent, currency)}
          <span className="pl-1.5 text-[12px] text-haze-dim">
            / {safeBudget ? money(safeBudget, currency) : "—"} spent
          </span>
        </p>
        <p className="text-right">
          <span
            className={`font-data block text-[17px] leading-none ${
              over ? "text-coral" : ratio > 0.85 ? "text-amber" : "text-mint"
            }`}
          >
            {over ? `+${money(-remaining, currency)}` : money(remaining, currency)}
          </span>
          <span className="font-data block pt-1 text-[9px] uppercase tracking-[0.18em] text-haze-dim">
            {over ? "over budget" : "remaining"}
          </span>
        </p>
      </div>

      {/* main track */}
      <div className="relative mt-3 h-3 overflow-hidden rounded-full border border-white/8 bg-ink-950/80">
        <div
          aria-hidden
          className="absolute inset-0 flex justify-between px-[25%]"
        >
          <span className="w-px bg-white/8" />
          <span className="w-px bg-white/8" />
          <span className="w-px bg-white/8" />
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Budget spent"
          className="relative h-full rounded-full transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `${pct}%`, background: fillFor(ratio) }}
        >
          {live && (
            <span className="rail-sheen absolute inset-0 rounded-full opacity-70" />
          )}
          <span
            aria-hidden
            className="absolute -right-px top-0 h-full w-1 rounded-full bg-white/85 shadow-[0_0_12px_rgba(255,255,255,0.8)]"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between font-data text-[9px] uppercase tracking-[0.16em] text-haze-dim">
        <span>{Math.round(pct)}% committed</span>
        {savings > 0 && (
          <span className="text-mint">
            optimizer saved {money(savings, currency)}
          </span>
        )}
      </div>

      {/* per-leg breakdown */}
      {legs.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-white/6 pt-3">
          {legs.map((leg, i) => {
            const price = leg.price ?? 0;
            const tier = costTier(price, prices.length ? prices : [price]);
            const width = maxLegPrice ? (price / maxLegPrice) * 100 : 12;
            const searching = leg.status === "searching";

            return (
              <div
                key={`${leg.origin}-${leg.destination}-${i}`}
                className="anim-slide-up grid grid-cols-[74px_1fr_54px] items-center gap-2"
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <span className="font-data text-[10px] tracking-[0.08em] text-haze">
                  {leg.origin}
                  <span className="px-1 text-haze-dim">›</span>
                  {leg.destination}
                </span>

                <span className="relative h-1.5 overflow-hidden rounded-full bg-ink-950/80">
                  {searching ? (
                    <span className="rail-sheen absolute inset-0 rounded-full bg-jet/25" />
                  ) : (
                    <span
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
                      style={{
                        width: `${Math.max(6, width)}%`,
                        background: TIER_HEX[tier],
                        boxShadow: `0 0 8px ${TIER_HEX[tier]}66`,
                      }}
                    />
                  )}
                </span>

                <span
                  className="font-data text-right text-[11px]"
                  style={{ color: searching ? "#64748b" : TIER_HEX[tier] }}
                >
                  {searching ? "···" : money(price, currency)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {legs.length === 0 && (
        <p className="mt-4 border-t border-white/6 pt-3 font-data text-[10px] leading-relaxed tracking-[0.06em] text-haze-dim">
          No legs priced yet. Send a budget and two or more cities to start the
          search.
        </p>
      )}
    </section>
  );
}
