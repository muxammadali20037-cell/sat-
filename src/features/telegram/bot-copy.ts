/** Texts the bot shows in Telegram: Uzbek by default, English or Russian for clients in those languages. */

export const BOT_COPY = {
  uz: {
    welcome:
      'Assalomu alaykum! SAT MASTER — Digital SAT’ga tayyorlanish platformasi.\n\nPastdagi tugmani bosing: diagnostika testi, mashqlar, o‘zbekcha qo‘llanmalar va AI tutor bir joyda.',
    openButton: 'SAT MASTER’ni ochish',
    menuButton: 'Ochish',
    commandStart: 'SAT MASTER’ni ochish',
    shortDescription: 'Digital SAT’ga tayyorlanish: diagnostika, mashqlar, o‘zbekcha qo‘llanmalar va AI tutor.',
    description:
      'SAT MASTER — Digital SAT’ga tayyorlanish uchun ilova: diagnostika testi, mavzular bo‘yicha mashqlar, adaptiv mock imtihonlar, o‘zbek tilidagi qo‘llanmalar va AI tutor.\n\nSAT® — College Board’ning ro‘yxatdan o‘tgan savdo belgisi. College Board SAT MASTER bilan bog‘liq emas va uni qo‘llab-quvvatlamaydi.',
  },
  en: {
    welcome:
      'Welcome to SAT MASTER — Digital SAT preparation.\n\nTap the button below to open the app: diagnostic test, practice, study guides and the AI tutor.',
    openButton: 'Open SAT MASTER',
    menuButton: 'Open',
    commandStart: 'Open SAT MASTER',
    shortDescription: 'Digital SAT preparation: diagnostic, practice, study guides and an AI tutor.',
    description:
      'SAT MASTER is a Digital SAT preparation app: a diagnostic test, skill practice, adaptive mock exams, study guides in Uzbek and an AI tutor.\n\nSAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, SAT MASTER.',
  },
  ru: {
    welcome:
      'Добро пожаловать в SAT MASTER — подготовку к Digital SAT.\n\nНажмите кнопку ниже, чтобы открыть приложение: диагностика, практика, учебные пособия и ИИ-репетитор.',
    openButton: 'Открыть SAT MASTER',
    menuButton: 'Открыть',
    commandStart: 'Открыть SAT MASTER',
    shortDescription: 'Подготовка к Digital SAT: диагностика, практика, учебные пособия и ИИ-репетитор.',
    description:
      'SAT MASTER — приложение для подготовки к Digital SAT: диагностический тест, тренировка навыков, адаптивные пробные экзамены, пособия на узбекском и ИИ-репетитор.\n\nSAT® — зарегистрированный товарный знак College Board. College Board не связан с SAT MASTER и не поддерживает его.',
  },
} as const

export type BotLocale = keyof typeof BOT_COPY

export const botLocale = (languageCode: string | undefined | null): BotLocale => {
  const code = languageCode?.toLowerCase() ?? ''
  if (code.startsWith('en')) return 'en'
  if (code.startsWith('ru')) return 'ru'
  return 'uz'
}
