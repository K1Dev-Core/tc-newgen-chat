'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, LockKeyhole, PencilRuler, Users } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AppState, Collaborator, ExcalidrawInitialDataState, ExcalidrawImperativeAPI, ExcalidrawProps, SocketId } from '@excalidraw/excalidraw/types';

const ExcalidrawCanvas = dynamic(
  () => import('./ExcalidrawCanvas').then((module) => module.ExcalidrawCanvas),
  { ssr: false, loading: () => <div className="board-loading"><LoaderCircle size={19} />กำลังเตรียมกระดาน…</div> },
);

const EMPTY_SCENE: ExcalidrawInitialDataState = {
  type: 'excalidraw',
  version: 2,
  source: 'tc-newgen-chat',
  elements: [],
  appState: {},
  files: {},
};
// Leave headroom below Supabase Realtime's 1 MB Postgres-change payload limit.
const MAX_SCENE_BYTES = 900 * 1024;

type BoardRow = { server_id: string; scene: ExcalidrawInitialDataState; updated_by: string | null; updated_at: string };
type SaveState = 'loading' | 'ready' | 'saving' | 'saved' | 'error';
type LiveCursor = { clientId: string; userId: string | null; name: string; avatarUrl: string | null; x: number; y: number; tool: 'pointer' | 'laser'; button: 'up' | 'down'; seenAt: number };
type LiveElements = Parameters<NonNullable<ExcalidrawProps['onChange']>>[0];

