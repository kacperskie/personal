import {
  calculateBudgetPace,
  calculateProjectedMonthEndBalance,
  calculateSafeToSpend,
} from "@/lib/finance";

export type Tone = "good" | "neutral" | "warning" | "risk";

export type BudgetCategory = {
  category: string;
  budget: number;
  spent: number;
  remaining: number;
  forecast: number;
  paceRatio: number;
  status: string;
  tone: Tone;
};

const elapsedBudgetPeriodRatio = 0.62;

const cashPosition = {
  availableCash: 3420.7,
  upcomingBillsBeforePayday: 1280.4,
  plannedSavingsBeforePayday: 400,
  debtPaymentsBeforePayday: 160,
  minimumBuffer: 350,
  reservedGoalContributions: 250,
};

export const dashboardSummary = {
  currentCash: cashPosition.availableCash,
  safeToSpend: calculateSafeToSpend(cashPosition),
  billsDueBeforePayday: cashPosition.upcomingBillsBeforePayday,
  monthlyIncome: 4650,
  monthlySpending: 2875.4,
  projectedMonthEndBalance: calculateProjectedMonthEndBalance({
    currentCash: cashPosition.availableCash,
    expectedIncome: 1450,
    plannedOutflows:
      cashPosition.upcomingBillsBeforePayday +
      cashPosition.plannedSavingsBeforePayday +
      cashPosition.debtPaymentsBeforePayday +
      cashPosition.reservedGoalContributions +
      920,
  }),
  nextPayday: "25 Jul 2026",
  budgetStatus: "Mostly on track",
};

const budgetSeed = [
  { category: "Groceries", budget: 460, spent: 318, forecast: 470 },
  { category: "Eating out", budget: 180, spent: 156, forecast: 238 },
  { category: "Transport", budget: 240, spent: 92, forecast: 154 },
  { category: "Home bills", budget: 1220, spent: 980, forecast: 1280 },
  { category: "Personal", budget: 260, spent: 218, forecast: 318 },
];

const toneByStatus: Record<string, Tone> = {
  "under pace": "good",
  "on pace": "neutral",
  high: "warning",
  risk: "risk",
};

export const budgetHealth: BudgetCategory[] = budgetSeed.map((budget) => {
  const pace = calculateBudgetPace(
    budget.spent,
    budget.budget,
    elapsedBudgetPeriodRatio,
  );

  return {
    ...budget,
    remaining: budget.budget - budget.spent,
    paceRatio: pace.paceRatio,
    status: pace.status,
    tone: toneByStatus[pace.status],
  };
});

export const upcomingBills = [
  {
    name: "Rent",
    dueDate: "1 Jul",
    amount: 950,
    type: "Essential bill",
  },
  {
    name: "Council tax",
    dueDate: "5 Jul",
    amount: 168,
    type: "Essential bill",
  },
  {
    name: "Mobile",
    dueDate: "8 Jul",
    amount: 28.4,
    type: "Subscription",
  },
  {
    name: "Credit card minimum",
    dueDate: "12 Jul",
    amount: 134,
    type: "Debt payment",
  },
];

export const mockTransactions = [
  {
    id: "txn-001",
    date: "28 Jun",
    account: "Mock current account",
    merchant: "Northside Grocers",
    description: "Weekly food shop",
    amount: -64.2,
    category: "Groceries",
    status: "Reviewed",
    tone: "good" as const,
  },
  {
    id: "txn-002",
    date: "27 Jun",
    account: "Mock credit card",
    merchant: "City Lunch Bar",
    description: "Lunch and coffee",
    amount: -18.5,
    category: "Eating out",
    status: "Ahead of pace",
    tone: "warning" as const,
  },
  {
    id: "txn-003",
    date: "26 Jun",
    account: "Mock current account",
    merchant: "Monthly Salary",
    description: "Regular income",
    amount: 2850,
    category: "Income",
    status: "Reviewed",
    tone: "good" as const,
  },
  {
    id: "txn-004",
    date: "25 Jun",
    account: "Mock current account",
    merchant: "Local Energy",
    description: "Direct Debit",
    amount: -118,
    category: "Home bills",
    status: "Recurring",
    tone: "neutral" as const,
  },
  {
    id: "txn-005",
    date: "24 Jun",
    account: "Mock credit card",
    merchant: "Online Homeware",
    description: "Household items",
    amount: -42.9,
    category: "Personal",
    status: "Needs review",
    tone: "warning" as const,
  },
];

export const recurringPayments = [
  {
    id: "rec-001",
    name: "Rent",
    type: "Essential bill",
    cadence: "Monthly",
    nextDue: "1 Jul",
    amount: 950,
    status: "Confirmed",
    tone: "good" as const,
  },
  {
    id: "rec-002",
    name: "Council tax",
    type: "Essential bill",
    cadence: "Monthly",
    nextDue: "5 Jul",
    amount: 168,
    status: "Confirmed",
    tone: "good" as const,
  },
  {
    id: "rec-003",
    name: "Streaming bundle",
    type: "Subscription",
    cadence: "Monthly",
    nextDue: "9 Jul",
    amount: 18.99,
    status: "Review price",
    tone: "warning" as const,
  },
  {
    id: "rec-004",
    name: "Gym membership",
    type: "Subscription",
    cadence: "Monthly",
    nextDue: "14 Jul",
    amount: 34,
    status: "Confirmed",
    tone: "neutral" as const,
  },
  {
    id: "rec-005",
    name: "Credit card minimum",
    type: "Debt payment",
    cadence: "Monthly",
    nextDue: "12 Jul",
    amount: 134,
    status: "Confirmed",
    tone: "neutral" as const,
  },
  {
    id: "rec-006",
    name: "Magazine renewal",
    type: "Subscription",
    cadence: "Annual",
    nextDue: "21 Jul",
    amount: 72,
    status: "Needs review",
    tone: "warning" as const,
  },
];

export const savingsGoals = [
  {
    id: "goal-001",
    name: "Emergency fund",
    targetAmount: 5000,
    currentAmount: 2140,
    targetDate: "31 Dec 2026",
    priority: "High",
    suggestedMonthlyContribution: 410,
  },
  {
    id: "goal-002",
    name: "Holiday pot",
    targetAmount: 1200,
    currentAmount: 520,
    targetDate: "30 Sep 2026",
    priority: "Medium",
    suggestedMonthlyContribution: 227,
  },
  {
    id: "goal-003",
    name: "Home buffer",
    targetAmount: 900,
    currentAmount: 275,
    targetDate: "30 Nov 2026",
    priority: "Medium",
    suggestedMonthlyContribution: 125,
  },
];
