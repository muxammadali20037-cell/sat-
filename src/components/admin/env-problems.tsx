import { Alert } from '@/components/ui/card'
import type { EnvProblem } from '@/lib/env'

/** Server settings that are present but invalid (ignored at runtime). Never shows values. */
export function EnvProblemsAlert({ problems, className }: { problems: EnvProblem[]; className?: string }) {
  if (problems.length === 0) return null
  return (
    <Alert variant="destructive" className={className} title="Some hosting settings are invalid and are being ignored">
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {problems.map((p) => (
          <li key={p.key}>
            <code className="font-medium">{p.key}</code>: {p.message}
          </li>
        ))}
      </ul>
      <p className="mt-2">Fix the value in Vercel → Settings → Environment Variables, then redeploy. The features that use it stay off until then.</p>
    </Alert>
  )
}
