import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Db } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/env'
import { writeAudit } from '@/lib/audit'
import { extendPlanAccess } from '@/features/subscriptions/grant'
import {
  canClaim,
  firstName,
  inviteUrl,
  MIN_DIAGNOSTIC_ANSWERS,
  monthStartUtc,
  newReferralCode,
  normalizeCode,
  rewardDecision,
  rewardSettings,
  type RewardSettings,
} from './logic'

/** The student's invite code; created on first use (service role, own row only). */
export async function getOrCreateReferralCode(admin: Db, userId: string): Promise<string> {
  const { data: existing, error } = await admin.from('referral_codes').select('code').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (existing) return existing.code
  for (let i = 0; i < 5; i++) {
    const code = newReferralCode(randomBytes(8))
    const { data, error: insErr } = await admin.from('referral_codes').insert({ user_id: userId, code }).select('code').maybeSingle()
    if (!insErr && data) return data.code
    if (insErr && insErr.code !== '23505') throw insErr
    // 23505: either the code is taken (try another) or this user got a code meanwhile.
    const { data: again } = await admin.from('referral_codes').select('code').eq('user_id', userId).maybeSingle()
    if (again) return again.code
  }
  throw new Error('Could not create an invite code.')
}

export async function loadRewardSettings(admin: Db): Promise<RewardSettings & { planCode: string }> {
  const { data, error } = await admin
    .from('platform_settings')
    .select('key, value')
    .in('key', ['referrals.referrer_days', 'referrals.friend_days', 'referrals.monthly_cap', 'referrals.plan_code'])
  if (error) throw error
  const values = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  const plan = values['referrals.plan_code']
  return { ...rewardSettings(values), planCode: typeof plan === 'string' && /^[a-z0-9_]{2,40}$/.test(plan) ? plan : 'pro' }
}

/**
 * Attaches a NEW account to the friend who invited it (from the invite cookie). Silently does
 * nothing for an unknown code, the inviter themself, an account older than a week, or an account
 * that already has an inviter. Returns whether an invite was recorded.
 */
export async function claimReferral(admin: Db, referredId: string, rawCode: string | null | undefined, now = new Date()): Promise<boolean> {
  const code = normalizeCode(rawCode)
  if (!code) return false
  const [{ data: owner }, { data: me }, { count }] = await Promise.all([
    admin.from('referral_codes').select('user_id').eq('code', code).maybeSingle(),
    admin.from('profiles').select('created_at').eq('id', referredId).maybeSingle(),
    admin.from('referrals').select('id', { count: 'exact', head: true }).eq('referred_id', referredId),
  ])
  if (!me) return false
  const check = canClaim({ referrerId: owner?.user_id ?? null, referredId, referredCreatedAt: me.created_at, alreadyReferred: (count ?? 0) > 0, now })
  if (!check.ok) return false
  const { error } = await admin.from('referrals').insert({ referrer_id: owner!.user_id, referred_id: referredId, code })
  if (error) {
    if (error.code === '23505') return false
    throw error
  }
  return true
}

const NOTICE = {
  uz: {
    title: (name: string) => `${name} diagnostikani tugatdi`,
    reward: (days: number) => `Taklifingiz uchun sizga ${days} kun Pro berildi.`,
    noReward: 'Taklifingiz hisobga olindi.',
    friendTitle: 'Do‘stingiz taklifi uchun sovg‘a',
    friendBody: (days: number) => `Sizga ${days} kun Pro berildi.`,
  },
  en: {
    title: (name: string) => `${name} finished the diagnostic`,
    reward: (days: number) => `You got ${days} days of Pro for the invite.`,
    noReward: 'Your invite was counted.',
    friendTitle: 'A gift for joining by invite',
    friendBody: (days: number) => `You got ${days} days of Pro.`,
  },
  ru: {
    title: (name: string) => `${name} прошёл(а) диагностику`,
    reward: (days: number) => `За приглашение вам начислено ${days} дн. Pro.`,
    noReward: 'Ваше приглашение засчитано.',
    friendTitle: 'Подарок за регистрацию по приглашению',
    friendBody: (days: number) => `Вам начислено ${days} дн. Pro.`,
  },
} as const
const notice = (locale: string | null) => NOTICE[(locale === 'en' || locale === 'ru' ? locale : 'uz') as keyof typeof NOTICE]

/**
 * Called after a student's diagnostic is scored. If they joined by invite, the invite qualifies
 * (once: the status change pending → qualified is atomic) and, when an admin has set reward days,
 * both sides get free days of the referral plan. Never throws into the diagnostic flow.
 */
