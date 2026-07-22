import { describe, expect, it } from 'vitest';
import { ClientEnvelopeSchema, ControllerLayoutSchema, EnvelopeSchema } from '../../src/protocol';

const validInput = {
  v: 1,
  type: 'CONTROLLER_INPUT',
  sessionId: 's1',
  senderId: 'p1',
  seq: 1,
  ts: Date.now(),
  payload: { controlId: 'a', action: 'press' }
};

describe('ClientEnvelopeSchema', () => {
  it('accepts a valid CONTROLLER_INPUT envelope', () => {
    expect(ClientEnvelopeSchema.safeParse(validInput).success).toBe(true);
  });

  it('accepts HOST_COMMAND and PLAYER_READY', () => {
    expect(
      ClientEnvelopeSchema.safeParse({
        ...validInput,
        senderId: 'host',
        type: 'HOST_COMMAND',
        payload: { command: 'START_SESSION' }
      }).success
    ).toBe(true);
    expect(
      ClientEnvelopeSchema.safeParse({ ...validInput, type: 'PLAYER_READY', payload: { ready: true } }).success
    ).toBe(true);
  });

  it('rejects unknown types — server events can never be injected by clients', () => {
    expect(ClientEnvelopeSchema.safeParse({ ...validInput, type: 'SESSION_STATE', payload: {} }).success).toBe(false);
    expect(ClientEnvelopeSchema.safeParse({ ...validInput, type: 'TOTALLY_MADE_UP' }).success).toBe(false);
  });

  it('rejects wrong protocol version and non-positive seq', () => {
    expect(ClientEnvelopeSchema.safeParse({ ...validInput, v: 2 }).success).toBe(false);
    expect(ClientEnvelopeSchema.safeParse({ ...validInput, seq: 0 }).success).toBe(false);
    expect(ClientEnvelopeSchema.safeParse({ ...validInput, seq: -5 }).success).toBe(false);
  });

  it('rejects oversized input values', () => {
    const big = 'x'.repeat(501);
    expect(
      ClientEnvelopeSchema.safeParse({ ...validInput, payload: { controlId: 'a', action: 'submit', value: big } })
        .success
    ).toBe(false);
  });
});

describe('ControllerLayoutSchema', () => {
  it('accepts the component set', () => {
    const layout = {
      layoutVersion: 1,
      components: [
        { kind: 'label', id: 't', text: 'hi' },
        { kind: 'buttons', id: 'b', buttons: [{ id: 'a', label: 'A' }] },
        { kind: 'dpad', id: 'd' },
        { kind: 'text-input', id: 'ti', placeholder: 'name' },
        { kind: 'choice-list', id: 'c', choices: [{ id: 'x', label: 'X' }] },
        { kind: 'slider', id: 's', min: 0, max: 10 }
      ]
    };
    expect(ControllerLayoutSchema.safeParse(layout).success).toBe(true);
  });

  it('rejects unknown component kinds and empty button lists', () => {
    expect(
      ControllerLayoutSchema.safeParse({ layoutVersion: 1, components: [{ kind: 'joystick', id: 'j' }] }).success
    ).toBe(false);
    expect(
      ControllerLayoutSchema.safeParse({ layoutVersion: 1, components: [{ kind: 'buttons', id: 'b', buttons: [] }] })
        .success
    ).toBe(false);
  });
});

describe('EnvelopeSchema (generic)', () => {
  it('accepts server-shaped envelopes', () => {
    expect(
      EnvelopeSchema.safeParse({ ...validInput, type: 'SESSION_STATE', senderId: 'server', seq: 0 }).success
    ).toBe(true);
  });
});
