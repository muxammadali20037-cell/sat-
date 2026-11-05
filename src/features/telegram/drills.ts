import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { callBot, TelegramApiError } from '@/lib/telegram/bot'
import { siteUrl } from '@/lib/env'
import { addDays, localDate } from '@/lib/time'
import { recordActivity } from '@/features/activity/server'
import { recordReview } from '@/features/flashcards/server'
import { allEntries, getEntry } from '@/features/vocab/dictionary'
import { mineKey } from '@/features/vocab/server'
import { DRILL_COPY, fill } from './drill-copy'
import {
  DRILL_SIZE,
  DRILL_WORDS,
  drillCallback,
  itemMessage,
  LETTERS,
  parseDrillCallback,
  questionItem,
  shuffle,
  suitableQuestion,
  wordItem,
  type QuestionCandidate,
} from './drill-build'

type Locale = 'uz' | 'en' | 'ru'
type Student = { id: string; locale: Locale; timezone: string; chatId: number }
type ItemRow = {
  id: string
  position: number
  kind: string
  ref: string
  prompt: string
  choices: string[]
  correct_index: number
  explanation: string | null
  sent_at: string | null
  answered_index: number | null
  drill_date: string
}

const ITEM_COLUMNS = 'id, position, kind, ref, prompt, choices, correct_index, explanation, sent_at, answered_index, drill_date'
const asLocale = (l: string | null | undefined): Locale => (l === 'en' || l === 'ru' ? l : 'uz')

async function loadItems(admin: Db, userId: string, date: string): Promise<ItemRow[]> {
  const { data, error } = await admin.from('telegram_drill_items').select(ITEM_COLUMNS).eq('user_id', userId).eq('drill_date', date).order('position')
  if (error) throw error
  return (data ?? []) as unknown as ItemRow[]
}

/** Today's items for the student, created on first use (words first, then questions). */
async function ensureToday(admin: Db, s: Student): Promise<ItemRow[]> {
  const date = localDate(s.timezone)
  const existing = await loadItems(admin, s.id, date)
  if (existing.length) return existing

  const since = addDays(date, -21)
  const [recent, mine, qs] = await Promise.all([
    admin.from('telegram_drill_items').select('ref').eq('user_id', s.id).gte('drill_date', since),
    admin.from('vocab_words').select('word').eq('user_id', s.id).eq('in_dictionary', true).limit(500),
    // Only reviewed and published questions; the server filters what reads well in Telegram.
    admin
      .from('questions')
      .select('id, question_type, image_path, stem, passage, answer_options(content, is_correct, position)')
      .eq('status', 'published')
      .eq('question_type', 'multiple_choice')
      .is('image_path', null)
      .limit(400),
  ])
  for (const r of [recent, mine, qs]) if (r.error) throw r.error
  const used = new Set((recent.data ?? []).map((r) => r.ref))

  // Words: the student's own saved words first, then other SAT words.
  const entries = allEntries()
  const own = shuffle((mine.data ?? []).map((w) => w.word).filter((w) => !used.has(w) && getEntry(w)))
  const rest = shuffle(entries.map(([w]) => w).filter((w) => !used.has(w) && !own.includes(w)))
  const words = [...own, ...rest].slice(0, DRILL_WORDS)

  const candidates: QuestionCandidate[] = (qs.data ?? []).map((q) => ({
    id: q.id,
    questionType: q.question_type,
    imagePath: q.image_path,
    stem: q.stem,
    passage: q.passage,
    options: ((q.answer_options ?? []) as Array<{ content: string; is_correct: boolean; position: number }>).sort((a, b) => a.position - b.position).map((o) => ({ content: o.content, isCorrect: o.is_correct })),
  }))
  const picked = shuffle(candidates.filter((q) => !used.has(q.id) && suitableQuestion(q))).slice(0, DRILL_SIZE - words.length)
  const expl = picked.length
    ? await admin.from('question_explanations').select('question_id, locale, content').in('question_id', picked.map((q) => q.id))
    : { data: [] as Array<{ question_id: string; locale: string; content: string }>, error: null }
  if (expl.error) throw expl.error
  const explanationFor = (id: string) => {
    const rows = (expl.data ?? []).filter((e) => e.question_id === id)
    return (rows.find((e) => e.locale === s.locale) ?? rows.find((e) => e.locale === 'en') ?? rows[0])?.content ?? null
  }

  const n = words.length + picked.length
  if (n === 0) return []
  const t = DRILL_COPY[s.locale]
  const rows = [
    ...words.map((w, i) => {
      const others = shuffle(entries.filter(([k]) => k !== w)).slice(0, 6).map(([, e]) => e)
      const it = wordItem(w, getEntry(w)!, others, s.locale)
      return { kind: it.kind, ref: it.ref, prompt: fill(t.wordPrompt, { i: i + 1, n, word: w }), choices: it.choices, correct_index: it.correctIndex, explanation: fill(t.example, { ex: it.explanation ?? '' }) }
    }),
    ...picked.map((q, j) => {
      const it = questionItem(q, explanationFor(q.id))
      return { kind: it.kind, ref: it.ref, prompt: `${fill(t.questionPrompt, { i: words.length + j + 1, n })}\n\n${it.body}`, choices: it.choices, correct_index: it.correctIndex, explanation: it.explanation }
    }),
  ].map((r, i) => ({ ...r, user_id: s.id, drill_date: date, position: i + 1 }))
  // Two simultaneous starts: the unique (user, date, position) key keeps only one set.
  const { error } = await admin.from('telegram_drill_items').upsert(rows, { onConflict: 'user_id,drill_date,position', ignoreDuplicates: true })
  if (error) throw error
  return loadItems(admin, s.id, date)
}

