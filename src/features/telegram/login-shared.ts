/** Pure helpers and bot texts for website sign-in with Telegram (unit-tested). */

/** Short "Browser · OS" label from a User-Agent, shown in the Telegram confirmation message. */
export function clientHint(userAgent: string): string {
  const ua = userAgent || ''
  const browser = /YaBrowser/.test(ua)
    ? 'Yandex'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  return [browser, os].filter(Boolean).join(' · ').slice(0, 120)
}

/** Telegram contact numbers come with or without "+"; store E.164 (+ and 7–15 digits) or nothing. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/[^\d]/g, '')
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null
}

export const LOGIN_COPY = {
  uz: {
    loginPrompt:
      '🔐 SAT MASTER saytiga kirish\n\nKod: {code}\nQurilma: {device}\n\nKod saytdagi kod bilan bir xil bo‘lsa, «Tasdiqlash»ni bosing.\nBuni siz so‘ramagan bo‘lsangiz, «Bekor qilish»ni bosing — kimdir sizning nomingizdan kirmoqchi bo‘lishi mumkin.',
    linkPrompt:
      '🔗 SAT MASTER akkauntingizga shu Telegram’ni ulash\n\nKod: {code}\nQurilma: {device}\n\nKod saytdagi kod bilan bir xil bo‘lsa, «Tasdiqlash»ni bosing.',
    unknownDevice: 'noma’lum brauzer',
    confirm: '✅ Tasdiqlash',
    cancel: 'Bekor qilish',
    approved: '✅ Tasdiqlandi. Saytga qayting — sahifa o‘zi ochiladi.',
    approvedShort: 'Tasdiqlandi',
    denied: 'Bekor qilindi. Hech kim kirmadi.',
    deniedShort: 'Bekor qilindi',
    expired: 'Bu havola eskirgan yoki allaqachon ishlatilgan. Saytda «Telegram orqali kirish»ni qaytadan bosing.',
    expiredShort: 'Havola eskirgan',
    notYours: 'Bu so‘rov sizga tegishli emas',
    phoneAsk: '📱 Telefon raqamingizni ham ulaysizmi? Bu ixtiyoriy — kerak bo‘lganda siz bilan bog‘lanish uchun.',
    phoneShare: '📱 Raqamni yuborish',
    phoneSkip: 'Kerak emas',
    phoneSkipped: 'Yaxshi. Keyinroq ham ulashingiz mumkin.',
    phoneSaved: 'Rahmat! Raqamingiz saqlandi.',
    phoneNotOwn: 'Iltimos, «Raqamni yuborish» tugmasi orqali faqat o‘z raqamingizni yuboring.',
    phoneNoAccount: 'Avval SAT MASTER’ga Telegram orqali kiring, keyin raqamni ulashingiz mumkin.',
  },
  en: {
    loginPrompt:
      '🔐 Sign in to the SAT MASTER website\n\nCode: {code}\nDevice: {device}\n\nIf the code matches the one on the website, tap “Confirm”.\nIf you did not start this, tap “Cancel” — someone may be trying to sign in as you.',
    linkPrompt:
      '🔗 Connect this Telegram to your SAT MASTER account\n\nCode: {code}\nDevice: {device}\n\nIf the code matches the one on the website, tap “Confirm”.',
    unknownDevice: 'unknown browser',
    confirm: '✅ Confirm',
    cancel: 'Cancel',
    approved: '✅ Confirmed. Go back to the website — it continues by itself.',
    approvedShort: 'Confirmed',
    denied: 'Cancelled. Nobody was signed in.',
    deniedShort: 'Cancelled',
    expired: 'This link has expired or was already used. Press “Continue with Telegram” on the website again.',
    expiredShort: 'Link expired',
    notYours: 'This request is not yours',
    phoneAsk: '📱 Would you also like to share your phone number? Optional — only so we can reach you if needed.',
    phoneShare: '📱 Share my number',
    phoneSkip: 'No thanks',
    phoneSkipped: 'OK. You can share it later.',
    phoneSaved: 'Thank you! Your number is saved.',
    phoneNotOwn: 'Please send only your own number, with the “Share my number” button.',
    phoneNoAccount: 'Sign in to SAT MASTER with Telegram first, then you can share your number.',
  },
} as const
