/**
 * Klien Pakasir API v2 (payment_link) untuk TOP UP TOKEN saja.
 *
 * Pola diverifikasi dari ~/workspace/onerouter/bot/pakasir.py (read-only):
 * base https://app.pakasir.com/api/v2, header X-Api-Key, User-Agent
 * browser (Cloudflare memblokir UA bawaan), POST
 * /create-transaction/{slug}/{order_id} {"method":"payment_link",
 * "amount":int} -> txn_id + payment_link, GET
 * /transaction-status/{slug}/{txn_id} -> payload status + is_sandbox.
 * TIDAK ada webhook — pola yang dipakai adalah polling status.
 * TIDAK ada integrasi dana transaksi: Pakasir hanya untuk pembelian
 * token. Fungsi simulasi pembayaran TIDAK disertakan di produksi.
 *
 * Server-only: hanya diimpor dari server actions/halaman server.
 * Kredensial hanya lewat env server-only; nilai tidak pernah dicatat.
 */

const BASE = "https://app.pakasir.com/api/v2";

const PAID_STATUSES = new Set([
  "paid",
  "success",
  "settlement",
  "completed",
  "done",
  "lunas",
]);
const FAIL_STATUSES = new Set([
  "expired",
  "failed",
  "cancelled",
  "canceled",
  "rejected",
]);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export class PakasirError extends Error {}

type PakasirConfig = { slug: string; apiKey: string };

export function getPakasirConfig(): PakasirConfig | null {
  const slug = (process.env.PAKASIR_PROJECT_SLUG ?? "").trim();
  const apiKey = (process.env.PAKASIR_API_KEY ?? "").trim();
  if (!slug || !apiKey) return null;
  return { slug, apiKey };
}

export function isPakasirConfigured(): boolean {
  return getPakasirConfig() !== null;
}

async function pakasirRequest(
  config: PakasirConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<Record<string, unknown>> {
  let lastError: unknown = new PakasirError("Permintaan Pakasir gagal.");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          "X-Api-Key": config.apiKey,
          "User-Agent": USER_AGENT,
          ...(body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 429 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!response.ok) {
        throw new PakasirError(
          `Pakasir HTTP ${response.status}: ${JSON.stringify(payload)}`
        );
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (error instanceof PakasirError) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new PakasirError("Permintaan Pakasir gagal.");
}

export async function createPakasirTransaction(
  config: PakasirConfig,
  orderId: string,
  amountIdr: number
): Promise<{ txnId: string; paymentLink: string }> {
  const payload = await pakasirRequest(
    config,
    "POST",
    `/create-transaction/${encodeURIComponent(config.slug)}/${encodeURIComponent(orderId)}`,
    { method: "payment_link", amount: Math.trunc(amountIdr) }
  );
  const txnId = String(payload.txn_id ?? "").trim();
  const paymentLink = String(payload.payment_link ?? "").trim();
  if (!txnId || !paymentLink.startsWith("https://")) {
    throw new PakasirError(
      `create-transaction ditolak: ${JSON.stringify(payload)}`
    );
  }
  return { txnId, paymentLink };
}

export type PakasirStatusResult = {
  status: string;
  isSandbox: boolean;
  paid: boolean;
  failed: boolean;
};

export async function getPakasirTransactionStatus(
  config: PakasirConfig,
  txnId: string
): Promise<PakasirStatusResult> {
  const payload = await pakasirRequest(
    config,
    "GET",
    `/transaction-status/${encodeURIComponent(config.slug)}/${encodeURIComponent(txnId)}`
  );
  const status = String(payload.status ?? "").trim().toLowerCase();
  return {
    status,
    isSandbox: payload.is_sandbox === true,
    paid: PAID_STATUSES.has(status),
    failed: FAIL_STATUSES.has(status),
  };
}
