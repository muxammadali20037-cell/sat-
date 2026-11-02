/**
 * Automatic task completion (pure, unit-tested):
 * - lesson tasks complete when the lesson is completed (lesson_progress.completed_at);
 * - practice tasks complete when the student answered enough questions in that skill on/after the
 *   scheduled date. Answers are matched greedily in date order, each answer counting for one task
 *   only, so one burst of practice does not tick off a whole month of tasks.
 */

export type ReconcileTask = {
  id: string
  type: string
  status: 'pending' | 'completed' | 'skipped'
  date: string
  position: number
  lessonId: string | null
  skillId: string | null
  minutes: number
}

export type ReconcileFacts = {
  completedLessonIds: ReadonlySet<string>
  /** Local dates (YYYY-MM-DD, student time zone) of scored answers, per skill. */
  answerDatesBySkill: Record<string, string[]>
}

/** Questions needed to auto-complete a practice block: about one per 2.5 minutes, 5–10. */
export function practiceTargetQuestions(minutes: number): number {
  return Math.min(10, Math.max(5, Math.round(minutes / 2.5)))
}

export function reconcileTasks(tasks: ReconcileTask[], facts: ReconcileFacts, today: string): string[] {
  const complete: string[] = []

  for (const t of tasks) {
    if (t.type === 'lesson' && t.status === 'pending' && t.lessonId && facts.completedLessonIds.has(t.lessonId)) {
      complete.push(t.id)
    }
  }

  const bySkill = new Map<string, ReconcileTask[]>()
  for (const t of tasks) {
    if (t.type !== 'practice' || !t.skillId || t.status === 'skipped' || t.date > today) continue
    if (!bySkill.has(t.skillId)) bySkill.set(t.skillId, [])
    bySkill.get(t.skillId)!.push(t)
  }
  for (const [skillId, skillTasks] of bySkill) {
    const answers = [...(facts.answerDatesBySkill[skillId] ?? [])].sort()
    const used = new Array<boolean>(answers.length).fill(false)
    skillTasks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.position - b.position))
    for (const task of skillTasks) {
      const need = practiceTargetQuestions(task.minutes)
      const picked: number[] = []
      for (let i = 0; i < answers.length && picked.length < need; i++) {
        if (!used[i] && answers[i]! >= task.date) picked.push(i)
      }
      // Completed tasks (manual or earlier auto) consume what they can; pending ones need the full count.
      if (task.status === 'completed') {
        for (const i of picked) used[i] = true
      } else if (picked.length >= need) {
        for (const i of picked) used[i] = true
        complete.push(task.id)
      }
    }
  }
  return complete
}
