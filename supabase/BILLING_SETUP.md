# ReelStudio billing: 5-day trial, ₹399/week or ₹799/month

The trial starts once per authenticated account and lasts exactly 120 hours. Existing accounts receive five days from the billing migration. Trial accounts do not supply a card or authorize auto-pay. After expiry the app offers ₹399/week and ₹799/month subscriptions. Subsequent renewals require the customer's Razorpay mandate. Administrators retain access.

## Configure and activate

Live merchant plans have been created and verified in the dashboard:

| Plan | Price | Provider ID |
| --- | --- | --- |
| ReelStudio Pro Weekly | ₹399/week | `plan_ToG20MCe5CqWhf` |
| ReelStudio Pro Monthly | ₹799/month | `plan_ToG7p8QYpT8nkz` |

Use `reelstudio-live-plans.env.example` for these non-secret settings. Existing merchant credentials are already used by other approved sites: do not regenerate them during integration. The additional ReelStudio domain requires Razorpay website verification; its registration currently awaits the account owner's two-step verification. Keys, webhook configuration and server deployment must be completed before marking the integration live.

1. Apply the projects migration, the administrator migrations, then `migrations/20261016_reelstudio_billing.sql` and `migrations/20261017_reelstudio_weekly_plan.sql`. The weekly migration preserves existing monthly subscriptions and does not reset trials. Take a database backup before production rollout. The billing migration immediately enforces cloud-write entitlements; deploy the functions/configuration in the same rollout.
2. Enable Subscriptions in the Razorpay account. Create two plans: **weekly, interval 1, INR 39900 paise** and **monthly, interval 1, INR 79900 paise**. The function fetches and checks the selected provider plan before opening checkout; request amounts cannot override these prices. Test and live plans/keys are separate. Subscriptions have a maximum of 120 billing cycles (120 weeks or 120 months); they are not indefinite mandates. Existing non-terminal subscriptions must be completed or cancelled before opening a different plan, preventing duplicate recurring mandates.
3. Deploy `functions/reelstudio-billing` and `functions/razorpay-webhook` to your Supabase Edge Functions service, including `_shared`. `config.toml` disables gateway JWT validation for these two functions: account requests authenticate with `auth.getUser`, while webhooks authenticate with a raw-body HMAC. For hosted Supabase use its normal functions deployment. For self-hosted Supabase/Coolify, mount this function tree into the Edge Runtime service and route `/functions/v1/*` through Kong; the frontend-only nginx container cannot run these handlers.
4. Set these **Edge Functions server secrets**, never browser variables:

   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_ORIGIN=https://cap.yogeshaihub.in`
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_MONTHLY_PLAN_ID=plan_...`
   - `RAZORPAY_WEEKLY_PLAN_ID=plan_...`
   - `RAZORPAY_WEBHOOK_SECRET` (a separate strong webhook signing secret)

5. In Razorpay add `https://<your-supabase-origin>/functions/v1/razorpay-webhook`. Subscribe to subscription activated, charged, updated, pending, halted, paused, resumed, cancelled and completed events. Set the same webhook secret. All handled events re-fetch provider state instead of trusting event ordering. A failed database write returns 503 for retry.
6. Set **`BILLING_ENABLED=true`** on the ReelStudio application in Coolify and deploy the updated application. `40-reelstudio-config.sh` includes this public switch in `config.js`. Local development uses `VITE_BILLING_ENABLED=true`. It defaults off for staged rollout and local editing. Do not expose a local/demo route on the paid production site.

## Verify in test mode first

Test a new signup, refresh and second-device sign-in, trial expiry, direct editor URLs, checkout dismissal/failure/retry, authenticated-but-unpaid mandate, successful first payment, renewal, failed renewal, cancellation at cycle end and webhook retry. Confirm an expired user cannot write projects or upload media using the REST/storage API. Confirm billing-table writes and service-only RPCs are denied to authenticated users. `tests/test-billing.py` runs the SQL checks in an isolated local PostgreSQL cluster.

For an expired test fixture, change **both** `trial_started_at` and `trial_ends_at` as the database operator, preserving their exact five-day difference. Client-side dates, local storage and checkout callbacks never grant access. The app rechecks server access every 30 seconds and on tab focus. Cloud writes enforce access on every request; users can still retrieve their owned stored media/metadata and delete data after expiry. Media already downloaded to a device cannot be protected by a browser paywall.

Cancellation stops the next renewal; it does not refund a payment or remove already-paid access. Pending/halted/authenticated subscriptions never extend the saved paid period. Changing the monthly price requires a new provider plan and corresponding validated amount/UI update; do not silently move existing subscribers to a higher price.

## Ambiguous checkout creation / recovery

Creation is protected by a durable per-account reservation. If the provider times out after possibly creating a subscription, the server deliberately retains `checkout_token`, rather than creating a second recurring mandate on retry. Find the subscription in Razorpay using its `reelstudio_user_id` and `reelstudio_checkout_token` notes. Insert its exact ID/owner/plan/status into `reelstudio_subscriptions`, then clear that account's `checkout_token`. The customer can now resume the existing checkout. If Razorpay definitively confirms no subscription was created, clear the token and retry. Never clear an ambiguous reservation without reconciling it first.

## Reference

- [Razorpay subscription creation](https://razorpay.com/docs/api/payments/subscriptions/create-subscription/)
- [Razorpay subscription integration](https://razorpay.com/docs/payments/subscriptions/integration-guide/)
- [Webhook signature validation](https://razorpay.com/docs/webhooks/validate-test/)
