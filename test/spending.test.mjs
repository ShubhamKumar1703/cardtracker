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

describe('AU Bank Kiwi RuPay Email Parsing', () => {
  it('correctly parses AU Bank transaction alert', async () => {
    const { parseTransactionAlert } = await import('../src/lib/parser');
    const email = 'INR 1,067.38 were spent on your AU Bank Credit Card xx1614 at UPI/LULU INTERNATIONAL on 05-10-2026 at 08:36:58 pm. Click to know the available balance https://app.aubank.in/oBF3/fmdawo0p';
    const parsed = await parseTransactionAlert(email);

    assert.strictEqual(parsed.amount, 1067.38);
    assert.strictEqual(parsed.instrument_hint, 'Kiwi RuPay Card');
    assert.strictEqual(parsed.rail, 'UPI');
    assert.strictEqual(parsed.merchant_normalized, 'LULU INTERNATIONAL');
    assert.strictEqual(parsed.type, 'DEBIT');
  });
});

describe('Axis Bank Direct UPI Email Parsing', () => {
  it('correctly parses Axis Bank savings account UPI debit alert', async () => {
    const { parseTransactionAlert } = await import('../src/lib/parser');
    const email = `AXIS BANK
05-10-2026
Dear Shubham Kumar,
Here's the summary of your transaction:
Amount Debited:
INR 314.00
Account Number:
XX8460
Date & Time:
05-10-26, 09:58:06 IST
Transaction Info:
UPI/P2A/664418444207/Mr Aman Tripathi
If this transaction was not initiated by you:
To block UPI:
Always open to help you.
Regards,
Axis Bank Ltd.`;

    const parsed = await parseTransactionAlert(email);
    assert.strictEqual(parsed.amount, 314.00);
    assert.strictEqual(parsed.bank_reference_id, '664418444207');
    assert.strictEqual(parsed.merchant_normalized, 'Aman Tripathi');
    assert.strictEqual(parsed.instrument_hint, 'Bank Account UPI');
    assert.strictEqual(parsed.rail, 'UPI');
    assert.strictEqual(parsed.type, 'DEBIT');
  });
});

describe('Axis Bank Credit Card Email Parsing', () => {
  it('correctly parses Axis Bank credit card transaction with Merchant Name', async () => {
    const { parseTransactionAlert } = await import('../src/lib/parser');
    const email = `Here's the summary of your Axis Bank Credit Card Transaction:
	
Transaction Amount:
INR 99
	
Merchant Name:
CRED Store
	
Axis Bank Credit Card No.
XX3861
	
Date & Time:
05-10-2026, 19:07:50 IST
	
Available Limit*:
INR 113701.42
	
Total Credit Limit*:
INR 123000
*The information above includes the available and total credit limit across all of your Axis Bank credit cards.
If this transaction was not intiated by you:
SMS BLOCK 3861 to +919951860002
Always open to help you.
Regards,
Axis Bank Ltd.`;

    const parsed = await parseTransactionAlert(email);
    assert.strictEqual(parsed.amount, 99);
    assert.strictEqual(parsed.merchant_normalized, 'CRED Store');
    assert.strictEqual(parsed.instrument_hint, 'Axis Credit Card');
    assert.strictEqual(parsed.rail, 'CARD');
    assert.strictEqual(parsed.type, 'DEBIT');
  });
});


