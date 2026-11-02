import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { ADMIN_ROLES } from '@/config/roles'
import { publicEnv, serverEnv, siteUrl } from '@/lib/env'
import { PageHeader } from '@/components/layout/page-header'
import { Alert, Badge } from '@/components/ui/card'
import { ConfigureTelegramButton } from '@/components/admin/configure-telegram-button'
import { callBot } from '@/lib/telegram/bot'
import { MINI_APP_PATH } from '@/features/telegram/shared'
import { formatDateTime } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Telegram' }

type Me = { username: string; first_name: string }
type WebhookInfo = { url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string }
type MenuButton = { type: string; text?: string; web_app?: { url: string } }

async function botStatus() {
  try {
    const [me, webhook, menu] = await Promise.all([
      callBot<Me>('getMe'),
      callBot<WebhookInfo>('getWebhookInfo'),
      callBot<MenuButton>('getChatMenuButton'),
    ])
    return { ok: true as const, me, webhook, menu }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Telegram could not be reached.' }
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-t border-border px-4 py-3 text-sm first:border-t-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

const Ok = ({ yes, children }: { yes: boolean; children: React.ReactNode }) => <Badge variant={yes ? 'success' : 'warning'}>{children}</Badge>

export default async function TelegramAdminPage() {
  await requireRole(ADMIN_ROLES, { next: '/admin/telegram' })
  const env = serverEnv()
  const tokenSet = Boolean(env.TELEGRAM_BOT_TOKEN)
  const secretSet = Boolean(env.TELEGRAM_WEBHOOK_SECRET)
  const https = publicEnv.NEXT_PUBLIC_SITE_URL.startsWith('https://')
  const miniAppUrl = siteUrl(MINI_APP_PATH)
  const webhookUrl = siteUrl('/api/webhooks/telegram')
  const status = tokenSet ? await botStatus() : null

  const db = await createServerSupabase()
  const { count: linked } = await db.from('telegram_accounts').select('user_id', { count: 'exact', head: true })

  const webhookOk = status?.ok && status.webhook.url === webhookUrl
  const menuOk = status?.ok && status.menu.type === 'web_app' && status.menu.web_app?.url === miniAppUrl
  const username = status?.ok ? status.me.username : null

  return (
    <>
      <PageHeader
        title="Telegram Mini App"
        description="Students open SAT MASTER inside Telegram, full screen, signed in with their Telegram account. Purchases are not offered in the Mini App."
        actions={<ConfigureTelegramButton disabled={!tokenSet || !secretSet || !https} />}
      />

      {(!tokenSet || !secretSet) && (
        <Alert variant="warning" className="mb-5" title="The bot is not connected yet">
          Create a bot with @BotFather, then set <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_WEBHOOK_SECRET</code> in the hosting
          environment and redeploy. Steps: docs/TELEGRAM.md.
        </Alert>
      )}
      {status && !status.ok && (
        <Alert variant="destructive" className="mb-5" title="Telegram did not accept the bot token">
          {status.error}
        </Alert>
      )}

      <section aria-labelledby="tg-status" className="mb-6 rounded-lg border border-border bg-card">
        <h2 id="tg-status" className="border-b border-border px-4 py-2.5 text-sm font-semibold">
          Status
        </h2>
        <dl>
          <Row label="Bot">{username ? `@${username} (${status?.ok ? status.me.first_name : ''})` : <Ok yes={false}>Not connected</Ok>}</Row>
          <Row label="Site address">
            {publicEnv.NEXT_PUBLIC_SITE_URL} {!https && <Ok yes={false}>Telegram needs https</Ok>}
          </Row>
          <Row label="Webhook">
            <Ok yes={Boolean(webhookOk)}>{webhookOk ? 'Set' : 'Not set'}</Ok>
            {status?.ok && status.webhook.last_error_message && (
              <p className="mt-1 text-destructive">
                Last error{status.webhook.last_error_date ? ` (${formatDateTime(new Date(status.webhook.last_error_date * 1000).toISOString())})` : ''}:{' '}
                {status.webhook.last_error_message}
              </p>
            )}
          </Row>
          <Row label="Menu button">
            <Ok yes={Boolean(menuOk)}>{menuOk ? `Opens ${miniAppUrl}` : 'Not set'}</Ok>
          </Row>
          <Row label="Connected students">{linked ?? 0}</Row>
        </dl>
      </section>

      <section aria-labelledby="tg-setup" className="rounded-lg border border-border bg-card p-4 text-sm">
        <h2 id="tg-setup" className="font-semibold">
          Full-screen launch
        </h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>
            In @BotFather: <span className="text-foreground">/mybots → your bot → Bot Settings → Configure Mini App → Enable Mini App</span>, and
            enter <code className="rounded bg-muted px-1">{miniAppUrl}</code>.
          </li>
          <li>Press “Configure bot” above. It sets the webhook, the menu button, /start and the descriptions.</li>
          <li>
            Share this link. It opens the app full screen
            {username ? (
              <>
                : <code className="rounded bg-muted px-1 text-foreground">https://t.me/{username}?startapp=home&amp;mode=fullscreen</code>
              </>
            ) : (
              ' (it appears here once the bot is connected).'
            )}
          </li>
        </ol>
        <p className="mt-3 text-muted-foreground">
          Opened from the menu button or /start, the app also asks Telegram for full screen on phones. Telegram’s own close and menu buttons
          stay on top, and the app leaves room for them.
        </p>
      </section>
    </>
  )
}
