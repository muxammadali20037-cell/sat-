import 'server-only'
import { NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'
import { buildClickCheckoutUrl, handleClickCallback, type ClickConfig } from './click'
import { buildPaymeCheckoutUrl, handlePaymeRequest, paymeNotPostResponse, type PaymeConfig } from './payme'
import { createStripeCheckoutSession, handleStripeWebhook, stripeClient, type StripeConfig } from './stripe'
import { handleTestWebhook, isTestProviderEnabled, TEST_SIGNATURE_HEADER } from './test-provider'
import { clickRepository, paymeRepository, stripeRepository, testRepository } from '@/features/payments/repository'
import type { PaymentProvider, ProviderId } from './types'

/**
 * Provider registry. Configuration is read from server env on every call (cheap; serverEnv()
 * is cached). A provider without credentials reports isConfigured() = false: the UI hides it and
 * the APIs answer 503 PROVIDER_NOT_CONFIGURED.
 */

export function clickConfig(): ClickConfig | null {
  const e = serverEnv()
  if (!e.CLICK_SERVICE_ID || !e.CLICK_MERCHANT_ID || !e.CLICK_SECRET_KEY) return null
  return { serviceId: e.CLICK_SERVICE_ID, merchantId: e.CLICK_MERCHANT_ID, secretKey: e.CLICK_SECRET_KEY, merchantUserId: e.CLICK_MERCHANT_USER_ID ?? null }
}

export function paymeConfig(): PaymeConfig | null {
  const e = serverEnv()
  const testMode = e.PAYME_TEST_MODE === 'true'
  const key = testMode ? e.PAYME_TEST_KEY : e.PAYME_KEY
  if (!e.PAYME_MERCHANT_ID || !key) return null
  return { merchantId: e.PAYME_MERCHANT_ID, key, testMode }
}

export function stripeConfig(): StripeConfig | null {
  const e = serverEnv()
  if (!e.STRIPE_SECRET_KEY || !e.STRIPE_WEBHOOK_SECRET) return null
  return { secretKey: e.STRIPE_SECRET_KEY, webhookSecret: e.STRIPE_WEBHOOK_SECRET }
}

export function testProviderSecret(): string | null {
  const e = serverEnv()
  return isTestProviderEnabled(e) ? (e.PAYMENTS_TEST_WEBHOOK_SECRET ?? null) : null
}

const notConfigured = () =>
  NextResponse.json(
    { error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'This payment provider is not configured for this deployment.' } },
    { status: 503 },
  )

const noStore = { 'Cache-Control': 'no-store' }

const click: PaymentProvider = {
  id: 'click',
  label: 'Click',
  currencies: ['UZS'],
  isConfigured: () => clickConfig() !== null,
  async createCheckout({ payment, returnUrl }) {
    const config = clickConfig()
    if (!config) throw new Error('Click is not configured')
    return { redirectUrl: buildClickCheckoutUrl(config, { amountMinor: payment.amountMinor, orderNumber: payment.number, returnUrl }) }
  },
  async handleWebhook(request) {
    const config = clickConfig()
    if (!config) return notConfigured()
    let params: URLSearchParams
    try {
      const contentType = request.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const json = (await request.json()) as Record<string, unknown>
        params = new URLSearchParams(Object.entries(json).map(([k, v]) => [k, String(v)]))
      } else {
        params = new URLSearchParams(await request.text())
      }
    } catch {
      params = new URLSearchParams()
    }
    const body = await handleClickCallback(params, { config, repo: clickRepository })
    return NextResponse.json(body, { headers: noStore })
  },
}

const payme: PaymentProvider = {
  id: 'payme',
  label: 'Payme',
  currencies: ['UZS'],
  isConfigured: () => paymeConfig() !== null,
  async createCheckout({ payment, user, returnUrl }) {
    const config = paymeConfig()
    if (!config) throw new Error('Payme is not configured')
    return {
      redirectUrl: buildPaymeCheckoutUrl(config, { amountMinor: payment.amountMinor, orderNumber: payment.number, returnUrl, locale: user.locale }),
    }
  },
  async handleWebhook(request) {
    const config = paymeConfig()
    if (!config) return notConfigured()
    // Payme treats any non-200 status as -32400, so every answer is HTTP 200.
    if (request.method !== 'POST') return NextResponse.json(paymeNotPostResponse(), { headers: noStore })
    const body = await handlePaymeRequest(
      { bodyText: await request.text().catch(() => ''), authorization: request.headers.get('authorization') },
      { config, repo: paymeRepository },
    )
    return NextResponse.json(body, { headers: noStore })
  },
}

const stripe: PaymentProvider = {
  id: 'stripe',
  label: 'Card (Stripe)',
  currencies: ['USD'],
  isConfigured: () => stripeConfig() !== null,
  async createCheckout(input) {
    const config = stripeConfig()
    if (!config) throw new Error('Stripe is not configured')
    return { redirectUrl: await createStripeCheckoutSession(stripeClient(config.secretKey), input) }
  },
  async handleWebhook(request) {
    const config = stripeConfig()
    if (!config) return notConfigured()
    const raw = await request.text()
    const result = await handleStripeWebhook(raw, request.headers.get('stripe-signature'), {
      webhookSecret: config.webhookSecret,
      repo: stripeRepository,
    })
    return NextResponse.json(result.body, { status: result.status, headers: noStore })
  },
}

const test: PaymentProvider = {
  id: 'test',
  label: 'Test payment',
  currencies: ['UZS', 'USD'],
  isConfigured: () => testProviderSecret() !== null,
  async createCheckout({ payment }) {
    if (!testProviderSecret()) throw new Error('Test provider is disabled')
    return { redirectUrl: `/dashboard/subscription/test-checkout/${payment.id}` }
  },
  async handleWebhook(request) {
    const secret = testProviderSecret()
    // Refuse entirely when disabled (production or not switched on): looks like a missing route.
    if (!secret) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, { status: 404 })
    const raw = await request.text()
    const result = await handleTestWebhook(raw, request.headers.get(TEST_SIGNATURE_HEADER), { secret, repo: testRepository })
    return NextResponse.json(result.body, { status: result.status, headers: noStore })
  },
}

const PROVIDERS: Record<ProviderId, PaymentProvider> = { click, payme, stripe, test }

export function getPaymentProvider(id: ProviderId): PaymentProvider {
  return PROVIDERS[id]
}

/** Providers with credentials, in display order (local methods first). */
export function configuredProviders(): Array<Pick<PaymentProvider, 'id' | 'label' | 'currencies'>> {
  return (['click', 'payme', 'stripe', 'test'] as const)
    .map((id) => PROVIDERS[id])
    .filter((p) => p.isConfigured())
    .map(({ id, label, currencies }) => ({ id, label, currencies }))
}
