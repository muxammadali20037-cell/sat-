# Telegram Mini App

Students can open SAT MASTER inside Telegram. On phones it goes full screen and works like an installed app:

- **Sign-in:** students sign in with their Telegram account; there is no password to remember.
- **Navigation:** the bottom tab bar and Telegram's own back button work as they do in other apps.
- **Appearance:** the app follows Telegram's light or dark theme.

## How it works

| Piece | Where |
|---|---|
| Entry page (the URL configured in BotFather) | `/tg` → `src/components/telegram/telegram-entry.tsx` |
| Connect an existing account | `/tg/link` (after signing in with email and password) |
| Telegram integration | `src/components/telegram/telegram-bridge.tsx`, plus a script in the root layout that runs before paint |
| Sign-in API | `POST /api/telegram/session`; connect or disconnect: `POST` and `DELETE /api/telegram/link` |
| Bot webhook | `POST /api/webhooks/telegram` |
| One-click bot setup and status | Admin → Telegram (`/admin/telegram`) |
| Database | `telegram_accounts` (migration 0016) |

**Identity.**
- The browser sends Telegram's signed launch data (`initData`), and the server checks its HMAC with the bot token (`src/lib/telegram/init-data.ts`).
- Launch data older than an hour is refused.
- Nothing else the browser says about the Telegram user is trusted.

**Accounts.**
- **New user:** on first open the student chooses "Get started", which creates an account from the Telegram profile.
  - The account gets a placeholder address `tg-<id>@telegram.satmaster.invalid`, which is never mailed, and no password.
  - The interface language is Uzbek unless Telegram is set to English.
- **Existing account:** choosing "I already have an account" means signing in once with email and password; that account is then connected.
- **Limits:** one Telegram account per SAT MASTER account, and vice versa.
- **Disconnecting:** possible in Settings, except for accounts created in Telegram, which have no other way to sign in.

**Session.**
- After the check, the server issues a one-time Supabase sign-in token and verifies it immediately, which sets the normal session cookies. No email is sent.
- Reopening the app reuses the live session.

**Full screen and layout.**
- On iOS and Android the app calls `requestFullscreen()` (Bot API 8.0+) and `disableVerticalSwipes()` (7.7+).
- Telegram's close and menu buttons float over the top of the page. The page therefore starts below `--tg-safe-area-inset-top` + `--tg-content-safe-area-inset-top`, with an opaque strip under the buttons.
- The bottom tab bar clears the home indicator.
- Outside Telegram all of these insets are 0, so the website is unchanged.

**No purchases in Telegram.**
- Telegram requires digital goods in bots and Mini Apps to be sold for Telegram Stars, and has suspended bots that took other payments. Inside the Mini App:
  - the plan list and every upgrade link are hidden;
  - the subscription page says plans are not sold in the app;
  - the checkout API refuses requests from the Mini App (403 `in_telegram`).
- The account is the same everywhere, so a plan bought on the website works in Telegram.

**Telegram Web** (web.telegram.org) runs Mini Apps in a cross-site frame, and browsers drop the session cookie there. The entry page says so and offers to open the website in its own tab. The phone and desktop Telegram apps are unaffected.

## Setup (owner)

1. **Create the bot.** In Telegram, open @BotFather, send `/newbot`, and copy the token.
2. **Set the environment variables** in Vercel (Production), then redeploy:
   - `TELEGRAM_BOT_TOKEN` = the token;
   - `TELEGRAM_WEBHOOK_SECRET` = a random string, e.g. the output of `openssl rand -hex 32`;
   - `NEXT_PUBLIC_SITE_URL` must be your `https://` address.
3. **Apply the database migrations** `20261102001500_atomic_quotas.sql` and `20261102001600_telegram.sql`: paste each into the Supabase SQL editor, or run `supabase db push`.
4. **Register the Mini App in BotFather.** Go to `/mybots` → your bot → **Bot Settings → Configure Mini App → Enable Mini App**, and enter `https://<your-domain>/tg`. This adds the "Open app" button to the bot profile and enables `t.me/<bot>?startapp` links.
5. **Configure the bot.** Admin → Telegram → **Configure bot**. This sets:
   - the webhook (with the secret);
   - the menu button that opens the app;
   - `/start`;
   - the bot descriptions in Uzbek and English.

   It is safe to run again at any time.
6. **Share the full-screen link:** `https://t.me/<bot>?startapp=home&mode=fullscreen`. Other `startapp` values open a section directly: `practice`, `guides`, `courses`, `tutor`, `exams`, `diagnostic`, `plan`.

## Verification (3 Nov 2026)

- **Unit tests:** `initData` validation against a vector computed independently in Python. Wrong token, tampered fields, extra fields, old data, future data and duplicate hashes are all rejected.
- **Database tests:** `telegram_accounts` RLS. Students read only their own link and cannot write; staff can read all links; uniqueness holds both ways; deleting an account removes its link.
- **End-to-end:** 29 checks at 390×844 against the local auth stack, with Telegram's script replaced by a recording stand-in:
  - full screen requested on iOS but not on desktop;
  - swipes disabled and colours set;
  - content and header start 93 px down, under Telegram's buttons, and the tab bar clears the home indicator;
  - new account created in Uzbek; reopening signs straight in without duplicates; `start_param` routing works;
  - the back button is hidden on tab roots, shown on inner pages, and navigates back;
  - no purchase UI is shown and checkout returns 403;
  - an existing account connects through login; a second account cannot take a connected Telegram;
  - forged launch data is rejected; the page explains itself outside Telegram;
  - the webhook requires the secret.

**Not verified:** a real Telegram client and the real Bot API. The sandbox cannot reach telegram.org. Before announcing the Mini App, check on a phone that:
- full screen works;
- the top spacing is right;
- `/start` replies with the button.
