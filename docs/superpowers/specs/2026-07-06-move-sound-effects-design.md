# Move Sound Effects — Design

**Date:** 2026-07-06
**Status:** Approved (pending implementation plan)

## Goal

Add short, procedurally-synthesized marble-and-click sound effects to the game so moves, jumps, selections, and UI button presses feel tactile — similar to the way chess.com plays a "click" on each move. No audio assets; no third-party audio library.

## Non-Goals

- Music, ambience, or long-tail sounds.
- Per-event on/off toggles (control is via three volume sliders instead).
- Pre-move preview sounds.
- Distinct sounds per player / per piece skin.

## User-Facing Behavior

- On any move, a marble-tap sound plays:
  - **Step** (adjacent slide) → soft, low-pitched tap.
  - **Jump** (hop over piece) → sharper, higher click. Chain jumps play one click per hop.
- On piece **select** / **deselect** → tiny UI tick (pick-up / put-down pair).
- On **confirm move** → subtle low "settle" click.
- On **primary UI button** clicks → crisp generic click.
- Sounds play for human moves, AI moves, and replay playback. They do NOT play for pre-move scheduling.
- Three sliders in the settings popup control loudness:
  - **Master volume** (default 70) — global multiplier.
  - **Game effects** (default 80) — step, jump, confirm.
  - **UI effects** (default 60) — piece select/deselect, button clicks.
- Sliders persist to localStorage and sync to the cloud like other settings.

## Architecture

### Audio module — `src/audio/soundEffects.ts`

Owns a lazily-constructed `AudioContext` and exports the play API. All state is module-level; no React.

```ts
export function playStep(): void;
export function playJump(chainIndex?: number): void; // chainIndex micro-detunes each hop
export function playConfirm(): void;
export function playSelect(): void;
export function playDeselect(): void;
export function playClick(): void;
```

Internals:

- `getContext()` — lazy constructor; wraps `new AudioContext()` in try/catch. Returns `null` if unsupported. On first successful construction, adds a one-shot `pointerdown` listener that calls `context.resume()` for Safari/iOS.
- `playTone(spec)` — private primitive that builds oscillator + optional filtered noise burst + gain envelope, connects to destination, and disconnects on `ended`.
- Each public function reads `useSettingsStore.getState()` at call time — no subscription, no re-render coupling — and computes final gain = `(masterVolume/100) * (categoryVolume/100)`. Early-return if final gain is 0.
- **Coalescing:** if the same sound was played within 8ms, drop the newer call. Prevents overlap during rapid chain jumps.

### Sound design

| Sound | Oscillator | Freq | Duration | Extra | Category |
|-------|-----------|------|----------|-------|----------|
| Step | sine | 220 Hz | ~80ms | 20ms lowpass noise burst @1.8kHz | game |
| Jump | sine | 380 Hz + 8·chainIndex | ~65ms | 15ms lowpass noise burst @4kHz | game |
| Confirm | sine + sine | 150 + 300 Hz | ~100ms | soft two-osc "thud" | game |
| Select | triangle | 900 Hz | ~30ms | — | ui |
| Deselect | triangle | 600 Hz | ~30ms | — | ui |
| Click | triangle | 1200 Hz | ~20ms | — | ui |

Envelope: near-instant attack, exponential decay to `0.0001` over the duration.

### Settings store additions — `src/store/settingsStore.ts`

Add three fields:

```ts
masterVolume: number; // 0-100, default 70
gameVolume: number;   // 0-100, default 80
uiVolume: number;     // 0-100, default 60
```

Add setters that call `syncToCloud()`, matching the pattern of other syncable settings. Add all three to `SyncableSettings`, `getSyncableSettings()`, and the `partialize` list.

### Settings UI — `src/components/settings/SettingsPopup.tsx`

Add a new "Sound" section with three horizontal `<input type="range" min="0" max="100">` sliders, styled to match existing controls. On slider release (`onMouseUp` / `onTouchEnd`):

- Master or Game slider → `playStep()` preview.
- UI slider → `playClick()` preview.

