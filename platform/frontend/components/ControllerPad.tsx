'use client';

import { useState } from 'react';
import type { ControllerLayout, LayoutComponent } from '../lib/protocol';
import { DrawCanvas } from './DrawCanvas';

interface Props {
  layout: ControllerLayout;
  onInput(controlId: string, action: string, value?: string | number | boolean): void;
}

/**
 * The Dynamic Controller renderer: draws whatever layout the game emitted and
 * routes every touch back as CONTROLLER_INPUT. Games never ship phone UI code
 * — this component IS the phone UI. Unknown component kinds degrade to a
 * placeholder instead of crashing (versioned-layout rule).
 */
export function ControllerPad({ layout, onInput }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', flex: 1, minHeight: 0, justifyContent: 'center' }}>
      {layout.components.map((c) => (
        <Component key={c.id} c={c} onInput={onInput} />
      ))}
    </div>
  );
}

function Component({ c, onInput }: { c: LayoutComponent; onInput: Props['onInput'] }) {
  switch (c.kind) {
    case 'label':
      return (
        <div
          className="font-grotesk"
          style={{ textAlign: 'center', fontSize: 16, fontWeight: 600, color: 'var(--muted)', textWrap: 'pretty' }}
        >
          {c.text}
        </div>
      );

    case 'buttons': {
      const big = c.buttons.length === 1;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: big ? '1fr' : 'repeat(2, 1fr)', gap: 10 }}>
          {c.buttons.map((b) => (
            <button
              key={b.id}
              onPointerDown={() => onInput(b.id, 'press')}
              className="font-grotesk play-btn"
              style={{
                border: 'none',
                borderRadius: 16,
                padding: big ? '28px 16px' : '20px 14px',
                fontSize: big ? 26 : 20,
                fontWeight: 700,
                background: 'var(--accent)',
                color: 'var(--accent-ink)',
                cursor: 'pointer',
                touchAction: 'manipulation',
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: '0 10px 34px color-mix(in srgb, var(--accent) 30%, transparent)'
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      );
    }

    case 'dpad': {
      const dir = (d: string) => () => onInput(c.id, 'press', d);
      const pad = (label: string, d: string, area: string) => (
        <button
          onPointerDown={dir(d)}
          style={{
            gridArea: area,
            border: '1px solid var(--line2)',
            borderRadius: 16,
            background: 'var(--panel2)',
            color: 'var(--text)',
            fontSize: 26,
            padding: '18px 0',
            cursor: 'pointer',
            touchAction: 'manipulation',
            userSelect: 'none',
            WebkitTapHighlightColor: 'transparent'
          }}
        >
          {label}
        </button>
      );
      return (
        <div
          style={{
            display: 'grid',
            gridTemplateAreas: `". up ." "left mid right" ". down ."`,
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            maxWidth: 260,
            margin: '0 auto',
            width: '100%'
          }}
        >
          {pad('▲', 'up', 'up')}
          {pad('◀', 'left', 'left')}
          <div style={{ gridArea: 'mid' }} />
          {pad('▶', 'right', 'right')}
          {pad('▼', 'down', 'down')}
        </div>
      );
    }

    case 'choice-list':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {c.choices.map((choice) => (
            <button
              key={choice.id}
              onClick={() => onInput(c.id, 'select', choice.id)}
              style={{
                border: '1px solid var(--line2)',
                borderRadius: 16,
                padding: '20px 18px',
                fontSize: 17,
                fontWeight: 600,
                textAlign: 'left',
                background: 'var(--panel)',
                color: 'var(--text)',
                cursor: 'pointer',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      );

    case 'text-input':
      return <TextInput c={c} onInput={onInput} />;

    case 'canvas':
      return <DrawCanvas controlId={c.id} onInput={onInput} />;

    case 'slider':
      return (
        <input
          type="range"
          min={c.min}
          max={c.max}
          step={c.step ?? 1}
          defaultValue={c.min}
          onChange={(e) => onInput(c.id, 'change', Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)', height: 44 }}
        />
      );

    default:
      return (
        <div
          className="font-mono"
          style={{
            border: '1.5px dashed var(--line2)',
            borderRadius: 14,
            padding: 16,
            fontSize: 12,
            color: 'var(--faint)',
            textAlign: 'center'
          }}
        >
          Unsupported control — update the app
        </div>
      );
  }
}

function TextInput({
  c,
  onInput
}: {
  c: Extract<LayoutComponent, { kind: 'text-input' }>;
  onInput: Props['onInput'];
}) {
  const [value, setValue] = useState('');
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onInput(c.id, 'submit', v);
    setValue('');
  };
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <input
        value={value}
        maxLength={c.maxLength ?? 100}
        placeholder={c.placeholder ?? 'Type…'}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        style={{
          flex: 1,
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          borderRadius: 14,
          padding: '16px 16px',
          fontSize: 16,
          color: 'var(--text)',
          outline: 'none'
        }}
      />
      <button
        onClick={submit}
        className="font-grotesk"
        style={{
          border: 'none',
          borderRadius: 14,
          padding: '0 22px',
          fontWeight: 700,
          fontSize: 16,
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
          cursor: 'pointer'
        }}
      >
        Send
      </button>
    </div>
  );
}
