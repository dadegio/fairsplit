export type ID = string;
export type Currency = string;

export type SplitKind = 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment';

export interface ParticipantInput {
  userId: ID;
  value?: number;
}

export interface PaymentInput {
  userId: ID;
  amount: number;
}

export interface ExpenseInput {
  id: ID;
  total: number;
  currency: Currency;
  paidBy: PaymentInput[];
  participants: ParticipantInput[];
  splitKind: SplitKind;
}

export interface LedgerEntry {
  from: ID;
  to: ID;
  amount: number;
  currency: Currency;
  expenseId?: ID;
}

export interface Balance {
  userId: ID;
  amount: number;
  currency: Currency;
}

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function allocateExpense(input: ExpenseInput): LedgerEntry[] {
  if (input.total <= 0) throw new Error('Expense total must be positive');
  if (!input.participants.length) throw new Error('Expense must have participants');
  const paidTotal = round(input.paidBy.reduce((s, p) => s + p.amount, 0));
  if (paidTotal !== round(input.total)) throw new Error(`Paid amount ${paidTotal} must equal total ${input.total}`);

  const owed = calculateOwed(input);
  const net = new Map<ID, number>();
  for (const p of input.paidBy) net.set(p.userId, round((net.get(p.userId) ?? 0) + p.amount));
  for (const [userId, amount] of owed) net.set(userId, round((net.get(userId) ?? 0) - amount));

  return simplifyNetBalances(
    Array.from(net, ([userId, amount]) => ({ userId, amount, currency: input.currency })),
    input.id
  );
}

export function calculateOwed(input: ExpenseInput): Map<ID, number> {
  const p = input.participants;
  let owed: [ID, number][];
  switch (input.splitKind) {
    case 'equal': {
      const base = Math.floor((input.total / p.length) * 100) / 100;
      let remaining = round(input.total - base * p.length);
      owed = p.map((x, i) => [x.userId, round(base + (remaining >= 0.01 && i < Math.round(remaining * 100) ? 0.01 : 0))]);
      break;
    }
    case 'exact':
    case 'adjustment': {
      owed = p.map(x => [x.userId, round(x.value ?? 0)]);
      break;
    }
    case 'percentage': {
      const totalPct = round(p.reduce((s, x) => s + (x.value ?? 0), 0));
      if (totalPct !== 100) throw new Error('Percentages must add to 100');
      owed = p.map(x => [x.userId, round(input.total * ((x.value ?? 0) / 100))]);
      normalizeRounding(owed, input.total);
      break;
    }
    case 'shares': {
      const shares = p.reduce((s, x) => s + (x.value ?? 0), 0);
      if (shares <= 0) throw new Error('Shares must be positive');
      owed = p.map(x => [x.userId, round(input.total * ((x.value ?? 0) / shares))]);
      normalizeRounding(owed, input.total);
      break;
    }
  }
  const sum = round(owed.reduce((s, [, a]) => s + a, 0));
  if (sum !== round(input.total)) throw new Error(`Split adds to ${sum}, expected ${input.total}`);
  return new Map(owed);
}

function normalizeRounding(rows: [ID, number][], total: number) {
  let diff = round(total - rows.reduce((s, [, a]) => s + a, 0));
  let i = 0;
  while (Math.abs(diff) >= 0.01 && rows.length) {
    rows[i % rows.length][1] = round(rows[i % rows.length][1] + Math.sign(diff) * 0.01);
    diff = round(total - rows.reduce((s, [, a]) => s + a, 0));
    i++;
  }
}

export function summarizeLedger(entries: LedgerEntry[]): Balance[] {
  const map = new Map<string, Balance>();
  for (const e of entries) {
    const fk = `${e.from}:${e.currency}`;
    const tk = `${e.to}:${e.currency}`;
    map.set(fk, { userId: e.from, currency: e.currency, amount: round((map.get(fk)?.amount ?? 0) - e.amount) });
    map.set(tk, { userId: e.to, currency: e.currency, amount: round((map.get(tk)?.amount ?? 0) + e.amount) });
  }
  return Array.from(map.values()).filter(b => Math.abs(b.amount) >= 0.01);
}

export function simplifyNetBalances(balances: Balance[], expenseId?: ID): LedgerEntry[] {
  const byCurrency = new Map<Currency, Balance[]>();
  for (const b of balances) byCurrency.set(b.currency, [...(byCurrency.get(b.currency) ?? []), { ...b, amount: round(b.amount) }]);
  const result: LedgerEntry[] = [];
  for (const [currency, rows] of byCurrency) {
    const debtors = rows.filter(b => b.amount < -0.009).map(b => ({ ...b, amount: round(-b.amount) })).sort((a,b)=>b.amount-a.amount);
    const creditors = rows.filter(b => b.amount > 0.009).sort((a,b)=>b.amount-a.amount);
    let i=0, j=0;
    while (i < debtors.length && j < creditors.length) {
      const amount = round(Math.min(debtors[i].amount, creditors[j].amount));
      if (amount >= 0.01) result.push({ from: debtors[i].userId, to: creditors[j].userId, amount, currency, expenseId });
      debtors[i].amount = round(debtors[i].amount - amount);
      creditors[j].amount = round(creditors[j].amount - amount);
      if (debtors[i].amount < 0.01) i++;
      if (creditors[j].amount < 0.01) j++;
    }
  }
  return result;
}

export function mergeLedgers(entries: LedgerEntry[]): LedgerEntry[] {
  const map = new Map<string, LedgerEntry>();
  for (const e of entries) {
    const key = [e.from, e.to, e.currency].join(':');
    const rev = [e.to, e.from, e.currency].join(':');
    if (map.has(rev)) {
      const r = map.get(rev)!;
      const diff = round(r.amount - e.amount);
      if (diff > 0) r.amount = diff;
      else if (diff < 0) { map.delete(rev); map.set(key, { ...e, amount: -diff }); }
      else map.delete(rev);
    } else {
      map.set(key, { ...e, amount: round((map.get(key)?.amount ?? 0) + e.amount) });
    }
  }
  return Array.from(map.values()).filter(e => e.amount >= 0.01);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}
