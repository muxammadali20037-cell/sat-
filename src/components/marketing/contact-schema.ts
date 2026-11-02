import { z } from 'zod'

/** Contact form schema, shared by the client form and POST /api/contact. Mirrors contact_requests checks. */
export const CONTACT_TOPICS = ['general', 'billing', 'technical', 'partnership'] as const
export type ContactTopic = (typeof CONTACT_TOPICS)[number]

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'nameRequired').max(120, 'nameRequired'),
  email: z.string().trim().toLowerCase().min(3, 'emailInvalid').max(254, 'emailInvalid').pipe(z.email('emailInvalid')),
  topic: z.enum(CONTACT_TOPICS, 'topicRequired'),
  message: z.string().trim().min(10, 'messageTooShort').max(4000, 'messageTooLong'),
  /** Honeypot: hidden from people, often filled by bots. Non-empty → silently dropped. */
  website: z.string().max(200).optional(),
})
export type ContactInput = z.input<typeof contactSchema>
