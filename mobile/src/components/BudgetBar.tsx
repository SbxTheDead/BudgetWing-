import { money } from "../lib/format";

interface BudgetBarProps {
  budget: number;
  spent: number;
  currency?: string;
}

/**
 * Budget burn gauge. Fill color shifts mint → amber → coral as spend
 * approaches and then exceeds the budget. Width animates via CSS transition.
 */
export default function BudgetBar({ budget, spent, currency = "USD" }: BudgetBarProps) {
  if (!budget) return null;

  const ratio = Math.max(0, spent / budget);
  const pct = Math.min(ratio, 1) * 100;
  const remaining = budget - spent;

  const tone = ratio >= 1 ? "over" : ratio > 0.85 ? "hot" : ratio > 0.6 ? "warm" : "cool";

  return (
    <div className={`budget budget--${tone}`} role="meter" aria-valuenow={Math.round(spent)} aria-valuemin={0} aria-valuemax={budget}>
      <div className="budget__row">
        <span className="budget__label">Budget</span>
        <span className="budget__figures">
          <strong>{money(spent, currency)}</strong>
          <em>/ {money(budget, currency)}</em>
        </span>
        <span className={`budget__delta${remaining < 0 ? " budget__delta--bad" : ""}`}>
          {remaining < 0
            ? `+${money(-remaining, currency)} over`
            : `${money(remaining, currency)} left`}
        </span>
      </div>
      <div className="budget__track">
        <div className="budget__fill" style={{ width: `${pct}%` }} />
        <div className="budget__ticks" aria-hidden="true">
          <i /><i /><i />
        </div>
      </div>
    </div>
  );
}
