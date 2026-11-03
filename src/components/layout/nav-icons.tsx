import {
  BarChart3, BookMarked, BookOpen, Bot, CircleAlert, Layers3, School, UsersRound, Presentation, LayoutGrid, ClipboardCheck, CreditCard, FileClock, FileQuestion, FileUp, Gauge, GraduationCap,
  Home, Library, Languages, Layers, LayoutDashboard, ListChecks, Network, PenLine, PlayCircle, Receipt, ScrollText, Send, Settings, Sparkles, Target, Timer, Users,
  type LucideIcon,
} from 'lucide-react'
import type { NavIconKey } from '@/config/navigation'

export const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  home: Home,
  courses: BookOpen,
  practice: PenLine,
  diagnostic: Target,
  exams: Timer,
  results: ClipboardCheck,
  analytics: BarChart3,
  plan: ListChecks,
  tutor: Sparkles,
  bookmarks: BookMarked,
  subscription: CreditCard,
  settings: Settings,
  students: Users,
  subjects: GraduationCap,
  domains: Layers,
  skills: Network,
  lessons: PlayCircle,
  questions: FileQuestion,
  import: FileUp,
  payments: Receipt,
  ai: Bot,
  audit: ScrollText,
  admin: LayoutDashboard,
  guides: Languages,
  resources: Library,
  telegram: Send,
  mistakes: CircleAlert,
  flashcards: Layers3,
  classes: School,
  groups: LayoutGrid,
  team: UsersRound,
  teach: Presentation,
}

export { Gauge, FileClock }
