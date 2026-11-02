import { getPaymentProvider } from '@/lib/payments/registry'

/**
 * Development-only simulated provider. 404 unless PAYMENTS_TEST_MODE=true and NODE_ENV !== 'production'.
 * Verification and processing: src/lib/payments/test.ts (+ src/features/payments/process.ts).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return getPaymentProvider('test').handleWebhook(request)
}
