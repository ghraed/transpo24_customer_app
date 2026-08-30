# Google Play internal testing with Stripe test mode

This release path is intentionally separate from the public Play Store app:

| Component | Play internal-test release | Public release |
| --- | --- | --- |
| EAS build profile | `play-test` | `production` |
| Stripe publishable key | `pk_test_...` | `pk_live_...` |
| API and socket URL | staging API only | `https://api.transpo24.com` |
| Backend Stripe secret | `sk_test_...` | `sk_live_...` |
| Database | staging only | production only |

## One-time configuration

1. Deploy a separate HTTPS staging API and database. Set `NODE_ENV=staging` there.
2. In Stripe Dashboard, switch to the test sandbox and create a webhook endpoint for the staging URL: `https://<staging-host>/webhooks/stripe`. Put its `whsec_...` signing secret in the staging API.
3. In the Expo/EAS dashboard, add the values from `.env.play-test.example` to the `preview` environment. Do not put any `sk_...` value in Expo: secret keys stay backend-only.
4. Confirm that every API/socket URL uses the staging host, never `https://api.transpo24.com`.

## Build and test

```bash
eas build --profile play-test --platform android
eas submit --profile play-test --platform android
```

Install the build through the Google Play Internal Testing track. Complete a small ride or wallet top-up with Stripe's Visa test card `4242 4242 4242 4242`, a future expiry date, and any three-digit CVC. Confirm the success and webhook state in the Stripe test dashboard, then test the app's refund and payout flows before public release.

The `play-test` build now fails during configuration if it lacks an API URL or if any API/socket URL targets the production API. This prevents a Stripe test key from being paired with the live backend.