async function sendItem(admin: Db, s: Student, item: ItemRow) {
  const msg = await callBot<{ message_id: number }>('sendMessage', {
    chat_id: s.chatId,
    text: itemMessage(item.prompt, item.choices),
    reply_markup: { inline_keyboard: [item.choices.map((_, i) => ({ text: LETTERS[i], callback_data: drillCallback(item.id, i) }))] },
  })
  await admin.from('telegram_drill_items').update({ sent_at: new Date().toISOString(), message_id: msg.message_id }).eq('id', item.id)
}

async function sendDone(s: Student, items: ItemRow[], key: 'done' | 'alreadyDone') {
  const t = DRILL_COPY[s.locale]
  const correct = items.filter((i) => i.answered_index === i.correct_index).length
  await callBot('sendMessage', {
    chat_id: s.chatId,
    text: fill(t[key], { n: items.length, correct }),
    reply_markup: { inline_keyboard: [[{ text: t.openApp, url: siteUrl('/dashboard') }]] },
  })
}

/** Sends today's drill from where the student is: intro + first item, the pending item, or the summary. */
export async function startDrill(admin: Db, s: Student): Promise<'started' | 'resumed' | 'done' | 'empty'> {
  const items = await ensureToday(admin, s)
  if (items.length === 0) {
    await callBot('sendMessage', { chat_id: s.chatId, text: DRILL_COPY[s.locale].noContent })
    return 'empty'
  }
  const pending = items.find((i) => i.answered_index === null)
  if (!pending) {
    await sendDone(s, items, 'alreadyDone')
    return 'done'
  }
  const fresh = items.every((i) => !i.sent_at)
  if (fresh) await callBot('sendMessage', { chat_id: s.chatId, text: fill(DRILL_COPY[s.locale].intro, { n: items.length }) })
  await sendItem(admin, s, pending)
  return fresh ? 'started' : 'resumed'
}

async function studentByTelegram(admin: Db, telegramUserId: number): Promise<Student | null> {
  const { data } = await admin.from('telegram_accounts').select('user_id, telegram_user_id, profiles!inner(locale, timezone)').eq('telegram_user_id', telegramUserId).maybeSingle()
  if (!data) return null
  const p = data.profiles as unknown as { locale: string; timezone: string | null }
  return { id: data.user_id, locale: asLocale(p.locale), timezone: p.timezone || 'Asia/Tashkent', chatId: data.telegram_user_id }
}

/** "/drill" (or /mashq) in the bot. */
export async function handleDrillCommand(chatId: number, telegramUserId: number, languageCode?: string) {
  const admin = createAdminSupabase()
  const s = await studentByTelegram(admin, telegramUserId)
  if (!s) {
    await callBot('sendMessage', { chat_id: chatId, text: DRILL_COPY[asLocale(languageCode?.slice(0, 2))].notLinked })
    return
  }
  await startDrill(admin, s)
}

