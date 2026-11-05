/**
 * The 0 → 1600 path (pure, unit-tested). Six stages by SAT MASTER score estimate. A stage counts as
 * passed ONLY when the latest estimate from a diagnostic or mock exam reaches its goal, so the path
 * can never show progress the student has not made. Missions are the practice that usually gets a
 * student there; they show progress from the student's own records and unlock nothing by themselves.
 * Estimates are SAT MASTER's own, not official College Board scores, and no score is guaranteed.
 */

export type StageId = 'foundation' | 'climb' | 'builder' | 'strong' | 'elite' | 'summit'
export type MissionId = 'diagnostic' | 'lessons' | 'easy' | 'medium' | 'hard' | 'mocks' | 'streak' | 'words'

export type Stage = {
  id: StageId
  from: number
  goal: number
  missions: Partial<Record<MissionId, number>>
  /**
   * Skills to practise first at this level: frequent on recent tests at this difficulty (from an
   * analysis of 317 recalled math and 163 recalled reading-and-writing items, 2026; counts only).
   */
  focus: { math: string[]; reading_writing: string[] }
}

export const STAGES: Stage[] = [
  {
    id: 'foundation',
    from: 400,
    goal: 800,
    missions: { diagnostic: 1, lessons: 5, easy: 50, streak: 3, words: 15 },
    focus: { math: ['linear_equations_one_variable', 'linear_functions', 'linear_equations_two_variables', 'ratios_rates_proportions_units'], reading_writing: ['rhetorical_synthesis', 'words_in_context', 'transitions'] },
  },
  {
    id: 'climb',
    from: 800,
    goal: 1000,
    missions: { lessons: 15, easy: 120, medium: 40, mocks: 1, streak: 7, words: 40 },
    focus: { math: ['systems_linear_equations', 'percentages', 'area_volume', 'one_variable_data'], reading_writing: ['central_ideas_details', 'boundaries', 'form_structure_sense'] },
  },
  {
    id: 'builder',
    from: 1000,
    goal: 1200,
    missions: { lessons: 30, medium: 150, hard: 20, mocks: 2, streak: 10, words: 80 },
    focus: { math: ['nonlinear_functions', 'linear_inequalities', 'equivalent_expressions', 'lines_angles_triangles'], reading_writing: ['text_structure_purpose', 'boundaries', 'inferences'] },
  },
  {
    id: 'strong',
    from: 1200,
    goal: 1350,
    missions: { medium: 300, hard: 80, mocks: 3, streak: 14, words: 120 },
    focus: { math: ['nonlinear_equations_systems', 'circles', 'right_triangles_trigonometry', 'nonlinear_functions'], reading_writing: ['transitions', 'words_in_context', 'form_structure_sense'] },
  },
  {
    id: 'elite',
    from: 1350,
    goal: 1450,
    missions: { hard: 180, mocks: 5, streak: 21, words: 180 },
    focus: { math: ['nonlinear_functions', 'nonlinear_equations_systems', 'equivalent_expressions', 'circles'], reading_writing: ['command_of_evidence_textual', 'command_of_evidence_quantitative', 'cross_text_connections'] },
  },
  {
    id: 'summit',
    from: 1450,
    goal: 1600,
    missions: { hard: 300, mocks: 8, streak: 30, words: 220 },
    focus: { math: ['nonlinear_equations_systems', 'right_triangles_trigonometry', 'equivalent_expressions'], reading_writing: ['cross_text_connections', 'inferences', 'command_of_evidence_textual'] },
  },
]

export type PathStats = {
  /** Latest total estimate (middle of the range) from a diagnostic or mock with both sections; null if none. */
  estimate: number | null
  diagnosticsCompleted: number
  lessonsCompleted: number
  correct: { easy: number; medium: number; hard: number }
  mocksCompleted: number
  longestStreak: number
  words: number
}

export type MissionView = { id: MissionId; value: number; target: number; done: boolean }
export type StageView = Stage & {
  state: 'passed' | 'current' | 'locked'
  missions: Partial<Record<MissionId, number>>
  missionViews: MissionView[]
  missionsDone: number
}
export type PathView = {
  stages: StageView[]
  current: StageView
  /** 0–100: where the estimate sits inside the current stage's band (0 without an estimate). */
  bandProgress: number
  /** 0–100 along the whole 400–1600 scale. */
  overall: number
  allPassed: boolean
}

function missionValue(id: MissionId, s: PathStats): number {
  switch (id) {
    case 'diagnostic':
      return s.diagnosticsCompleted
    case 'lessons':
      return s.lessonsCompleted
    case 'easy':
      return s.correct.easy
    case 'medium':
      return s.correct.medium
    case 'hard':
      return s.correct.hard
    case 'mocks':
      return s.mocksCompleted
    case 'streak':
      return s.longestStreak
    case 'words':
      return s.words
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function buildPath(stats: PathStats): PathView {
  const est = stats.estimate !== null && Number.isFinite(stats.estimate) ? clamp(Math.round(stats.estimate), 400, 1600) : null
  const currentIndex = est === null ? 0 : (() => {
    const i = STAGES.findIndex((st) => est < st.goal)
    return i === -1 ? STAGES.length - 1 : i
  })()
  const allPassed = est !== null && est >= STAGES[STAGES.length - 1].goal
  const stages: StageView[] = STAGES.map((st, i) => {
    const missionViews = (Object.entries(st.missions) as Array<[MissionId, number]>).map(([id, target]) => {
      const value = Math.max(0, missionValue(id, stats))
      return { id, value: Math.min(value, target), target, done: value >= target }
    })
    const state: StageView['state'] = allPassed || i < currentIndex ? 'passed' : i === currentIndex ? 'current' : 'locked'
    return { ...st, state, missionViews, missionsDone: missionViews.filter((m) => m.done).length }
  })
  const current = stages[currentIndex]
  const bandProgress = est === null ? 0 : allPassed ? 100 : Math.round(clamp(((est - current.from) / (current.goal - current.from)) * 100, 0, 100))
  const overall = est === null ? 0 : Math.round(((est - 400) / 1200) * 100)
  return { stages, current, bandProgress, overall, allPassed }
}
