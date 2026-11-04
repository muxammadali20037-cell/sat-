'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Hand, LogOut, Mic, MicOff, MonitorUp, Send, Video, VideoOff } from 'lucide-react'
import { ConnectionState, Room, RoomEvent, Track, type Participant, type RemoteParticipant } from 'livekit-client'
import { useDict } from '@/lib/i18n/client'
import { format, plural } from '@/lib/i18n/dict'
import { liveDict } from '@/lib/i18n/dictionaries/live'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Whiteboard } from './whiteboard'
import { LivePolls } from './live-polls'
import {
  applyBoard,
  BoardMessageSchema,
  ClassMessageSchema,
  decode,
  encode,
  roleFromMetadata,
  TOPIC_BOARD,
  TOPIC_CLASS,
  type BoardMessage,
  type ClassMessage,
  type Stroke,
} from '@/features/live/protocol'

type Phase = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'left' | 'error'
type ChatLine = { id: string; name: string; staff: boolean; self: boolean; text: string; at: number }

function TrackView({ participant, source, muted }: { participant: Participant; source: Track.Source; muted?: boolean }) {
  const ref = React.useRef<HTMLVideoElement>(null)
  const track = participant.getTrackPublication(source)?.track
  React.useEffect(() => {
    const el = ref.current
    if (!el || !track) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])
  if (!track) return null
  return <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full bg-black object-contain" />
}

function AudioSink({ participant }: { participant: RemoteParticipant }) {
  const ref = React.useRef<HTMLAudioElement>(null)
  const track = participant.getTrackPublication(Track.Source.Microphone)?.track
  React.useEffect(() => {
    const el = ref.current
    if (!el || !track) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])
  return <audio ref={ref} autoPlay />
}

