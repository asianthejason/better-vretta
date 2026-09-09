# Teacher plans and Stripe billing

| Plan | Display price | Annual charge | Classroom limit |
| --- | --- | --- | --- |
| Essentials | $5/month | $60 CAD/year | 2 |
| Unlimited | $8.33/month (rounded equivalent) | $100 CAD/year | Unlimited |

Paid plans are Stripe subscriptions charged once each year, not monthly charges.
The server computes prices; client-supplied amounts are ignored. `webberteam`
selects Unlimited for free, without creating a Stripe subscription or requiring a
card. Removing the coupon restores the previously selected paid plan.

Existing teachers keep their previous unlimited access. The limits count owned
and co-taught classrooms together. Removing a classroom frees a slot. The database
serializes classroom creation so simultaneous requests cannot exceed the limit.

## Required migration

Apply `supabase/migrations/20260909_teacher_annual_plans.sql` through Supabase SQL
Editor after the existing `20260908_teacher_signup_billing.sql` migration. This
adds plan/subscription fields, restricted activation and renewal functions,
classroom limits, and write protections for expired teacher subscriptions.
New checkout fails closed until the migration is present.

## Environment

```dotenv
APP_URL=http://localhost:3000
SUPABASE_SECRET_KEY=your_supabase_server_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_matching_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=your_webhook_signing_secret
# Optional override of the shared free-access coupon:
TEACHER_SIGNUP_COUPON=webberteam
```

The older `SUPABASE_SERVICE_ROLE_KEY` is also supported. Keep existing public
Supabase URL and anon/publishable key settings. Only the Stripe publishable key
belongs in browser code. Restart/rebuild when changing public environment values.

## Stripe webhooks

The deployed endpoint is `https://YOUR_DOMAIN/api/stripe/webhook`. In Stripe's
live-mode webhook settings, enable:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Use the deployed endpoint's signing secret in the hosting environment. For local
live development, keep this listener open:

```sh
stripe listen --live --forward-to localhost:3000/api/stripe/webhook
```

That command forwards all events by default. Its signing secret is separate from
the deployed endpoint's. If CLI authorization expires, run `stripe reauth` and
restart the listener. Use a sandbox for payment tests; live checkout charges real
money and schedules annual renewals.

## Signup and renewal behavior

Email signup shows Stripe card fields beside email/password before account
creation. Google signup collects payment after the OAuth return. Teacher access
is granted only after verified payment or server-side coupon redemption.
Email confirmation, when enabled in Supabase, must complete before payment.
No passwords or card numbers are stored in billing records.

Checkout records persist the selected plan and UI mode. Retries reuse the same
session. Changing plans or applying a coupon expires the previous open session.
Already-issued legacy $40 paid sessions are honored, but no new ones are sold.

Initial fulfillment verifies the paid amount, currency, user binding, annual
recurring price, and active subscription before storing the plan. Renewal and
cancellation events retrieve current subscription state from Stripe. Failed
invoices do not extend the paid access date. Coupon and legacy accounts are not
affected by subscription events. Subscription cancellation takes effect at the
paid period's end when requested through the app.

Teachers can use **Classrooms → Manage plan** to view their plan and cancel or
resume annual renewal. Expired subscriptions are directed to this page; failed
payment recovery currently requires administrator assistance in Stripe. Existing
classroom data is retained when a subscription expires.

## Validation

```sh
npm run test:billing
npm run test:signup
npm run build
```

Tests use mocked payment APIs and isolated PGlite databases. Browser tests create
no real accounts or charges. A full recurring payment and renewal should be
verified in a Stripe sandbox before treating live billing as end-to-end tested.

References: [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
and [Stripe Checkout confirmation](https://docs.stripe.com/js/custom_checkout/confirm).
