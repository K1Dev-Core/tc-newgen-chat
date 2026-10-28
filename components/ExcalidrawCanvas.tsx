'use client';

import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawInitialDataState, ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';

export function ExcalidrawCanvas({ initialData, viewOnly, onChange, onApi }: {
  initialData: ExcalidrawInitialDataState;
  viewOnly: boolean;
  onChange: ExcalidrawProps['onChange'];
  onApi: (api: ExcalidrawImperativeAPI) => void;
}) {
  return <div className="excalidraw-canvas-shell">
    <Excalidraw
      initialData={initialData}
      viewModeEnabled={viewOnly}
      onChange={onChange}
      excalidrawAPI={onApi}
      theme="light"
      langCode="en"
    />
  </div>;
}
