import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env.local without third-party dependencies
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const k = trimmed.substring(0, idx).trim();
      const v = trimmed.substring(idx + 1).trim();
      process.env[k] = v;
    }
  }
}

const PORT = 3008; // Dedicated test port
const BASE_URL = `http://localhost:${PORT}`;
const INGESTION_TOKEN = process.env.INGESTION_SECRET_TOKEN || '48925071aef63cdb';

let serverProcess = null;

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/metadata`);
      if (res.status === 200) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`Server failed to start at ${url} within ${timeoutMs}ms`);
}

describe('Google Apps Script & Ingestion API Integration Tests', () => {
  before(async () => {
    serverProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      shell: true,
    });

    await waitForServer(BASE_URL);
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGKILL');
    }
  });

  it('rejects requests with missing Authorization header (401)', async () => {
    const res = await fetch(`${BASE_URL}/api/ingest/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: 'Spent INR 100 at SWIGGY on Axis Neo' }),
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /Unauthorized/);
  });

  it('rejects requests with invalid Bearer token (401)', async () => {
    const res = await fetch(`${BASE_URL}/api/ingest/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_secret_token_xyz',
      },
      body: JSON.stringify({ rawText: 'Spent INR 100 at SWIGGY on Axis Neo' }),
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /Unauthorized/);
  });

  it('rejects requests with missing email body or rawText (400)', async () => {
    const res = await fetch(`${BASE_URL}/api/ingest/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INGESTION_TOKEN}`,
      },
      body: JSON.stringify({ messageId: 'msg-without-content' }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Missing required email content/);
  });

  it('successfully ingests valid bank alert email with Bearer token', async () => {
    const uniqueRef = `MIG${Date.now()}`;
    const testMessageId = `gmail-msg-${Date.now()}`;
    const randomAmt = 1000 + Math.floor(Math.random() * 5000);
    const rawAlert = `Your Axis Bank Credit Card XX1234 has been debited for INR ${randomAmt}.00 at ZOMATO on 06-10-2026. Ref: ${uniqueRef}`;

    const res = await fetch(`${BASE_URL}/api/ingest/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INGESTION_TOKEN}`,
      },
      body: JSON.stringify({
        messageId: testMessageId,
        date: new Date().toISOString(),
        subject: 'Transaction Alert',
        rawText: rawAlert,
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.action === 'INSERTED' || data.action === 'FLAGGED_DUPLICATE');
    assert.ok(data.transactionId);
  });

  it('safely handles repeated message_id with Tier 2 idempotency (200 OK + DISCARDED_TIER2)', async () => {
    const staticMessageId = `gmail-no-ref-${Date.now()}`;
    const randomAmt = 6000 + Math.floor(Math.random() * 3000);
    // Alert without bank reference number so Tier 1 is skipped and Tier 2 handles idempotency
    const alertBody = `Spent INR ${randomAmt} at BLUE TOKAI COFFEE on Kiwi RuPay UPI`;

    // First ingestion: should insert
    const res1 = await fetch(`${BASE_URL}/api/ingest/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INGESTION_TOKEN}`,
      },
      body: JSON.stringify({
        messageId: staticMessageId,
        rawText: alertBody,
      }),
    });

    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);
    assert.ok(data1.action === 'INSERTED' || data1.action === 'FLAGGED_DUPLICATE');

    // Second ingestion with identical message_id (Apps Script retry / duplicate poll)
    const res2 = await fetch(`${BASE_URL}/api/ingest/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INGESTION_TOKEN}`,
      },
      body: JSON.stringify({
        messageId: staticMessageId,
        rawText: alertBody,
      }),
    });

    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.success, true);
    assert.strictEqual(data2.action, 'DISCARDED_TIER2');
    assert.match(data2.reason, /Tier 2 duplicate/);
  });

  it('safely handles repeated bank_reference_id with Tier 1 idempotency (200 OK + DISCARDED_TIER1)', async () => {
    const fixedRef = `UTR${Date.now()}`;
    const randomAmt = 9000 + Math.floor(Math.random() * 1000);
    const alertBody = `Spent INR ${randomAmt} at SHELL PETROL on Kiwi UPI. Ref: ${fixedRef}`;

    // First call
    const res1 = await fetch(`${BASE_URL}/api/ingest/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INGESTION_TOKEN}`,
      },
      body: JSON.stringify({
        messageId: `msg-a-${Date.now()}`,
        rawText: alertBody,
      }),
    });

    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.success, true);

    // Second call with different messageId but same UTR / bank reference
    const res2 = await fetch(`${BASE_URL}/api/ingest/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INGESTION_TOKEN}`,
      },
      body: JSON.stringify({
        messageId: `msg-b-${Date.now()}`,
        rawText: alertBody,
      }),
    });

    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.success, true);
    assert.strictEqual(data2.action, 'DISCARDED_TIER1');
    assert.match(data2.reason, /Tier 1 duplicate/);
  });
});
