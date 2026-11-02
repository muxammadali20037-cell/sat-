/**
 * Client-safe payloads of the mock exam API. These never contain answer keys, explanations,
 * `is_correct`, or the module-2 variant while an attempt is in progress.
 */
import type { TimedQuestion } from '@/types/questions'
import type { AttemptModuleStatus, ExamPhase, ExamSection } from './machine'

export type ExamMetaDTO = {
  id: string
  title: string
  isAdaptive: boolean
  isFullLength: boolean
  breakSeconds: number
}

export type ExamModuleSummaryDTO = {
  id: string
  sequence: number
  section: ExamSection
  moduleNumber: 1 | 2
  status: AttemptModuleStatus
  durationSeconds: number
  totalQuestions: number
}

export type ExamQuestionDTO = { attemptQuestionId: string; position: number; question: TimedQuestion }

export type SavedAnswerDTO = {
  selectedOptionId: string | null
  responseText: string | null
  markedForReview: boolean
  timeSpentSeconds: number
}

export type ExamStateDTO = {
  attemptId: string
  exam: ExamMetaDTO
  phase: ExamPhase
  serverNow: string
  modules: ExamModuleSummaryDTO[]
  /** The module to begin next (ready), with its question count when known. */
  next: (ExamModuleSummaryDTO & { questionCount: number; autoBegin: boolean }) | null
  breakEndsAt: string | null
  current: {
    attemptModuleId: string
    sequence: number
    section: ExamSection
    moduleNumber: 1 | 2
    startedAt: string
    deadlineAt: string
    questions: ExamQuestionDTO[]
    answers: Record<string, SavedAnswerDTO>
  } | null
}

export type StartExamResultDTO = { attemptId: string; resumed: boolean }
export type SaveAnswerResultDTO = { savedAt: string; serverNow: string; deadlineAt: string }
