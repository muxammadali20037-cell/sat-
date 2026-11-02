import { getPaymentProvider } from '@/lib/payments/registry'

/**
 * Stripe webhook endpoint (signature verified with STRIPE_WEBHOOK_SECRET over the raw body).
 * Verification and processing: src/lib/payments/stripe.ts (+ src/features/payments/process.ts).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return getPaymentProvider('stripe').handleWebhook(request)
}
