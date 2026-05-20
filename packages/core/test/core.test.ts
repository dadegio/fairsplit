import { describe, it, expect } from 'vitest';
import { allocateExpense, simplifyNetBalances } from '../src/index.js';

describe('expense allocation', () => {
  it('splits an equal expense', () => {
    const ledger = allocateExpense({
      id: 'e1', total: 60, currency: 'EUR', paidBy: [{ userId: 'alice', amount: 60 }],
      participants: [{ userId: 'alice' }, { userId: 'bob' }, { userId: 'carla' }], splitKind: 'equal'
    });
    expect(ledger).toEqual([
      { from: 'bob', to: 'alice', amount: 20, currency: 'EUR', expenseId: 'e1' },
      { from: 'carla', to: 'alice', amount: 20, currency: 'EUR', expenseId: 'e1' }
    ]);
  });

  it('simplifies balances', () => {
    const tx = simplifyNetBalances([
      { userId: 'a', amount: 50, currency: 'EUR' },
      { userId: 'b', amount: -20, currency: 'EUR' },
      { userId: 'c', amount: -30, currency: 'EUR' }
    ]);
    expect(tx.length).toBe(2);
  });
});