export function LiveRoom({
  sessionId,
  title,
  subtitle,
  role,
  selfId,
  backHref,
  workspaceId,
  groupId,
}: {
  sessionId: string
  title: string
  subtitle: string
  role: 'staff' | 'student'
  selfId: string
  backHref: string
  workspaceId: string
  groupId: string
}) {
  const t = useDict(liveDict)
  const room = React.useRef<Room | null>(null)
  const strokesRef = React.useRef<Stroke[]>([])
  const [current, setCurrent] = React.useState<Room | null>(null)
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [, setTick] = React.useState(0)
  const rerender = React.useCallback(() => setTick((n) => n + 1), [])
  const [strokes, setStrokes] = React.useState<Stroke[]>([])
  const [chat, setChat] = React.useState<ChatLine[]>([])
  const [hands, setHands] = React.useState<Set<string>>(new Set())
  const [draftChat, setDraftChat] = React.useState('')
  const [mediaProblem, setMediaProblem] = React.useState(false)
  const [pollsVersion, setPollsVersion] = React.useState(0)
  const staff = role === 'staff'

  const updateStrokes = React.useCallback((next: Stroke[]) => {
    strokesRef.current = next
    setStrokes(next)
  }, [])

  const send = React.useCallback(async (topic: string, msg: BoardMessage | ClassMessage, to?: string[]) => {
    const r = room.current
    if (!r || r.state !== ConnectionState.Connected) return
    await r.localParticipant.publishData(encode(msg), { reliable: true, topic, destinationIdentities: to })
  }, [])

  const join = React.useCallback(async () => {
    setPhase('connecting')
    setError(null)
    try {
      const { url, token } = await apiFetch<{ url: string; token: string; role: string }>('/api/live/token', { method: 'POST', body: { sessionId } })
      const r = new Room({ adaptiveStream: true, dynacast: true })
      room.current = r
      setCurrent(r)
      for (const ev of [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackSubscribed,
        RoomEvent.TrackUnsubscribed,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.ActiveSpeakersChanged,
      ]) {
        r.on(ev, rerender)
      }
      r.on(RoomEvent.ParticipantDisconnected, (p) => setHands((h) => (h.has(p.identity) ? new Set([...h].filter((x) => x !== p.identity)) : h)))
      r.on(RoomEvent.Reconnecting, () => setPhase('reconnecting'))
      r.on(RoomEvent.Reconnected, () => setPhase('connected'))
      r.on(RoomEvent.Disconnected, () => setPhase((p) => (p === 'error' ? p : 'left')))
      r.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (!participant) return
        const senderRole = roleFromMetadata(participant.metadata)
        if (topic === TOPIC_BOARD) {
          const msg = decode(BoardMessageSchema, payload)
          if (!msg) return
          if (msg.t === 'sync-req') {
            if (staff) void send(TOPIC_BOARD, { t: 'sync', strokes: strokesRef.current }, [participant.identity])
            return
          }
          updateStrokes(applyBoard(strokesRef.current, msg, senderRole))
        } else if (topic === TOPIC_CLASS) {
          const msg = decode(ClassMessageSchema, payload)
          if (!msg) return
          if (msg.t === 'chat') {
            setChat((c) =>
              [...c, { id: `${participant.identity}-${Date.now()}`, name: participant.name || '—', staff: senderRole === 'staff', self: false, text: msg.text, at: Date.now() }].slice(-200),
            )
          } else if (msg.t === 'hand') {
            setHands((h) => {
              const next = new Set(h)
              if (msg.up) next.add(participant.identity)
              else next.delete(participant.identity)
              return next
            })
          } else if (msg.t === 'lower-all' && senderRole === 'staff') {
            setHands(new Set())
          } else if (msg.t === 'polls') {
            setPollsVersion((v) => v + 1)
          }
        }
      })
      await r.connect(url, token)
      setPhase('connected')
      try {
        await r.localParticipant.setMicrophoneEnabled(true)
        await r.localParticipant.setCameraEnabled(true)
      } catch {
        setMediaProblem(true)
      }
      // Students ask the teacher for the current board; the teacher answers only them.
      if (!staff) void send(TOPIC_BOARD, { t: 'sync-req' })
      rerender()
    } catch (err) {
      setPhase('error')
      setError(err instanceof ApiClientError ? err.message : t.error)
    }
  }, [sessionId, rerender, send, staff, t.error, updateStrokes])

  React.useEffect(() => () => void room.current?.disconnect(), [])

  const r = current
  const local = r?.localParticipant
  const everyone: Participant[] = r ? [r.localParticipant, ...r.remoteParticipants.values()] : []
  const sharer = everyone.find((p) => p.getTrackPublication(Track.Source.ScreenShare)?.track)
  const toggle = async (kind: 'mic' | 'cam' | 'screen') => {
    if (!local) return
    try {
      if (kind === 'mic') await local.setMicrophoneEnabled(!local.isMicrophoneEnabled)
      if (kind === 'cam') await local.setCameraEnabled(!local.isCameraEnabled)
      if (kind === 'screen') await local.setScreenShareEnabled(!local.isScreenShareEnabled)
      setMediaProblem(false)
    } catch {
      setMediaProblem(true)
    }
    rerender()
  }
  const myHand = hands.has(selfId)

  if (phase === 'idle' || phase === 'connecting' || phase === 'error' || phase === 'left') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4 py-10">
        <div className="space-y-3 rounded-xl border border-border bg-surface p-6" data-testid="live-prejoin">
          <p className="text-[13px] text-muted-foreground">{subtitle}</p>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{t.privacy}</p>
          {phase === 'left' && <p className="text-sm text-foreground">{t.disconnected}</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={() => void join()} loading={phase === 'connecting'}>
              {phase === 'left' ? t.rejoin : phase === 'connecting' ? t.joining : t.join}
            </Button>
            <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              <ArrowLeft className="size-4" aria-hidden /> {t.back}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const ctrl = (on: boolean) => cn('inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium [&_svg]:size-4', on ? 'border-border-strong bg-surface text-foreground' : 'border-destructive/40 bg-destructive/10 text-destructive')

  return (
    <div className="flex min-h-dvh flex-col bg-background" data-testid="live-room" data-phase={phase}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold text-foreground">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {subtitle} · <span data-testid="live-count">{plural(everyone.length, t.people)}</span>
            {hands.size > 0 && <span className="ml-1 font-medium text-warning-foreground"> · {plural(hands.size, t.handsUp)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ctrl(!!local?.isMicrophoneEnabled)} onClick={() => void toggle('mic')} aria-pressed={!!local?.isMicrophoneEnabled}>
            {local?.isMicrophoneEnabled ? <Mic aria-hidden /> : <MicOff aria-hidden />} <span className="hidden sm:inline">{t.mic}</span>
          </button>
          <button type="button" className={ctrl(!!local?.isCameraEnabled)} onClick={() => void toggle('cam')} aria-pressed={!!local?.isCameraEnabled}>
            {local?.isCameraEnabled ? <Video aria-hidden /> : <VideoOff aria-hidden />} <span className="hidden sm:inline">{t.cam}</span>
          </button>
          {staff && (
            <button type="button" className={ctrl(true)} onClick={() => void toggle('screen')}>
              <MonitorUp aria-hidden /> <span className="hidden sm:inline">{local?.isScreenShareEnabled ? t.stopScreen : t.screen}</span>
            </button>
          )}
          {staff ? (
            hands.size > 0 && (
              <button type="button" className={ctrl(true)} onClick={() => (setHands(new Set()), void send(TOPIC_CLASS, { t: 'lower-all' }))}>
                <Hand aria-hidden /> {t.lowerAll}
              </button>
            )
          ) : (
            <button
              type="button"
              className={cn(ctrl(true), myHand && 'border-warning bg-warning-soft')}
              aria-pressed={myHand}
              onClick={() => {
                setHands((h) => {
                  const next = new Set(h)
                  if (myHand) next.delete(selfId)
                  else next.add(selfId)
                  return next
                })
                void send(TOPIC_CLASS, { t: 'hand', up: !myHand })
              }}
            >
              <Hand aria-hidden /> <span className="hidden sm:inline">{myHand ? t.lowerHand : t.raiseHand}</span>
            </button>
          )}
          <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground" onClick={() => void r?.disconnect()}>
            <LogOut className="size-4" aria-hidden /> {t.leave}
          </button>
        </div>
      </header>
      {phase === 'reconnecting' && <p className="bg-warning-soft px-4 py-1.5 text-center text-[13px] text-warning-foreground">{t.reconnecting}</p>}
      {mediaProblem && <p className="bg-muted px-4 py-1.5 text-center text-[13px] text-muted-foreground">{t.noMedia}</p>}

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {sharer && (
            <div className="aspect-video overflow-hidden rounded-lg border border-border bg-black" data-testid="screen-share">
              <TrackView participant={sharer} source={Track.Source.ScreenShare} muted />
            </div>
          )}
          <section aria-label={t.board}>
            <h2 className="mb-2 text-[13px] font-medium text-muted-foreground">{t.board}</h2>
            <Whiteboard
              strokes={strokes}
              canDraw={staff}
              labels={{ tools: t.tools, textPrompt: t.textPrompt, viewOnly: t.boardViewOnly }}
              onAdd={(s) => {
                updateStrokes([...strokesRef.current, s])
                void send(TOPIC_BOARD, { t: 'add', stroke: s })
              }}
              onUndo={() => {
                updateStrokes(strokesRef.current.slice(0, -1))
                void send(TOPIC_BOARD, { t: 'undo' })
              }}
              onClear={() => {
                updateStrokes([])
                void send(TOPIC_BOARD, { t: 'clear' })
              }}
            />
            <a href="https://www.desmos.com/calculator" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline">
              {t.desmos}
            </a>
          </section>
          <LivePolls
            sessionId={sessionId}
            workspaceId={workspaceId}
            groupId={groupId}
            staff={staff}
            version={pollsVersion}
            labels={{ title: t.polls, empty: t.noPolls, ask: t.askQuestion }}
            onChanged={() => {
              setPollsVersion((v) => v + 1)
              void send(TOPIC_CLASS, { t: 'polls' })
            }}
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <ul className="grid grid-cols-2 gap-2" data-testid="live-tiles">
            {everyone.map((p) => {
              const isStaff = roleFromMetadata(p.metadata) === 'staff'
              const self = p.identity === selfId
              return (
                <li
                  key={p.identity}
                  className={cn('relative aspect-video overflow-hidden rounded-md border bg-muted', p.isSpeaking ? 'border-success ring-2 ring-success/40' : 'border-border')}
                  data-participant={p.identity}
                >
                  <TrackView participant={p} source={Track.Source.Camera} muted={self} />
                  {!self && !p.isLocal && <AudioSink participant={p as RemoteParticipant} />}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
                    {hands.has(p.identity) && '✋ '}
                    {p.name || '—'}
                    {self && ` (${t.you})`}
                    {isStaff && ` · ${t.teacher}`}
                  </span>
                </li>
              )
            })}
          </ul>

          <section className="flex min-h-64 flex-1 flex-col rounded-lg border border-border bg-surface" aria-label={t.chat}>
            <h2 className="border-b border-border px-3 py-2 text-[13px] font-medium text-muted-foreground">{t.chat}</h2>
            <ol className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm" data-testid="live-chat" aria-live="polite">
              {chat.map((m) => (
                <li key={m.id}>
                  <span className={cn('font-medium', m.staff ? 'text-primary' : 'text-foreground')}>{m.self ? t.you : m.name}</span>
                  <span className="text-muted-foreground">: </span>
                  <span className="break-words text-foreground">{m.text}</span>
                </li>
              ))}
            </ol>
            <form
              className="flex gap-2 border-t border-border p-2"
              onSubmit={(e) => {
                e.preventDefault()
                const text = draftChat.trim().slice(0, 500)
                if (!text) return
                setChat((c) => [...c, { id: `me-${Date.now()}`, name: t.you, staff, self: true, text, at: Date.now() }].slice(-200))
                setDraftChat('')
                void send(TOPIC_CLASS, { t: 'chat', text })
              }}
            >
              <input
                value={draftChat}
                onChange={(e) => setDraftChat(e.target.value)}
                maxLength={500}
                placeholder={t.chatPlaceholder}
                aria-label={t.chatPlaceholder}
                className="h-9 min-w-0 flex-1 rounded-md border border-border-strong bg-background px-2.5 text-sm"
              />
              <Button type="submit" size="sm" aria-label={t.send}>
                <Send aria-hidden />
              </Button>
            </form>
          </section>
          <p className="text-xs text-muted-foreground">{format(t.privacy, {})}</p>
        </aside>
      </div>
    </div>
  )
}
