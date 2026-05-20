import { allocateExpense, mergeLedgers, simplifyNetBalances, summarizeLedger, type LedgerEntry } from '@fairsplit/core';
import type { Expense, ExpensePayer, ExpenseSplit, Settlement } from '@prisma/client';
import { money } from './db.js';

type ExpenseFull = Expense & { payers: ExpensePayer[]; splits: ExpenseSplit[] };

export function expenseToLedger(e: ExpenseFull): LedgerEntry[] {
  return allocateExpense({
    id: e.id,
    total: money(e.total),
    currency: e.currency,
    paidBy: e.payers.map(p => ({ userId: p.userId, amount: money(p.amount) })),
    participants: e.splits.map(s => ({ userId: s.userId, value: money(s.amount) })),
    splitKind: 'exact'
  });
}

export function settlementToLedger(s: Settlement): LedgerEntry {
  // A settlement reduces debt: if A pays B, represent as B owing A negative via ledger net by reversing economic credit.
  return { from: s.toUserId, to: s.fromUserId, amount: money(s.amount), currency: s.currency };
}

export function calculateSimplified(expenses: ExpenseFull[], settlements: Settlement[], simplify = true) {
  const raw = [...expenses.flatMap(expenseToLedger), ...settlements.map(settlementToLedger)];
  const merged = mergeLedgers(raw);
  if (!simplify) return merged;
  return simplifyNetBalances(summarizeLedger(merged));
}