### Integration points

| Trigger | Location | Call |
|---------|----------|------|
| Piece select | `gameStore.selectPiece` (when transitioning `null → piece`) | `playSelect()` |
| Piece deselect | `gameStore.selectPiece` (when transitioning `piece → null`) | `playDeselect()` |
| Move fired (step) | `gameStore.movePiece` — after successful move, `move.type === 'step'` | `playStep()` |
| Move fired (jump) | `gameStore.movePiece` — after successful move, `move.type === 'jump'` | `playJump(chainIndex)` where `chainIndex` = number of consecutive jumps in the current turn so far |
| Move confirmed | `gameStore.confirmMove` | `playConfirm()` |
| AI move | AI already routes through `movePiece` / `applyMove`. If `applyMove` is the AI path and does not currently reach a common sound point, route AI sound triggering through the same location so AI moves make sound automatically. | (same as human) |
| Replay step | `replayStore` step-forward handler / animation start | `playStep()` or `playJump()` matching the move type |
| Primary UI buttons | Settings gear, MoveConfirmation confirm/undo, home links, primary CTAs | `playClick()` on click |

Pre-moves do NOT play sound at schedule time; they play sound when they actually fire (which flows through `movePiece` automatically).

## Data Flow — Step Move Example

1. Human clicks a valid destination cell.
2. `gameStore.movePiece(from, to)` runs, records history, sets `pendingConfirmation`.
3. Immediately after the successful move, `gameStore` calls `playStep()`.
4. `playStep()` reads `masterVolume`, `gameVolume` from settings.
5. If either is 0, returns without touching Web Audio.
6. Otherwise: `getContext()` returns the AudioContext (constructing on first call), `playTone` builds the noise+sine graph with gain = `master * game / 10000`, schedules envelope, and disconnects on end.
7. UI animation continues unaffected. Sound is fire-and-forget.

## Error Handling & Compatibility

- `AudioContext` unsupported → all `play*` are no-ops (safe on old browsers).
- Autoplay policy: first user gesture resumes a suspended context. Sounds before any interaction may not play — acceptable since no move can happen before the user interacts.
- `AudioContext` construction failure → module logs once to console, then all `play*` no-op.
- Concurrent sounds are allowed (chain jumps overlap slightly by design). Only same-name repeats within 8ms are dropped.

## Testing

Audio is not unit-testable in a meaningful way (Web Audio has no headless behavior in Vitest). Instead:

- **Type/shape test** (optional): verify `src/audio/soundEffects.ts` exports each `play*` function.
- **Manual verification checklist** (in the plan):
  - Step move plays soft tap.
  - Chain jump plays multiple sharper clicks.
  - Confirm plays low settle.
  - Select then deselect play the tick pair.
  - Master = 0 mutes everything.
  - Game = 0 mutes moves but UI buttons still click.
  - UI = 0 mutes buttons/selection but moves still sound.
  - AI moves play sounds.
  - Replay playback plays sounds.
  - No crash in Safari / on iOS.

## Files Changed

- **New:** `src/audio/soundEffects.ts`
- **Modified:** `src/store/settingsStore.ts` — 3 volumes, setters, sync, partialize.
- **Modified:** `src/store/gameStore.ts` — `playSelect/Deselect` in `selectPiece`, `playStep/Jump` in `movePiece`, `playConfirm` in `confirmMove`.
- **Modified:** `src/store/replayStore.ts` — `playStep/Jump` on step-forward.
- **Modified:** `src/components/settings/SettingsPopup.tsx` — Sound section with three sliders.
- **Modified:** primary button call-sites (settings gear, confirm/undo, home links) to invoke `playClick()`.
- **Modified:** `src/services/storage.ts` `SyncableSettings` — add three volume fields.

## Implementation Notes

If AI move routing does not funnel through `movePiece` in all paths (e.g., the worker returns and `applyMove` is called directly), the plan will decide whether to add the sound call inside `applyMove` or to wrap the `useAITurn` dispatch site. Either is acceptable so long as AI moves are audible.
