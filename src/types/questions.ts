/**
 * Client-safe question shapes. These are the ONLY question payloads that may be sent to the
 * browser. They never contain answer keys or explanations until `RevealedAnswer` is allowed
 * (the student has answered and the context permits feedback).
 */

export type SubjectCode = 'math' | 'reading_writing'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type QuestionType = 'multiple_choice' | 'student_produced_response'
export type StimulusType = 'text' | 'passage' | 'image'
export type OptionLabel = 'A' | 'B' | 'C' | 'D'

export type SafeOption = { id: string; label: OptionLabel; content: string }

export type SafeQuestion = {
  id: string
  subjectCode: SubjectCode
  domainId: string
  domainName: string
  skillId: string
  skillName: string
  difficulty: Difficulty
  questionType: QuestionType
  stimulusType: StimulusType
  stem: string
  passage: string | null
  imageUrl: string | null
  imageAlt: string | null
  estimatedSeconds: number
  options: SafeOption[] // empty for student-produced response
}

/** Feedback after an answer, when allowed. */
export type RevealedAnswer = {
  questionId: string
  isCorrect: boolean | null
  selectedOptionId: string | null
  responseText: string | null
  correctOptionId: string | null
  acceptedAnswers: string[]
  explanation: string | null
}

export const SUBJECT_LABELS: Record<SubjectCode, string> = {
  math: 'Math',
  reading_writing: 'Reading and Writing',
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
