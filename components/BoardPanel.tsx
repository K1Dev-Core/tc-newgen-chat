'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, LockKeyhole, PencilRuler, Users } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppState, ExcalidrawInitialDataState, ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';

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

export function BoardPanel({ serverId, serverName, supabase, canEdit, userId, onJoin, onNotify }: {
  serverId: string;
  serverName: string;
  supabase: SupabaseClient;
  canEdit: boolean;
  userId: string | null;
  onJoin: () => void;
  onNotify: (message: string) => void;
}) {
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [boardError, setBoardError] = useState('');
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreRemoteChangesRef = useRef(false);
  const errorNotifiedRef = useRef(false);

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

    const channel = supabase.channel(`server-board:${serverId}`).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'server_boards', filter: `server_id=eq.${serverId}` },
      (payload) => {
        const row = payload.new as BoardRow;
        if (!row?.scene || row.updated_by === userId || saveTimerRef.current) return;
        applyScene(row.scene);
        setSaveState('saved');
      },
    ).subscribe((status) => {
      if (!alive || status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
      console.error('[Board] Realtime subscription failed.', { serverId, status });
      setBoardError('เชื่อมต่อการอัปเดตบอร์ดไม่สำเร็จ ลองรีเฟรชหน้า');
    });

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
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      void supabase.removeChannel(channel);
      apiRef.current = null;
    };
  }, [supabase, serverId, userId, applyScene]);

  const onChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>((elements, appState, files) => {
    if (!canEdit || !userId || ignoreRemoteChangesRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState('saving');
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void (async () => {
        try {
          const scene = JSON.parse((await import('@excalidraw/excalidraw')).serializeAsJSON(elements, appState, files, 'database')) as ExcalidrawInitialDataState;
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
      })();
    }, 700);
  }, [canEdit, userId, onNotify, supabase, serverId]);

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
      <ExcalidrawCanvas key={serverId} initialData={initialData} viewOnly={!canEdit} onChange={onChange} onApi={onApi} />
    </div>}
  </section>;
}