export async function qualifyReferral(admin: Db, referredId: string, answered: number, now = new Date()): Promise<void> {
  try {
    if (answered < MIN_DIAGNOSTIC_ANSWERS) return
    const { data: claimed, error } = await admin
      .from('referrals')
      .update({ status: 'qualified', qualified_at: now.toISOString() })
      .eq('referred_id', referredId)
      .eq('status', 'pending')
      .select('id, referrer_id')
      .maybeSingle()
    if (error) throw error
    if (!claimed) return

    const settings = await loadRewardSettings(admin)
    const { count, error: cErr } = await admin
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', claimed.referrer_id)
      .eq('status', 'rewarded')
      .gte('rewarded_at', monthStartUtc(now))
    if (cErr) throw cErr
    let decision = rewardDecision(settings, count ?? 0)

    const { data: plan } = await admin.from('plans').select('id, code, price_minor, is_active').eq('code', settings.planCode).maybeSingle()
    if (decision.give && (!plan || !plan.is_active || Number(plan.price_minor) <= 0)) decision = { give: false, reason: 'rewards_off' }

    const { data: people } = await admin.from('profiles').select('id, full_name, locale').in('id', [claimed.referrer_id, referredId])
    const referrer = people?.find((p) => p.id === claimed.referrer_id)
    const friend = people?.find((p) => p.id === referredId)
    const friendName = firstName(friend?.full_name) ?? '—'

    if (!decision.give) {
      await admin.from('referrals').update({ no_reward_reason: decision.reason }).eq('id', claimed.id)
      await admin.from('notifications').insert({ user_id: claimed.referrer_id, type: 'system', title: notice(referrer?.locale ?? null).title(friendName), body: notice(referrer?.locale ?? null).noReward, link: '/dashboard/invite' })
      return
    }

    const grants: Array<{ userId: string; days: number; role: 'referrer' | 'friend' }> = [
      { userId: claimed.referrer_id, days: decision.referrerDays, role: 'referrer' as const },
      { userId: referredId, days: decision.friendDays, role: 'friend' as const },
    ].filter((g) => g.days > 0)
    for (const g of grants) {
      let res = await extendPlanAccess(admin, { userId: g.userId, plan: plan!, days: g.days, now, keepCurrentPlan: true })
      if (!res.ok) res = await extendPlanAccess(admin, { userId: g.userId, plan: plan!, days: g.days, now, keepCurrentPlan: true })
      if (!res.ok) throw new Error('subscription changed twice during a referral reward')
      await writeAudit({
        actorId: null,
        actorRole: 'system',
        action: 'billing.referral_reward',
        entityType: 'subscription',
        entityId: res.subscriptionId,
        summary: `Referral reward: ${g.days} day(s) of ${plan!.code} to the ${g.role} (invite ${claimed.id}, no payment)`,
        before: res.before,
        after: { plan: plan!.code, days: g.days, referral_id: claimed.id, role: g.role },
      })
    }
    await admin
      .from('referrals')
      .update({ status: 'rewarded', rewarded_at: now.toISOString(), referrer_days: decision.referrerDays, friend_days: decision.friendDays })
      .eq('id', claimed.id)

    const n = notice(referrer?.locale ?? null)
    const rows = [
      { user_id: claimed.referrer_id, type: 'subscription' as const, title: n.title(friendName), body: decision.referrerDays > 0 ? n.reward(decision.referrerDays) : n.noReward, link: '/dashboard/invite' },
    ]
    if (decision.friendDays > 0) {
      const f = notice(friend?.locale ?? null)
      rows.push({ user_id: referredId, type: 'subscription' as const, title: f.friendTitle, body: f.friendBody(decision.friendDays), link: '/dashboard/subscription' })
    }
    await admin.from('notifications').insert(rows)
  } catch (err) {
    console.error('[referrals] qualify failed', err)
  }
}

export type InviteFriend = { name: string | null; status: 'pending' | 'qualified' | 'rewarded'; joinedAt: string; days: number }
export type InviteOverview = {
  code: string
  url: string
  friends: InviteFriend[]
  settings: RewardSettings
  rewardedThisMonth: number
  daysEarned: number
}

export async function loadInviteOverview(admin: Db, userId: string, now = new Date()): Promise<InviteOverview> {
  const [code, settings, { data: rows, error }] = await Promise.all([
    getOrCreateReferralCode(admin, userId),
    loadRewardSettings(admin),
    admin.from('referrals').select('referred_id, status, created_at, rewarded_at, referrer_days').eq('referrer_id', userId).order('created_at', { ascending: false }).limit(200),
  ])
  if (error) throw error
  const ids = (rows ?? []).map((r) => r.referred_id)
  const { data: people } = ids.length ? await admin.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
  const names = new Map((people ?? []).map((p) => [p.id, firstName(p.full_name)]))
  const monthStart = monthStartUtc(now)
  return {
    code,
    url: inviteUrl(siteUrl('/'), code),
    settings,
    friends: (rows ?? []).map((r) => ({
      name: names.get(r.referred_id) ?? null,
      status: r.status as InviteFriend['status'],
      joinedAt: r.created_at,
      days: r.status === 'rewarded' ? r.referrer_days : 0,
    })),
    rewardedThisMonth: (rows ?? []).filter((r) => r.status === 'rewarded' && r.rewarded_at && r.rewarded_at >= monthStart).length,
    daysEarned: (rows ?? []).reduce((s, r) => s + (r.status === 'rewarded' ? r.referrer_days : 0), 0),
  }
}
