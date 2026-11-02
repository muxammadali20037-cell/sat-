'use client'

import { QuestionNavigator, type NavigatorItem } from '@/components/learning/question-navigator'

/** Fictional practice-set progress for the marketing preview. Inert: it demonstrates, not navigates. */
const SAMPLE: NavigatorItem[] = Array.from({ length: 10 }, (_, index) => ({
  index,
  answered: index < 6,
  flagged: index === 4,
}))

export function PracticeSetPreview() {
  return (
    <div inert>
      <QuestionNavigator items={SAMPLE} current={6} onJump={() => undefined} />
    </div>
  )
}
