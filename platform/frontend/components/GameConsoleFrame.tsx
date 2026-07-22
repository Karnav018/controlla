'use client';

import { useEffect, useRef } from 'react';
import type { ControllerLayout } from '../lib/protocol';

interface Props {
  url: string;
  layout: ControllerLayout | null;
  context: { playerId: string; nickname: string; code: string; gameId: string };
  onInput(controlId: string, action: string, value?: string | number | boolean): void;
}

/**
 * The game's own phone-console UI, embedded while its game runs. Controlla is
 * a platform for consoles, not games: the platform owns the connection,
 * identity, reconnection, and input transport — the game owns every pixel.
 *
 * Bridge (postMessage):
 *  frame → platform  { type: 'controlla:ready' }               announce listener
 *  platform → frame  { type: 'controlla:context', ...context } who this phone is
 *  platform → frame  { type: 'controlla:layout', layout }      the plugin's per-player
 *                                                              layout (role hints —
 *                                                              e.g. canvas ⇒ drawer)
 *  frame → platform  { type: 'controlla:input', controlId, action, value? }
 */
export function GameConsoleFrame({ url, layout, context, onInput }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);

  const push = (msg: unknown) => frameRef.current?.contentWindow?.postMessage(msg, '*');

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { type?: string; controlId?: unknown; action?: unknown; value?: unknown };
      if (data?.type === 'controlla:ready') {
        readyRef.current = true;
        push({ type: 'controlla:context', ...context });
        push({ type: 'controlla:layout', layout });
        return;
      }
      if (data?.type === 'controlla:input' && typeof data.controlId === 'string' && typeof data.action === 'string') {
        const value = data.value;
        onInput(
          data.controlId,
          data.action,
          typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined
        );
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.playerId, context.gameId, onInput]);

  // Layout changes (role switches, new turns) stream into the game's console.
  useEffect(() => {
    if (readyRef.current) push({ type: 'controlla:layout', layout });
  }, [layout]);

  return (
    <iframe
      ref={frameRef}
      src={url}
      title="game console"
      allow="autoplay"
      style={{
        flex: 1,
        width: '100%',
        minHeight: '72dvh',
        border: 'none',
        borderRadius: 18,
        background: '#000'
      }}
    />
  );
}
