# Authentication setup (Supabase)

What has to be configured in the Supabase dashboard for sign-up, email confirmation, password recovery and Google sign-in to work with SAT MASTER. Code references: `src/features/auth/actions.ts`, `src/app/auth/confirm/route.ts`, `src/app/auth/callback/route.ts`.

Replace `https://satmaster.example` below with your real `NEXT_PUBLIC_SITE_URL` (no trailing slash).

## 1. Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Vercel + `.env.local` | Must equal the Supabase **Site URL**. Used to build every auth redirect (`siteUrl()`). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel + `.env.local` | Without them the auth screens show "Sign-in is not configured for this deployment yet." and the forms are disabled. |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server only) | Used by the rate limiter (`rate_limit_hit`) and the contact form insert. |
| `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` | Vercel + `.env.local` | `true` shows "Continue with Google" on /login and /register. Leave unset/`false` until step 5 is done. |

## 2. URL configuration (Authentication → URL Configuration)

- **Site URL:** `https://satmaster.example`
- **Redirect URLs** (allow list):
  - `https://satmaster.example/auth/confirm**`
  - `https://satmaster.example/auth/callback**`
  - `http://localhost:3000/auth/confirm**` and `http://localhost:3000/auth/callback**` for local development
  - Vercel preview deployments, if you use them: `https://*-<team>.vercel.app/auth/**`

## 3. Email provider settings (Authentication → Providers → Email)

- **Enable email provider:** on
- **Confirm email:** on (sign-up sends a confirmation link; `/verify-email` tells the student to check their inbox)
- **Secure email change:** on
- **Minimum password length:** 8 (the app also requires at least one letter and one number)
- Configure a custom SMTP sender (Authentication → Emails → SMTP) before launch; the built-in sender is heavily rate limited.

## 4. Email templates (Authentication → Emails → Templates)

The app verifies email links on the server with `verifyOtp({ token_hash, type })` at `/auth/confirm`, so templates must link there with the token hash (not the default `{{ .ConfirmationURL }}`, which uses the implicit flow).

**Confirm signup**

```html
<h2>Confirm your email</h2>
<p>Welcome to SAT MASTER. Confirm your email address to activate your account:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard/onboarding">Confirm my email</a></p>
<p>If you did not create an account, you can ignore this email.</p>
```

Optional — keep the homepage deep link (e.g. "Start Free Diagnostic Test" continues to the diagnostic after onboarding): the sign-up action sets `emailRedirectTo` to `<site>/auth/confirm?next=/dashboard/onboarding%3Fnext%3D...`. To use it, link with `{{ .RedirectTo }}` instead, which already contains `?next=…`:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Confirm my email</a>
```

Only do this once the redirect allow list from step 2 is in place — if the redirect URL is not allowed, Supabase substitutes the Site URL and the link breaks. Without the deep link, students land on the dashboard after onboarding, where "Take the diagnostic" is the primary action.

**Reset password**

```html
<h2>Reset your password</h2>
<p>Someone asked to reset the password for your SAT MASTER account. If it was you, choose a new password:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Choose a new password</a></p>
<p>The link works once and expires soon. If you did not ask for this, ignore this email — your password stays the same.</p>
```

`/auth/confirm` verifies the recovery token, sets a 15-minute httpOnly `sm_recovery` cookie bound to the user id and redirects to `/reset-password`. The password can only be set from that page while the cookie is valid; otherwise the student is asked to request a new link. (Changing a password from Settings always re-checks the current password.)

**Change email address**

```html
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/dashboard/settings">Confirm the new email address</a></p>
```

**Magic link / Invite** (only if you enable them later): use `type=magiclink` / `type=invite` with the same pattern.

Expired or reused links send the student to `/login?error=link_expired`, which explains what happened.

## 5. Google sign-in (optional)

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (type: Web application).
   - Authorized JavaScript origins: `https://satmaster.example`
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (shown in Supabase under Providers → Google)
   - Configure the OAuth consent screen (app name "SAT MASTER", support email, links to `/privacy` and `/terms`).
2. Supabase → Authentication → Providers → **Google**: enable, paste the client ID and secret.
3. Make sure `https://satmaster.example/auth/callback**` is in the redirect allow list (step 2).
4. Set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true` and redeploy.

Flow: the server action `signInWithGoogleAction` calls `signInWithOAuth` (PKCE; the code verifier is stored in a cookie) and redirects to Google → Supabase → `/auth/callback?code=…&next=…`, which exchanges the code for a session. New Google users have no onboarding yet, so the student app sends them to `/dashboard/onboarding`. Failures redirect to `/login?error=oauth_failed`.

## 6. Rate limits and abuse protection

- App-level limits (Postgres limiter, `RATE_LIMITS` in `src/lib/security/rate-limit.ts`): login 10 per 5 min per IP + email, registration 5 per hour per IP, confirmation resend / password reset 5 per hour per IP, contact form 5 per hour.
- Supabase Auth has its own limits (Authentication → Rate Limits); keep "emails per hour" compatible with your SMTP provider.
- Consider enabling CAPTCHA (Authentication → Attack Protection) before a public launch; the forms would need the token passed through the actions.

## 7. Account enumeration

Sign-up, resend and password-reset responses never reveal whether an email is registered: existing addresses get the same "check your inbox" screen. Keep **Confirm email** enabled — with it off, Supabase returns `user_already_exists`, which the app also hides, but the behaviour of the first login then differs.

## 8. Checklist

- [ ] Site URL and redirect URLs set (production, localhost, previews)
- [ ] Confirm email on; custom SMTP configured
- [ ] Confirm signup, Reset password and Change email templates updated to `/auth/confirm?token_hash=…`
- [ ] Google provider configured (or `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` left off)
- [ ] Sign up → confirm → onboarding → dashboard works end to end
- [ ] Forgot password → email → `/reset-password` → dashboard works end to end
