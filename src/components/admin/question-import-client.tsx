'use client'

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, FileUp, ListChecks, Upload, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Label, NativeSelect, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  IMPORT_COLUMNS,
  IMPORT_COLUMN_HELP,
  IMPORT_MAX_ROWS,
  REQUIRED_COLUMNS,
  buildCsvTemplate,
  buildImportReport,
  type ImportReport,
  type ImportTaxonomy,
} from '@/features/content/question-import'
import { importQuestionsAction, type ImportOutcome } from '@/features/content/import-actions'

/** Server actions accept 1 MB request bodies; keep the UTF-8 payload comfortably below. */
const MAX_BYTES = 900_000

export function QuestionImportClient({ taxonomy }: { taxonomy: ImportTaxonomy }) {
  const [text, setText] = React.useState('')
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [format, setFormat] = React.useState<'auto' | 'csv' | 'json'>('auto')
  const [report, setReport] = React.useState<ImportReport | null>(null)
  const [onlyInvalid, setOnlyInvalid] = React.useState(false)
  const [confirm, setConfirm] = React.useState(false)
  const [outcome, setOutcome] = React.useState<ImportOutcome | null>(null)
  const [pending, start] = React.useTransition()
  const bytes = React.useMemo(() => new TextEncoder().encode(text).length, [text])

  function validate(source = text) {
    setOutcome(null)
    if (new TextEncoder().encode(source).length > MAX_BYTES) {
      setReport({ format: 'csv', fileErrors: [`The file is larger than ${Math.round(MAX_BYTES / 1000)} KB. Split it into smaller files.`], warnings: [], rows: [], validCount: 0, invalidCount: 0 })
      return
    }
    setReport(buildImportReport(source, taxonomy, format))
  }

  async function onFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(`The file is larger than ${Math.round(MAX_BYTES / 1000)} KB. Split it into smaller files.`)
      return
    }
    const content = await file.text()
    setText(content)
    setFileName(file.name)
    if (file.name.toLowerCase().endsWith('.json')) setFormat('json')
    else if (file.name.toLowerCase().endsWith('.csv')) setFormat('csv')
    validate(content)
  }

  function downloadTemplate() {
    const blob = new Blob([`﻿${buildCsvTemplate()}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sat-master-questions-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function runImport() {
    start(async () => {
      const res = await importQuestionsAction({ text, format, fileName: fileName ?? undefined })
      setConfirm(false)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setOutcome(res.data!)
      toast.success(res.message ?? 'Imported')
    })
  }

  const rows = report?.rows.filter((r) => !onlyInvalid || !r.ok) ?? []

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>1. Add your questions</CardTitle>
            <p className="text-[13px] text-muted-foreground">
              Upload a .csv or .json file, or paste its contents. Up to {IMPORT_MAX_ROWS} questions per import. Nothing is saved until you confirm the import.
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-[13px] font-medium hover:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
                <FileUp className="size-4" aria-hidden /> Choose file
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="sr-only"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0]
                    if (f) void onFile(f)
                    ev.target.value = ''
                  }}
                />
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
                <Download /> Download CSV template
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Label htmlFor="import-format" className="text-[13px] text-muted-foreground">
                  Format
                </Label>
                <NativeSelect id="import-format" value={format} onChange={(ev) => setFormat(ev.target.value as typeof format)} className="h-9 w-28 text-[13px]">
                  <option value="auto">Detect</option>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </NativeSelect>
              </div>
            </div>
            {fileName && <p className="text-[13px] text-muted-foreground">Loaded {fileName}. Edits below apply to this import only.</p>}
            <Textarea
              aria-label="CSV or JSON content"
              value={text}
              onChange={(ev) => {
                setText(ev.target.value)
                setReport(null)
                setOutcome(null)
              }}
              placeholder={`skill_code,difficulty,question_type,stem,option_a,option_b,option_c,option_d,correct,spr_answers,explanation_en\nlinear_functions,easy,mc,"What is the slope of $y = 2x + 3$?",$2$,$3$,$-2$,$\\frac{1}{2}$,A,,"The slope is the coefficient of $x$, which is 2."`}
              className="min-h-56 font-mono text-[12px]"
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => validate()} disabled={!text.trim()}>
                <ListChecks /> Validate (dry run)
              </Button>
              <span className={cn('text-[13px] tabular', bytes > MAX_BYTES ? 'text-destructive' : 'text-muted-foreground')}>
                {(bytes / 1000).toFixed(1)} KB of {MAX_BYTES / 1000} KB
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Columns</CardTitle>
            <p className="text-[13px] text-muted-foreground">
              Required: {REQUIRED_COLUMNS.join(', ')}. JSON uses the same keys (arrays allowed for spr_answers, tags and options).
            </p>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-[13px]">
                <caption className="sr-only">Import columns</caption>
                <tbody>
                  {IMPORT_COLUMNS.map((c) => (
                    <tr key={c} className="border-b border-border last:border-0">
                      <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left align-top font-mono font-normal">
                        {c}
                      </th>
                      <td className="px-3 py-1.5 text-muted-foreground">{IMPORT_COLUMN_HELP[c]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>2. Review the dry run</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            {report.fileErrors.length > 0 ? (
              <Alert variant="destructive" title="This file cannot be imported">
                <ul className="list-disc pl-5">
                  {report.fileErrors.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="success">
                    <CheckCircle2 /> {report.validCount} valid
                  </Badge>
                  <Badge variant={report.invalidCount > 0 ? 'destructive' : 'neutral'}>
                    <XCircle /> {report.invalidCount} with errors
                  </Badge>
                  <span className="text-[13px] text-muted-foreground">{report.format.toUpperCase()} · imported questions are saved as drafts and must be reviewed before publishing.</span>
                  <label className="ml-auto flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={onlyInvalid} onChange={(ev) => setOnlyInvalid(ev.target.checked)} className="size-4 accent-[var(--primary)]" />
                    Only rows with errors
                  </label>
                </div>
                {report.warnings.length > 0 && <Alert variant="warning">{report.warnings.join(' ')}</Alert>}
                <div className="max-h-[32rem] overflow-auto rounded-lg border border-border">
                  <table className="w-full min-w-[720px] border-collapse text-[13px]">
                    <caption className="sr-only">Dry-run results per row</caption>
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        {['Row', 'Result', 'Skill', 'Type', 'Difficulty', 'Stem', 'Messages'].map((h) => (
                          <th key={h} scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.row} className={cn('border-t border-border align-top', !r.ok && 'bg-destructive-soft/40')}>
                          <td className="px-3 py-2 tabular">{r.row}</td>
                          <td className="px-3 py-2">{r.ok ? <Badge variant="success">Valid</Badge> : <Badge variant="destructive">Error</Badge>}</td>
                          <td className="px-3 py-2">
                            <span className="font-mono">{r.preview.skillCode || '—'}</span>
                            {r.preview.skillName && <span className="block text-muted-foreground">{r.preview.skillName}</span>}
                          </td>
                          <td className="px-3 py-2">{r.preview.questionType || '—'}</td>
                          <td className="px-3 py-2">{r.preview.difficulty || '—'}</td>
                          <td className="max-w-xs px-3 py-2">{r.preview.stem || '—'}</td>
                          <td className="px-3 py-2">
                            {!r.ok && (
                              <ul className="grid grid-cols-1 gap-0.5 text-destructive">
                                {r.errors.map((m) => (
                                  <li key={m}>{m}</li>
                                ))}
                              </ul>
                            )}
                            {r.warnings.map((w) => (
                              <p key={w} className="text-warning-foreground">
                                {w}
                              </p>
                            ))}
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                            Every row is valid.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => setConfirm(true)} disabled={report.validCount === 0 || pending} loading={pending}>
                    <Upload /> Import {report.validCount} valid row{report.validCount === 1 ? '' : 's'} as drafts
                  </Button>
                  {report.invalidCount > 0 && <span className="text-[13px] text-muted-foreground">Rows with errors are skipped. Fix them and import again later.</span>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {outcome && (
        <Card>
          <CardHeader>
            <CardTitle>3. Import result</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3">
            <Alert variant={outcome.failed.length > 0 ? 'warning' : 'success'} title={`${outcome.created.length} question${outcome.created.length === 1 ? '' : 's'} created as drafts`}>
              {outcome.failed.length} failed while saving · {outcome.skippedInvalid} invalid row{outcome.skippedInvalid === 1 ? '' : 's'} skipped. The import is recorded in the audit log.
            </Alert>
            {outcome.failed.length > 0 && (
              <ul className="grid grid-cols-1 gap-1 text-[13px] text-destructive">
                {outcome.failed.map((f) => (
                  <li key={f.row}>
                    Row {f.row}: {f.error}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/questions?view=review" className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover">
                Open the review queue
              </Link>
              <Button
                variant="secondary"
                size="sm"
                className="h-9"
                onClick={() => {
                  setText('')
                  setFileName(null)
                  setReport(null)
                  setOutcome(null)
                }}
              >
                Start another import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Import ${report?.validCount ?? 0} questions?`}
        description="Valid rows are re-checked on the server and saved as drafts. They will not be visible to students until reviewed and published."
        confirmLabel="Import as drafts"
        loading={pending}
        onConfirm={runImport}
      />
    </div>
  )
}
