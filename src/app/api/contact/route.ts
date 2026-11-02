import { route } from '@/lib/api/route'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { contactSchema } from '@/components/marketing/contact-schema'

/**
 * POST /api/contact — public contact form. Rate limited per IP (or user), validated with Zod,
 * stored in contact_requests with the service role (anon has no insert grant). The honeypot
 * field drops bots without telling them.
 */
export const POST = route({
  auth: 'public',
  rateLimit: RATE_LIMITS.contact,
  body: contactSchema,
  handler: async ({ body, user, admin }) => {
    if (body.website && body.website.trim() !== '') {
      return { received: true }
    }
    const { error } = await admin()
      .from('contact_requests')
      .insert({
        name: body.name,
        email: body.email,
        topic: body.topic,
        message: body.message,
        user_id: user?.id ?? null,
      })
    if (error) throw error
    return { received: true }
  },
})
