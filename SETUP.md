# Setup

The app will not start until these steps are done. That is deliberate — the
previous version booted happily with missing or revoked credentials and served
fabricated data instead of saying anything was wrong.

---

## 1. Rotate the leaked credentials (do this first)

Google has already revoked the Gemini key that was in `.env` — the API answers
`403 Your API key was reported as leaked`. `.env` was not in `.gitignore`, which
is almost certainly how it got out. It is ignored now, but anything already
committed or shared has to be treated as public.

- **Gemini** — delete the old key in [Google AI Studio](https://aistudio.google.com/apikey), create a new one.
- **Supabase** — rotate the anon/publishable key and the service role key in Project Settings → API.
- **Stripe** — roll the secret key in Developers → API keys.

Never commit the replacements.

## 2. Configure the environment

Copy `.env.example` to `.env` and fill it in. Note the split:

- `VITE_*` variables are compiled into the browser bundle. Only public-safe
  values belong there.
- Everything else is server-only. **Never** prefix a secret with `VITE_`.

`SUPABASE_SERVICE_ROLE_KEY` bypasses row level security and is what lets the
server verify JWTs and adjust credit balances. It must never reach the client.

## 3. Run the database migration

Open Supabase → SQL Editor, paste `supabase/migrations/0001_credits_and_rls.sql`,
and run it. It is idempotent, so re-running is safe.

It creates the credits ledger and the atomic spend/grant functions, and enables
row level security on `user_credits`, `shared_portfolios`, `resume_history` and
`interview_history`.

> If those tables already hold data, check the RLS policies against your
> existing columns before running this in production.

**Migrating existing balances.** Credits used to live in Stripe customer
metadata. To carry them over, for each customer with a `credits` value and a
`userId` in metadata:
>
> ```sql
> select public.add_credits('<userId>'::uuid, <credits>);
> ```

## 4. Configure Supabase Auth

Authentication → URL Configuration:

- **Site URL**: your production origin (e.g. `https://yourdomain.com`)
- **Redirect URLs**: add `http://localhost:3000/auth/callback` and
  `https://yourdomain.com/auth/callback`

Sign-in uses a normal full-page redirect with PKCE. If the callback URL is not
whitelisted here, Google sign-in will fail with a visible error.

## 5. Configure the Stripe webhook

Developers → Webhooks → add an endpoint at `https://yourdomain.com/api/webhook`,
subscribed to `checkout.session.completed` and `invoice.paid`. Put the signing
secret in `STRIPE_WEBHOOK_SECRET`.

Without that secret the endpoint returns 500 and refuses the event. That is
intentional: the old code fell back to parsing unsigned bodies, so anyone could
POST a fake "payment succeeded" event and mint themselves credits.

Test it locally with `stripe listen --forward-to localhost:3000/api/webhook`.

## 6. Run

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run lint     # tsc --noEmit
npm run build    # client bundle + dist/server.cjs
npm start        # serve the production build
```

`PORT` is read from the environment, so the usual PaaS hosts work unchanged.

---

## Pricing knobs

Every credit cost lives in `credits.ts`, and the pricing page renders its
feature list from those same constants — the two can no longer disagree.

Two numbers there are business decisions rather than bug fixes, and are worth a
deliberate look:

- `DAILY_FREE_CREDITS` is **5**, raised from 3. Portfolio generation costs 5, so
  at 3/day a free user could never reach the flagship feature even once.
- `resumeOptimization` is **2** (resume + cover letter in one call). The pricing
  page previously advertised 1 while the code charged 2; the copy now matches
  the code. If you would rather advertise 1, change the constant, not the copy.