/** An answer button. Grades on the server, shows the result, then sends the next item. */
export async function handleDrillCallback(callback: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } }): Promise<boolean> {
  const parsed = parseDrillCallback(callback.data)
  if (!parsed) return false
  const admin = createAdminSupabase()
  const s = await studentByTelegram(admin, callback.from.id)
  const { data: row } = await admin.from('telegram_drill_items').select(`user_id, ${ITEM_COLUMNS}`).eq('id', parsed.itemId).maybeSingle()
  const item = row as unknown as (ItemRow & { user_id: string }) | null
  const t = DRILL_COPY[s?.locale ?? 'uz']
  // Only the student the item was made for can answer it.
  if (!s || !item || item.user_id !== s.id || parsed.choice >= item.choices.length) {
    await callBot('answerCallbackQuery', { callback_query_id: callback.id, text: t.expired }).catch(() => undefined)
    return true
  }
  const { data: updated } = await admin
    .from('telegram_drill_items')
    .update({ answered_index: parsed.choice, answered_at: new Date().toISOString() })
    .eq('id', item.id)
    .is('answered_index', null)
    .select('id')
  if (!updated?.length) {
    await callBot('answerCallbackQuery', { callback_query_id: callback.id, text: t.already }).catch(() => undefined)
    return true
  }
  const ok = parsed.choice === item.correct_index
  const answer = `${LETTERS[item.correct_index]}) ${item.choices[item.correct_index]}`
  const verdict = ok ? t.correct : fill(t.wrong, { answer })
  await callBot('answerCallbackQuery', { callback_query_id: callback.id, text: ok ? t.correct : t.wrong.split('.')[0] }).catch(() => undefined)
  if (callback.message) {
    const text = `${itemMessage(item.prompt, item.choices)}\n\n${verdict}${item.explanation ? `\n\n${item.explanation}` : ''}`.slice(0, 4000)
    await callBot('editMessageText', { chat_id: callback.message.chat.id, message_id: callback.message.message_id, text }).catch(() => undefined)
  }

  // Learning records: questions count as practice activity; saved words get a flashcard review.
  if (item.kind === 'question') await recordActivity(s.id, s.timezone, { questions: 1, correct: ok ? 1 : 0 })
  else {
    const { data: saved } = await admin.from('vocab_words').select('id').eq('user_id', s.id).eq('word', item.ref).maybeSingle()
    if (saved) await recordReview(admin, { id: s.id, timezone: s.timezone } as CurrentProfile, { cardKey: mineKey(item.ref), grade: ok ? 'good' : 'again', seconds: 0 }).catch(() => undefined)
  }

  const items = await loadItems(admin, s.id, item.drill_date)
  const next = items.find((i) => i.answered_index === null)
  if (next) await sendItem(admin, s, next)
  else await sendDone(s, items, 'done')
  return true
}

/** Daily cron: sends today's drill to every student who turned it on (once per day). */
export async function runDailyDrills(): Promise<{ sent: number; skipped: number; failed: number; turnedOff: number }> {
  const admin = createAdminSupabase()
  const today = localDate('Asia/Tashkent')
  const { data, error } = await admin
    .from('telegram_accounts')
    .select('user_id, telegram_user_id, drills_last_sent_on, profiles!inner(locale, timezone)')
    .eq('drills_enabled', true)
    .or(`drills_last_sent_on.is.null,drills_last_sent_on.lt.${today}`)
    .limit(500)
  if (error) throw error
  const result = { sent: 0, skipped: 0, failed: 0, turnedOff: 0 }
  for (const a of data ?? []) {
    const p = a.profiles as unknown as { locale: string; timezone: string | null }
    const s: Student = { id: a.user_id, locale: asLocale(p.locale), timezone: p.timezone || 'Asia/Tashkent', chatId: a.telegram_user_id }
    try {
      const r = await startDrill(admin, s)
      if (r === 'empty') result.skipped++
      else result.sent++
      await admin.from('telegram_accounts').update({ drills_last_sent_on: today }).eq('user_id', a.user_id)
    } catch (err) {
      // The student blocked the bot or deleted the chat: stop sending until they turn it on again.
      if (err instanceof TelegramApiError && err.errorCode === 403) {
        await admin.from('telegram_accounts').update({ drills_enabled: false }).eq('user_id', a.user_id)
        result.turnedOff++
      } else {
        console.error('[drills] could not send', a.user_id, err instanceof Error ? err.message : err)
        result.failed++
      }
    }
  }
  return result
}
