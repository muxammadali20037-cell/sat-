import { defineDict } from '../dict'

/** Student Resource Hub (/dashboard/resources). */
export const resourcesDict = defineDict({
  en: {
    metaTitle: 'Resource Hub',
    title: 'Resource Hub',
    description: 'Hand-picked links to official SAT information, free lessons and tools, sorted by SAT domain.',
    notice:
      'These are links to other websites. Their owners are not affiliated with SAT MASTER and do not endorse it. Work you do there is not tracked in SAT MASTER.',
    general: 'General',
    opens: 'Opens {host}',
    terms: 'Terms',
    languages: { en: 'English', uz: 'Uzbek', ru: 'Russian' },
    kinds: { lesson: 'Lesson', video: 'Video', practice: 'Practice', tool: 'Tool', official_info: 'Official information', article: 'Article' },
    subjects: { math: 'Math', reading_writing: 'Reading and Writing' },
    emptyTitle: 'No resources yet',
    emptyBody: 'Our team adds links only after checking where they come from and that we are allowed to share them. Meanwhile, use the lessons, guides and practice in SAT MASTER.',
  },
  uz: {
    metaTitle: 'Manbalar markazi',
    title: 'Manbalar markazi',
    description: "Rasmiy SAT ma'lumotlari, bepul darslar va vositalarga tanlab olingan havolalar, SAT yo'nalishlari bo'yicha.",
    notice:
      "Bular boshqa saytlarga havolalar. Ularning egalari SAT MASTER bilan bog'liq emas va uni qo'llab-quvvatlamaydi. U yerdagi ishingiz SAT MASTER'da hisobga olinmaydi.",
    general: 'Umumiy',
    opens: '{host} ochiladi',
    terms: 'Shartlar',
    languages: { en: 'Inglizcha', uz: "O'zbekcha", ru: 'Ruscha' },
    kinds: { lesson: 'Dars', video: 'Video', practice: 'Mashq', tool: 'Vosita', official_info: "Rasmiy ma'lumot", article: 'Maqola' },
    subjects: { math: 'Matematika', reading_writing: "O'qish va yozish" },
    emptyTitle: "Hozircha manbalar yo'q",
    emptyBody: "Jamoamiz havolani faqat manbasi va uni ulashishga ruxsatimiz borligini tekshirgandan keyin qo'shadi. Hozircha SAT MASTER'dagi darslar, qo'llanmalar va mashqlardan foydalaning.",
  },
  ru: {
    metaTitle: 'Полезные ресурсы',
    title: 'Полезные ресурсы',
    description: 'Отобранные ссылки на официальную информацию о SAT, бесплатные уроки и инструменты по разделам SAT.',
    notice:
      'Это ссылки на другие сайты. Их владельцы не связаны с SAT MASTER и не поддерживают его. Занятия на этих сайтах не учитываются в SAT MASTER.',
    general: 'Общее',
    opens: 'Откроется {host}',
    terms: 'Условия',
    languages: { en: 'Английский', uz: 'Узбекский', ru: 'Русский' },
    kinds: { lesson: 'Урок', video: 'Видео', practice: 'Практика', tool: 'Инструмент', official_info: 'Официальная информация', article: 'Статья' },
    subjects: { math: 'Математика', reading_writing: 'Чтение и письмо' },
    emptyTitle: 'Ресурсов пока нет',
    emptyBody: 'Мы добавляем ссылки только после проверки источника и права ими делиться. А пока занимайтесь уроками, пособиями и практикой в SAT MASTER.',
  },
})
