#!/usr/bin/env bash
# Invariant: RoomEmitter is the only module that calls socket.io `.emit(`.
# Everything else must go through it so every outbound message carries a
# stamped envelope and a persisted per-session seq.
set -euo pipefail
cd "$(dirname "$0")/.."

violations=$(grep -rn '\.emit(' src --include='*.ts' | grep -v '^src/ws/emitter.ts' || true)

if [[ -n "$violations" ]]; then
  echo "Emitter-only violation: .emit( found outside src/ws/emitter.ts:" >&2
  echo "$violations" >&2
  exit 1
fi
echo "emitter-only check passed"
