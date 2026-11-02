# SAT MASTER — Payments & subscriptions

Status: v1 · Owner: payments workstream · Authoritative design: `docs/SYSTEM_ARCHITECTURE.md` §12.

## 1. Principles

- **Access changes only through verified provider callbacks or a trusted admin action.** The browser never confirms anything; the return page only *displays* the payment row.
- **All billing state transitions are SQL functions** (`billing_apply_successful_payment`, `billing_mark_payment_failed`, `billing_cancel_pending_payment`, `billing_refund_payment`) — row-locked, idempotent, audited. Application code never writes `payments.status` except Payme's `pending → processing` when a transaction is created.
- **Idempotency at four levels:** client idempotency key per checkout (`unique (user_id, idempotency_key)`), unique provider event id (`payment_events`), unique provider transaction id (`payments (provider, provider_transaction_id)`), and the `status = 'succeeded'` early return inside the SQL function.
- **No automatic recurring charges.** Each payment buys one period (`plans.interval_months`, default 1 month). Renewal is a new checkout; the daily job sends a reminder before the period ends.
- **Financial rows are never deleted** (triggers on `payments`, `payment_events`, `subscriptions`). Refunds are a state change plus an event.
- **Missing credentials → the provider is hidden** in the UI and its API answers `503 PROVIDER_NOT_CONFIGURED`.

## 2. Flow

```
student ── POST /api/payments/checkout {planCode, provider, idempotencyKey}
        ── payments(pending, purpose) ── provider.createCheckout() ── redirect (checkout_url stored)
provider ── POST /api/webhooks/<provider>
        ── verify signature / auth ── payment_events (raw payload, signature_valid, provider_event_id)
        ── order + amount + currency + state checks
        ── SQL billing function ── payment_events.processed_at / processing_error
student ── /dashboard/subscription/return?payment=<id>   (polls GET /api/payments/<id>, display only)
```

Code map:

| Path | Role |
|---|---|
| `src/lib/payments/types.ts` | `PaymentProvider`, repository interfaces |
| `src/lib/payments/{click,payme,stripe,test-provider}.ts` | Protocol logic (pure; repositories injected → unit tested) |
| `src/lib/payments/purpose.ts` | Effective status, checkout purpose, price selection, money parsing |
| `src/lib/payments/registry.ts` | Env → provider config, `getPaymentProvider`, `configuredProviders` |
| `src/features/payments/process.ts` | Event log + SQL billing functions (service role) |
| `src/features/payments/repository.ts` | Supabase implementations of the protocol repositories |
| `src/features/payments/checkout.ts` | Checkout service (purpose, price, idempotency) |
| `src/features/subscriptions/{server,lifecycle,cron}.ts` | Overview, student lifecycle changes, daily maintenance |
| `src/app/api/webhooks/{click,payme,stripe,test}` | Webhook endpoints |

## 3. Plan rules (PRODUCT_SPEC §4.11)

| Situation | Purpose | Effect when paid |
|---|---|---|
| No paid plan in effect (none / expired / canceled) | `new` | New subscription: now → now + 1 month |
| Same plan (also during grace) | `renewal` | Period extended from `max(period end, now)` |
| Plan priced ≥ current | `upgrade` | Plan switches now; remaining time × old price ÷ new price is added as extra seconds |
| Cheaper plan | — | Refused at checkout (409). Student schedules it (`/api/subscription/schedule-downgrade`) |
| The scheduled plan | `downgrade` | This is what a renewal buys. Paying before period end switches now with the same pro-rata conversion (the student gets *more* days, never fewer) |
| Current plan while another plan is scheduled | — | Refused (409): "keep your plan" first (`/api/subscription/cancel-scheduled-change`) |

- **Cancel** (`/api/subscription/cancel`) sets `cancel_at_period_end`: access continues to the period end, reminders stop. **Resume** undoes it.
- **Grace period:** `platform_settings.billing.grace_period_days` (default 3). Effective status `grace` keeps the plan's entitlements.
- **Refunds** are recorded by admins (money is returned in the provider cabinet) and optionally revoke access (subscription → `canceled`, student falls back to Free).
- **Failed payments never change access.**

## 4. Providers — configuration

All URLs below use `https://<your-domain>`. Webhook paths are excluded from the session proxy (`src/proxy.ts`).

### Click (UZS) — Shop API

Docs: <https://docs.click.uz/en/?p=15> (Prepare/Complete), <https://docs.click.uz/en/?p=9> (errors), <https://docs.click.uz/en/?p=101> (button).

1. In the Click merchant cabinet, open the service and set **both** the Prepare URL and the Complete URL to `https://<your-domain>/api/webhooks/click`.
2. Env: `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY`, optional `CLICK_MERCHANT_USER_ID`.
3. Checkout redirect: `https://my.click.uz/services/pay?service_id&merchant_id&amount=<N.NN>&transaction_param=<payment number>&return_url=…`.

Behaviour: `sign_string = md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id [+ merchant_prepare_id] + amount + action + sign_time)` compared in constant time; `merchant_trans_id` = payment number; `merchant_prepare_id = merchant_confirm_id` = payment number. Codes: `0` success, `-1` sign/service mismatch, `-2` amount, `-3` action, `-4` already paid, `-5` order not found / not a Click order, `-6` Complete without our successful Prepare or wrong prepare id, `-7` apply failed, `-8` missing parameters, `-9` canceled. Complete with `error < 0` cancels the order and answers `-9`.

### Payme (UZS, tiyin) — Merchant API

Docs: <https://developer.help.paycom.uz/protokol-merchant-api/>, methods under `/metody-merchant-api/`, sandbox <https://developer.help.paycom.uz/pesochnitsa>.

