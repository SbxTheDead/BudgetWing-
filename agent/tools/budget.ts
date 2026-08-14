/**
 * Budget tracking for a planning run: what has been committed to legs, what is
 * left, and how much each remaining leg may cost.
 */

export interface BudgetLine {
  description: string;
  amount: number;
}

export interface BudgetSummary {
  total: number;
  spent: number;
  remaining: number;
  currency: string;
  legs: BudgetLine[];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export class BudgetTracker {
  private readonly lines: BudgetLine[] = [];
  private plannedLegs: number;

  constructor(
    readonly totalBudget: number,
    readonly currency: string,
    /** Legs the trip is expected to need; drives `estimatePerLeg`. */
    plannedLegs = 0,
  ) {
    this.plannedLegs = Math.max(0, plannedLegs);
  }

  /** Update the leg count once the city ordering is known. */
  setPlannedLegs(count: number): void {
    this.plannedLegs = Math.max(0, count);
  }

  /**
   * Commit `amount` to the plan. Returns false — and records nothing — when the
   * spend would break the budget, so callers can look for a cheaper option.
   */
  spend(amount: number, description: string): boolean {
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (!this.canAfford(amount)) return false;
    this.lines.push({ description, amount: round(amount) });
    return true;
  }

  getRemaining(): number {
    return round(this.totalBudget - this.getSpent());
  }

  getSpent(): number {
    return round(this.lines.reduce((sum, line) => sum + line.amount, 0));
  }

  canAfford(amount: number): boolean {
    // Half a cent of slack absorbs floating-point noise on summed fares.
    return amount <= this.getRemaining() + 0.005;
  }

  /** Spending allowance for each leg that has not been priced yet. */
  estimatePerLeg(): number {
    const unbooked = Math.max(1, this.plannedLegs - this.lines.length);
    return round(this.getRemaining() / unbooked);
  }

  getSummary(): BudgetSummary {
    return {
      total: round(this.totalBudget),
      spent: this.getSpent(),
      remaining: this.getRemaining(),
      currency: this.currency,
      legs: [...this.lines],
    };
  }

  /** Forget every committed leg, keeping the total budget (used when replanning). */
  reset(): void {
    this.lines.length = 0;
  }
}

/** "$1,240" / "1,240 THB" — falls back gracefully on unknown currency codes. */
export function formatCurrency(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    }).format(rounded);
  } catch {
    return `${rounded.toLocaleString("en-US")} ${currency.toUpperCase()}`;
  }
}

/**
 * Pad a quoted price so a fare that drifts between search and booking still
 * fits the plan. Defaults to 5%, which covers typical LCC repricing.
 */
export function calculateTotalWithBuffer(
  price: number,
  bufferPercent = 5,
): number {
  return round(price * (1 + bufferPercent / 100));
}
