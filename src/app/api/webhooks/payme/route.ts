import { getPaymentProvider } from '@/lib/payments/registry'

/**
 * Payme Merchant API (JSON-RPC 2.0). Configure as the cashbox endpoint in the Payme Business cabinet.
 * Every response is HTTP 200; non-POST requests get error -32300.
 * Verification and processing: src/lib/payments/payme.ts (+ src/features/payments/process.ts).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return getPaymentProvider('payme').handleWebhook(request)
}

export async function GET(request: Request) {
  return getPaymentProvider('payme').handleWebhook(request)
}
