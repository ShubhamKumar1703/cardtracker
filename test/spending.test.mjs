import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateNetConfirmedSpend, formatINR } from '../src/lib/utils';
import { generateFingerprint, roundTo15Minutes } from '../src/lib/parser';

describe('Authoritative Spending Calculation Contract', () => {
  it('DEBIT + CONFIRMED adds to spending', () => {
    const txs = [{ amount: 500, type: 'DEBIT', status: 'CONFIRMED' }];
    assert.strictEqual(calculateNetConfirmedSpend(txs), 500);
  });

  it('REFUND + CONFIRMED subtracts from spending', () => {
    const txs = [
      { amount: 1000, type: 'DEBIT', status: 'CONFIRMED' },
      { amount: 200, type: 'REFUND', status: 'CONFIRMED' },
    ];
    assert.strictEqual(calculateNetConfirmedSpend(txs), 800);
  });

  it('TRANSFER is completely excluded', () => {
    const txs = [
      { amount: 500, type: 'DEBIT', status: 'CONFIRMED' },
      { amount: 15000, type: 'TRANSFER', status: 'CONFIRMED' },
    ];
    assert.strictEqual(calculateNetConfirmedSpend(txs), 500);
  });

  it('EXCLUDED and PENDING_REVIEW are excluded from net spend', () => {
    const txs = [
      { amount: 500, type: 'DEBIT', status: 'CONFIRMED' },
      { amount: 750, type: 'DEBIT', status: 'PENDING_REVIEW' },
      { amount: 300, type: 'DEBIT', status: 'EXCLUDED' },
    ];
    assert.strictEqual(calculateNetConfirmedSpend(txs), 500);
  });
});

describe('Tier 3 Idempotency Fingerprint', () => {
  it('generates deterministic fingerprint within 15min window', () => {
    const t1 = new Date('2026-10-05T12:05:00Z');
    const t2 = new Date('2026-10-05T12:07:00Z');
    
    const fp1 = generateFingerprint(250, 'SWIGGY', t1);
    const fp2 = generateFingerprint(250, 'SWIGGY', t2);
    assert.strictEqual(fp1, fp2);
  });
});
