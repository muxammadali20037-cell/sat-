'use server'

import { DRILL_COPY } from './drill-copy'
import { revalidatePath } from 'next/cache'
import { ADMIN_ROLES } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { publicEnv, serverEnv, siteUrl } from '@/lib/env'
import { writeAudit } from '@/lib/audit'
import { adminAction } from '@/features/admin/server-utils'
import { callBot, TelegramApiError } from '@/lib/telegram/bot'
import { BOT_COPY } from './bot-copy'
import { MINI_APP_PATH } from './shared'

/**
 * One-click bot setup: webhook (with the secret header), the menu button that opens the Mini App,
 * the /start command and the bot descriptions in Uzbek and English. Safe to run again.
 */
export async function configureTelegramBotAction(): Promise<ActionResult<{ steps: string[] }>> {
  return adminAction(ADMIN_ROLES, async ({ profile }) => {
    const env = serverEnv()
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
      return { ok: false, error: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in the hosting environment first.' }
    }
    if (!publicEnv.NEXT_PUBLIC_SITE_URL.startsWith('https://')) {
      return { ok: false, error: 'Telegram requires HTTPS. Set NEXT_PUBLIC_SITE_URL to your https:// address.' }
    }
    const steps: string[] = []
    const run = async (label: string, method: string, params: Record<string, unknown>) => {
      await callBot(method, params)
      steps.push(label)
    }
    try {
      await run('Webhook', 'setWebhook', {
        url: siteUrl('/api/webhooks/telegram'),
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        // callback_query: the Confirm/Cancel buttons of website sign-in.
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      })
      await run('Menu button', 'setChatMenuButton', {
        menu_button: { type: 'web_app', text: BOT_COPY.uz.menuButton, web_app: { url: siteUrl(MINI_APP_PATH) } },
      })
      await run('Commands (English)', 'setMyCommands', { commands: [{ command: 'start', description: BOT_COPY.en.commandStart }, { command: 'drill', description: DRILL_COPY.en.commandDrill }] })
      await run('Commands (Uzbek)', 'setMyCommands', { commands: [{ command: 'start', description: BOT_COPY.uz.commandStart }, { command: 'drill', description: DRILL_COPY.uz.commandDrill }], language_code: 'uz' })
      await run('Description (English)', 'setMyDescription', { description: BOT_COPY.en.description })
      await run('Description (Uzbek)', 'setMyDescription', { description: BOT_COPY.uz.description, language_code: 'uz' })
      await run('Short description (English)', 'setMyShortDescription', { short_description: BOT_COPY.en.shortDescription })
      await run('Short description (Uzbek)', 'setMyShortDescription', { short_description: BOT_COPY.uz.shortDescription, language_code: 'uz' })
      await run('Commands (Russian)', 'setMyCommands', { commands: [{ command: 'start', description: BOT_COPY.ru.commandStart }, { command: 'drill', description: DRILL_COPY.ru.commandDrill }], language_code: 'ru' })
      await run('Description (Russian)', 'setMyDescription', { description: BOT_COPY.ru.description, language_code: 'ru' })
      await run('Short description (Russian)', 'setMyShortDescription', { short_description: BOT_COPY.ru.shortDescription, language_code: 'ru' })
    } catch (err) {
      const message = err instanceof TelegramApiError ? err.message : 'Telegram could not be reached.'
      return { ok: false, error: `${message}${steps.length ? ` (done before the error: ${steps.join(', ')})` : ''}` }
    }
    await writeAudit({
      actorId: profile.id,
      actorRole: profile.role,
      action: 'telegram.bot_configured',
      entityType: 'platform_setting',
      summary: `Configured the Telegram bot: ${steps.join(', ')}`,
      after: { webhook: siteUrl('/api/webhooks/telegram'), mini_app: siteUrl(MINI_APP_PATH) },
    })
    revalidatePath('/admin/telegram')
    return { ok: true, data: { steps }, message: 'Bot configured' }
  })
}
