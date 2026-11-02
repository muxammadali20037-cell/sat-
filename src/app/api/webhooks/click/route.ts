import { getPaymentProvider } from '@/lib/payments/registry'

/**
 * Click Shop API Prepare (action=0) / Complete (action=1) callbacks — form-encoded POST.
 * Configure in the Click merchant cabinet as both the Prepare and Complete URL.
 * Verification and processing: src/lib/payments/click.ts (+ src/features/payments/process.ts).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return getPaymentProvider('click').handleWebhook(request)
}
