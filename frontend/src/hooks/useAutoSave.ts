import { useEffect, useRef, useState } from 'react'
import type { SelfEvaluationApiResult, SelfEvaluationPartial } from '../lib/types'

/** Pausing auto-save for the review editor.

The rules that make auto-save safe rather than merely eager:

- Serialization: a save issues only when no request is in flight, so a field
  can never be overwritten by an *older* snapshot arriving last (the classic
  last-write-wins trap of naive autosaves).
- Change-coalescing: edits during the pause window or mid-flight only set the
  dirty flag; nothing is sent until the current drain point. The payload is
  always built **at send time** from the caller's latest state, never captured
  at trigger time.
- Flush points: `flush()` (the explicit button, and Submit) drains a pending
  save immediately and resolves after any in-flight save finishes, so a
  submit never races its own preamble. Unmounting flushes too as a
  best-effort final save.
- Every drained save reports its outcome: `flush()` returns the last save's
  result (null when nothing needed saving), so a caller must not act on the
  assumption that its preamble save reached the server. */

interface AutoSaveOptions {
  delayMs: number
  /** Built at send time so the payload always reflects the newest draft. */
  currentPayload: () => SelfEvaluationPartial
  perform: (payload: SelfEvaluationPartial) => Promise<SelfEvaluationApiResult>
  onSaved: (data: Extract<SelfEvaluationApiResult, { ok: true }>) => void
  onError: (detail: string) => void
}

export function useAutoSave(options: AutoSaveOptions): {
  requestSave: () => void
  flush: () => Promise<SelfEvaluationApiResult | null>
  saving: boolean
} {
  // The callbacks are read through currentOptions at send time, so only the
  // frozen delay is destructured — the rest would be unused locals.
  const { delayMs } = options
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const inFlight = useRef(false)
  const [saving, setSaving] = useState(false)
  const currentOptions = useRef(options)
  currentOptions.current = options

  /** The serial drain: every run queues behind the previous one, so flushes
      that arrive mid-save wait for the whole loop, not just the in-flight
      request. */
  const work = useRef<Promise<SelfEvaluationApiResult | null>>(Promise.resolve(null))

  const clearTimer = (): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const queueRun = (): Promise<SelfEvaluationApiResult | null> => {
    const next = work.current.catch(() => null).then(() => drain())
    work.current = next
    return next
  }

  async function drain(): Promise<SelfEvaluationApiResult | null> {
    if (inFlight.current || !dirty.current) return null
    let last: SelfEvaluationApiResult | null = null
    // A change during a request re-arms immediately: the drain continues.
    while (dirty.current) {
      inFlight.current = true
      setSaving(true)
      const payload = currentOptions.current.currentPayload()
      dirty.current = false
      const result = await currentOptions.current.perform(payload)
      inFlight.current = false
      last = result
      if (result.ok) currentOptions.current.onSaved(result)
      else currentOptions.current.onError(result.detail)
    }
    setSaving(false)
    return last
  }

  /** Mark content changed and schedule the pause-window save. */
  const requestSave = (): void => {
    dirty.current = true
    clearTimer()
    if (!inFlight.current) timer.current = setTimeout(() => void queueRun(), delayMs)
  }

  /** Save now (if anything is pending) and drain any in-flight save;
      returns the outcome of the last save this flush performed. */
  const flush = (): Promise<SelfEvaluationApiResult | null> => {
    clearTimer()
    dirty.current = true
    return queueRun()
  }

  useEffect(() => {
    // Best-effort final save on unmount; an in-flight request completes alone.
    return () => {
      clearTimer()
      if (dirty.current && !inFlight.current) {
        dirty.current = false
        void drain()
      }
    }
  }, [])

  return { requestSave, flush, saving }
}