1. Payme Business cabinet → your web cashbox → **Endpoint URL** `https://<your-domain>/api/webhooks/payme`.
2. Cashbox **account field**: `order_id` (shown to the payer as the order number).
3. Env: `PAYME_MERCHANT_ID` (cashbox id), `PAYME_KEY` (production key), `PAYME_TEST_KEY` (sandbox key), `PAYME_TEST_MODE=true` while testing in the sandbox (`https://test.paycom.uz`; checkout goes to `checkout.test.paycom.uz`).
4. Optional hardening: allow only Payme's documented source range `185.234.113.1–15` at the edge.
5. If the cashbox has **fiscalization** enabled, `CheckPerformTransaction` must also return `detail` with IKPU / package codes — not implemented yet (see §8).

Behaviour: Basic auth `Paycom:<key>` (constant-time) → `-32504`; every answer is HTTP 200; non-POST → `-32300`; `-32700/-32600/-32601/-32400` for protocol errors; localized `message {ru, uz, en}`. Order errors: `-31050` not found (`data: "order_id"`), `-31051` already paid/canceled, `-31052` waiting in another transaction (CheckPerformTransaction). Methods: CheckPerformTransaction, CreateTransaction (idempotent per Payme id; a *new* transaction for an order waiting in state 1 → `-31008`, as the official sandbox requires), PerformTransaction (applies the payment; repeats return the stored `perform_time`), CancelTransaction (state 1 → `-1` via `billing_cancel_pending_payment`; state 2 → `-2` via `billing_refund_payment(revoke_access: true)`), CheckTransaction, GetStatement. A state-1 transaction older than 12 h (43 200 000 ms, measured from Payme's `time`) is canceled with reason 4 on Create/Perform/Check and by the daily job.

### Stripe (USD) — Checkout, one-month passes

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint** `https://<your-domain>/api/webhooks/stripe` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
2. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (the endpoint's `whsec_…`).
3. A plan is offered by card only when it has an active USD price (admin → Subscriptions → Plans).

Behaviour: Checkout Session `mode: payment`, `client_reference_id` = payment id, metadata on session and PaymentIntent, session expires after 23 h (before the 24 h stale-checkout job). The webhook verifies with `stripe.webhooks.constructEvent(rawBody, signature, secret)` and dedupes by `event.id`; amount and currency must equal the payment row. `charge.refunded` records the refund; access is revoked only when the charge is fully refunded.

### Test provider (development only)

`PAYMENTS_TEST_MODE=true`, `PAYMENTS_TEST_WEBHOOK_SECRET=<random string>` and `NODE_ENV !== 'production'`. The checkout page `/dashboard/subscription/test-checkout/<paymentId>` is labelled "Test payment — no money is charged"; its buttons build an HMAC-SHA256-signed event (`x-satmaster-test-signature: t=…,v1=…`) and run it through the same pipeline as `POST /api/webhooks/test`. In production both the page and the endpoint return 404.

## 5. Daily maintenance (cron)

`GET /api/cron/renewal-reminders` with `Authorization: Bearer $CRON_SECRET` (401 when unset or wrong). `vercel.json` schedules it daily at 04:00 UTC; Vercel sends the header automatically when `CRON_SECRET` is set. It is idempotent:

1. One reminder per subscription period, `billing.renewal_reminder_days` (default 3) before the period ends, in the student's language; skipped when the student canceled. Dedupe key: the notification link `/dashboard/subscription?reminder=<period end epoch>`.
2. Subscriptions past period end + grace → `expired` (+ one notification).
3. Checkouts still `pending`/`processing` after 24 h → canceled (Payme state-1 transactions only after their own 12-hour window, with reason 4).

## 6. Admin

- `/admin/subscriptions` — filter by status (active, grace, not renewing, expired, canceled) and plan, search by email; detail with payments and history. Actions: **Grant or extend access** (no payment, no revenue, `last_provider = manual`, reason required, audited) and **Record offline payment** (creates a `manual` payment and applies it with `billing_apply_successful_payment`; a bank reference can be recorded once).
- `/admin/subscriptions/plans` — edit name, description, UZS price, USD price, active/public/highlight and features (limit blank = unlimited). Saved with the admin's own session, so the row-change audit trigger records the actor. The Free plan stays active at price 0.
- `/admin/payments` — filter by status/provider/date, search by number or email, unmatched callbacks. Detail shows the event timeline with raw payloads and **Refund payment** (amount ≤ paid, reason, revoke toggle → `billing_refund_payment` with the admin as actor). Recording a refund does not move money — return it in the provider cabinet first.

## 7. Testing

```bash
npx vitest run --project unit tests/unit/{click,payme,stripe,payments,subscription}.test.ts
npx vitest run --project db tests/integration/billing.test.ts   # needs the local Postgres (npm run db:start)
```

Manual end-to-end without real money: set the test-provider env vars, open `/dashboard/subscription`, choose "Test payment — no money is charged", then simulate success or failure.

## 8. Known limitations / decisions to revisit

- **Payme fiscal receipts** (`detail` in CheckPerformTransaction) are not sent; required if fiscalization is enabled on the cashbox.
- **Stripe partial refunds:** `billing_refund_payment` records one refund per payment; later partial refunds of the same charge are not summed (the first event wins). Use the admin detail page to reconcile.
- **Payme `create_time`** is stored as Payme's `time` (one column serves the timeout, CheckTransaction and GetStatement).
- **Payment paid after the stale-checkout job canceled it:** Click receives `-9` (charge reversed); Payme is bounded by its 12 h window; Stripe sessions expire before the job runs. If a provider still reports money for a canceled order, it appears as a `processing_error` event — refund it in the cabinet or grant access manually.
- Auto-renewal (Payme Subscribe, Click card tokens, Stripe Billing) is out of scope for v1 (PRODUCT_SPEC §7).
