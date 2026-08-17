"use client";

import type { LegState } from "@/app/hooks/useAgent";
import { costTier, money, TIER_HEX } from "@/app/lib/format";

interface BudgetBarProps {
  budget: number;
  spent: number;
  currency?: string;
  legs: LegState[];
  passengers?: number;
  savings?: number;
  /** True while the agent is still quoting — adds a gentle live sheen. */
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
    <section className="glass rounded-[24px] p-5">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-white/85">Budget</h2>
        <span className="num text-[11px] text-white/35">
          {legs.length} leg{legs.length === 1 ? "" : "s"}
          {passengers > 1 ? ` · ${passengers} pax` : ""}
        </span>
      </header>

      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="num text-[30px] leading-none font-semibold tracking-tight text-white">
          {money(spent, currency)}
          <span className="pl-2 text-[13px] font-normal text-white/35">
            of {safeBudget ? money(safeBudget, currency) : "—"}
          </span>
        </p>
        <p className="text-right">
          <span
            className={`num block text-[18px] font-medium leading-none ${
              over ? "text-coral" : ratio > 0.85 ? "text-amber" : "text-mint"
            }`}
          >
            {over ? `+${money(-remaining, currency)}` : money(remaining, currency)}
          </span>
          <span className="block pt-1 text-[10px] uppercase tracking-wider text-white/35">
            {over ? "over budget" : "remaining"}
          </span>
        </p>
      </div>

      {/* main gauge */}
      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/8">
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
            <span className="thinking-pill absolute inset-0 rounded-full opacity-70" />
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-white/35">
        <span className="num">{Math.round(pct)}% committed</span>
        {savings > 0 && (
          <span className="num text-mint">
            Optimizer saved {money(savings, currency)}
          </span>
        )}
      </div>

      {/* per-leg breakdown */}
      {legs.length > 0 && (
        <div className="mt-5 space-y-2.5 border-t border-white/8 pt-4">
          {legs.map((leg, i) => {
            const price = leg.price ?? 0;
            const tier = costTier(price, prices.length ? prices : [price]);
            const width = maxLegPrice ? (price / maxLegPrice) * 100 : 12;
            const searching = leg.status === "searching";

            return (
              <div
                key={`${leg.origin}-${leg.destination}-${i}`}
                className="anim-rise grid grid-cols-[78px_1fr_58px] items-center gap-3"
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <span className="num text-[11px] text-white/60">
                  {leg.origin}
                  <span className="px-1 text-white/25">›</span>
                  {leg.destination}
                </span>

                <span className="relative h-[3px] overflow-hidden rounded-full bg-white/8">
                  {searching ? (
                    <span className="shimmer absolute inset-0 rounded-full" />
                  ) : (
                    <span
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
                      style={{
                        width: `${Math.max(6, width)}%`,
                        background: TIER_HEX[tier],
                      }}
                    />
                  )}
                </span>

                <span
                  className="num text-right text-[11.5px]"
                  style={{ color: searching ? "rgba(255,255,255,0.3)" : TIER_HEX[tier] }}
                >
                  {searching ? "···" : money(price, currency)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {legs.length === 0 && (
        <p className="mt-5 border-t border-white/8 pt-4 text-[12px] leading-relaxed text-white/35">
          No legs priced yet. Send a budget and two or more cities to start the
          search.
        </p>
      )}
    </section>
  );
}