export function BoardPanel({ serverId, serverName, supabase, canEdit, userId, userName, avatarUrl, onJoin, onNotify }: {
  serverId: string;
  serverName: string;
  supabase: SupabaseClient;
  canEdit: boolean;
  userId: string | null;
  userName: string;
  avatarUrl: string | null;
  onJoin: () => void;
  onNotify: (message: string) => void;
}) {
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [boardError, setBoardError] = useState('');
  const [collaborators, setCollaborators] = useState<Map<SocketId, Collaborator>>(new Map());
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clientIdRef = useRef('');
  const liveSceneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestElementsRef = useRef<LiveElements>([]);
  const latestCursorRef = useRef<{ x: number; y: number; tool: 'pointer' | 'laser'; button: 'up' | 'down' } | null>(null);
  const remoteApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);
  const ignoreRemoteChangesRef = useRef(false);
  const errorNotifiedRef = useRef(false);

  if (!clientIdRef.current && typeof crypto !== 'undefined') clientIdRef.current = crypto.randomUUID();

  const setRemoteCursor = useCallback((cursor: LiveCursor) => {
    if (cursor.clientId === clientIdRef.current) return;
    const hash = Array.from(cursor.userId ?? cursor.clientId).reduce((value, char) => value + char.charCodeAt(0), 0);
    const hue = hash % 360;
    setCollaborators((current) => {
      const next = new Map(current);
      const key = cursor.clientId as SocketId;
      if (Date.now() - cursor.seenAt > 12_000) next.delete(key);
      else next.set(key, {
        id: cursor.userId ?? cursor.clientId,
        socketId: key,
        username: cursor.name,
        avatarUrl: cursor.avatarUrl ?? undefined,
        pointer: { x: cursor.x, y: cursor.y, tool: cursor.tool },
        button: cursor.button,
        color: { background: `hsl(${hue} 75% 92%)`, stroke: `hsl(${hue} 62% 42%)` },
        seenAt: cursor.seenAt,
      } as Collaborator & { seenAt: number });
      return next;
    });
  }, []);

  useEffect(() => {
    apiRef.current?.updateScene({ collaborators });
  }, [collaborators]);

  const applyScene = useCallback((scene: ExcalidrawInitialDataState) => {
    const api = apiRef.current;
    if (!api) return;
    ignoreRemoteChangesRef.current = true;
    api.updateScene({
      elements: scene.elements ?? [],
      appState: { ...api.getAppState(), ...(scene.appState ?? {}) } as AppState,
    });
    if (scene.files) api.addFiles(Object.values(scene.files));
    window.setTimeout(() => { ignoreRemoteChangesRef.current = false; }, 150);
  }, []);

  useEffect(() => {
    let alive = true;
    errorNotifiedRef.current = false;
    setInitialData(null);
    setSaveState('loading');
    setBoardError('');

    const channel = supabase.channel(`server-board:${serverId}`, { config: { broadcast: { self: false } } }).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'server_boards', filter: `server_id=eq.${serverId}` },
      (payload) => {
        const row = payload.new as BoardRow;
        if (!row?.scene || row.updated_by === userId || saveTimerRef.current) return;
        applyScene(row.scene);
        setSaveState('saved');
      },
    ).on('broadcast', { event: 'cursor' }, ({ payload }) => {
      const cursor = payload as LiveCursor;
      if (cursor?.clientId && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) setRemoteCursor(cursor);
    }).on('broadcast', { event: 'cursor-left' }, ({ payload }) => {
      const clientId = (payload as { clientId?: string })?.clientId;
      if (clientId) setCollaborators((current) => { const next = new Map(current); next.delete(clientId as SocketId); return next; });
    }).on('broadcast', { event: 'scene' }, ({ payload }) => {
      const update = payload as { clientId?: string; elements?: LiveElements };
      if (!update?.clientId || update.clientId === clientIdRef.current || !Array.isArray(update.elements)) return;
      const api = apiRef.current;
      if (!api) return;
      if (remoteApplyTimerRef.current) clearTimeout(remoteApplyTimerRef.current);
      ignoreRemoteChangesRef.current = true;
      api.updateScene({ elements: update.elements });
      remoteApplyTimerRef.current = setTimeout(() => { ignoreRemoteChangesRef.current = false; }, 120);
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel;
      }
      if (!alive || status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
      console.error('[Board] Realtime subscription failed.', { serverId, status });
      setBoardError('เชื่อมต่อการอัปเดตบอร์ดไม่สำเร็จ ลองรีเฟรชหน้า');
    });
    const cursorCleanup = window.setInterval(() => {
      const cursor = latestCursorRef.current;
      const liveChannel = channelRef.current;
      if (userId && cursor && liveChannel) void liveChannel.send({ type: 'broadcast', event: 'cursor', payload: {
        clientId: clientIdRef.current, userId, name: userName, avatarUrl,
        ...cursor, seenAt: Date.now(),
      } });
      const cutoff = Date.now() - 12_000;
      setCollaborators((current) => {
        const next = new Map(current);
        let changed = false;
        for (const [id, collaborator] of next) {
          const lastSeen = (collaborator as Collaborator & { seenAt?: number }).seenAt;
          if (lastSeen !== undefined && lastSeen < cutoff) { next.delete(id); changed = true; }
        }
        return changed ? next : current;
      });
    }, 4_000);

    void supabase.from('server_boards').select('scene,updated_by,updated_at').eq('server_id', serverId).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        console.error('[Board] Scene load failed.', { serverId, error });
        setBoardError('โหลดบอร์ดไม่สำเร็จ ตรวจว่ารัน migration ของบอร์ดใน Supabase แล้ว');
        setSaveState('error');
        return;
      }
      setInitialData((data?.scene as ExcalidrawInitialDataState | null) ?? EMPTY_SCENE);
      setSaveState('ready');
    });

    return () => {
      alive = false;
      channelRef.current = null;
      if (liveSceneTimerRef.current) clearTimeout(liveSceneTimerRef.current);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      if (remoteApplyTimerRef.current) clearTimeout(remoteApplyTimerRef.current);
      clearInterval(cursorCleanup);
      if (userId) void channel.send({ type: 'broadcast', event: 'cursor-left', payload: { clientId: clientIdRef.current } });
      // Do not discard the last board edit when navigating away during the
      // debounce window. The scene is captured in pendingSaveRef below.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void pendingSaveRef.current?.();
      }
      saveTimerRef.current = null;
      void supabase.removeChannel(channel);
      apiRef.current = null;
    };
  }, [supabase, serverId, userId, userName, avatarUrl, applyScene, setRemoteCursor]);

  const onChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>((elements, appState, files) => {
    if (!canEdit || !userId || ignoreRemoteChangesRef.current) return;
    latestElementsRef.current = elements;
    if (!liveSceneTimerRef.current) {
      liveSceneTimerRef.current = setTimeout(() => {
        liveSceneTimerRef.current = null;
        const channel = channelRef.current;
        if (channel) void channel.send({ type: 'broadcast', event: 'scene', payload: { clientId: clientIdRef.current, elements: latestElementsRef.current } });
      }, 75);
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState('saving');
    const save = async () => {
        try {
          // `database` serialization deliberately strips binary image files;
          // use `local` so the image data is persisted with its elements.
          const scene = JSON.parse((await import('@excalidraw/excalidraw')).serializeAsJSON(elements, appState, files, 'local')) as ExcalidrawInitialDataState;
          const sceneSize = new TextEncoder().encode(JSON.stringify(scene)).byteLength;
          if (sceneSize > MAX_SCENE_BYTES) {
            setSaveState('error');
            if (!errorNotifiedRef.current) {
              errorNotifiedRef.current = true;
              onNotify('บอร์ดมีข้อมูลเกิน 900 KB ลองลดขนาดหรือลบรูปที่แนบก่อนบันทึก');
            }
            return;
          }
          const { error } = await supabase.from('server_boards').upsert({
            server_id: serverId,
            scene,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'server_id' });
          if (error) throw error;
          errorNotifiedRef.current = false;
          setSaveState('saved');
        } catch (error) {
          console.error('[Board] Scene save failed.', { serverId, error });
          setSaveState('error');
          if (!errorNotifiedRef.current) {
            errorNotifiedRef.current = true;
            onNotify('บันทึกบอร์ดไม่สำเร็จ ตรวจสิทธิ์สมาชิกและการตั้งค่า Supabase');
          }
        }
    };
    pendingSaveRef.current = save;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void save();
    }, 700);
  }, [canEdit, userId, onNotify, supabase, serverId]);

  const onPointerUpdate = useCallback<NonNullable<ExcalidrawProps['onPointerUpdate']>>(({ pointer, button }) => {
    if (!userId || !channelRef.current) return;
    latestCursorRef.current = { x: pointer.x, y: pointer.y, tool: pointer.tool, button };
    if (cursorTimerRef.current) return;
    cursorTimerRef.current = setTimeout(() => {
      cursorTimerRef.current = null;
      const cursor = latestCursorRef.current;
      const channel = channelRef.current;
      if (!cursor || !channel) return;
      void channel.send({ type: 'broadcast', event: 'cursor', payload: {
        clientId: clientIdRef.current, userId, name: userName, avatarUrl,
        ...cursor, seenAt: Date.now(),
      } });
    }, 45);
  }, [userId, userName, avatarUrl]);

  const onApi = useCallback((api: ExcalidrawImperativeAPI) => { apiRef.current = api; }, []);

  const saveLabel = saveState === 'saving' ? 'กำลังบันทึก…'
    : saveState === 'saved' ? 'บันทึกแล้ว'
      : saveState === 'error' ? 'บันทึกไม่สำเร็จ'
        : saveState === 'loading' ? 'กำลังโหลด…' : 'บันทึกอัตโนมัติ';

  return <section className="board-panel" aria-label={`${serverName} shared board`}>
    <header className="board-heading">
      <div className="board-title"><PencilRuler size={17} /><div><strong>บอร์ด · {serverName}</strong><small>วาดและวางแผนร่วมกัน</small></div></div>
      <div className={`board-save-state board-save-${saveState}`} aria-live="polite">
        {saveState === 'saving' || saveState === 'loading' ? <LoaderCircle size={14} className="board-spinner" /> : saveState === 'saved' ? <Users size={14} /> : <LockKeyhole size={14} />}
        <span>{saveLabel}</span>
      </div>
    </header>
    {boardError ? <div className="board-error" role="alert"><strong>เปิดบอร์ดไม่ได้</strong><span>{boardError}</span></div> : initialData && <div className="board-canvas">
      {!canEdit && <div className="board-readonly-note"><LockKeyhole size={13} /><span>เข้าร่วมแชทเพื่อแก้ไขบอร์ด</span><button type="button" onClick={onJoin}>เข้าร่วม</button></div>}
      <ExcalidrawCanvas key={serverId} initialData={initialData} viewOnly={!canEdit} onChange={onChange} onPointerUpdate={onPointerUpdate} onApi={onApi} />
    </div>}
  </section>;
}
