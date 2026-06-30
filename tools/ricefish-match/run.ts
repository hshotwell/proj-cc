/**
 * Headless bake-off between Ricefish (external C++ engine, UCI-style stdio)
 * and our AI (src/game/ai). Produces a SavedGameData JSON that can be loaded
 * into the in-browser replay viewer.
 *
 * Usage:
 *   npx tsx tools/ricefish-match/run.ts \
 *     --engine /home/henry/code/ricefish/build/ricefish.x \
 *     --movetime 500 \
 *     --difficulty hard \
 *     --personality generalist \
 *     --ricefish-as top \
 *     --output ./ricefish-vs-ai.json
 *
 * Coordinate mapping:
 *   Ricefish Hole{y, x} ↔ our CubeCoord {q, r}: q = x - 9, r = y - 9
 *   UCI move tokens encode each endpoint as `${String.fromCharCode(65 + y)}${String.fromCharCode(97 + x)}`.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CubeCoord, GameState, Move, PlayerIndex } from '@/types/game';
import type { AIPlayerMap, AIDifficulty, AIPersonality, AIEngine } from '@/types/ai';
import type { SavedGameData } from '@/types/replay';
import { createGame } from '@/game/setup';
import { applyMove } from '@/game/state';
import { getValidMoves, getAllValidMoves } from '@/game/moves';
import { coordKey, cubeEquals } from '@/game/coordinates';
import { findBestMove } from '@/game/ai/search';
import { findRicefishMove } from '@/game/ai/ricefish';
import { PLAYER_COLORS } from '@/game/constants';

// ─── coord <-> Ricefish notation ──────────────────────────────────────────────

function cubeToHole(c: CubeCoord): { y: number; x: number } {
  return { y: c.r + 9, x: c.q + 9 };
}
function holeToCube(y: number, x: number): CubeCoord {
  return { q: x - 9, r: y - 9, s: -(x - 9) - (y - 9) };
}
function encodeEndpoint(c: CubeCoord): string {
  const { y, x } = cubeToHole(c);
  return String.fromCharCode(65 + y) + String.fromCharCode(97 + x);
}
function encodeMove(m: Move): string {
  return encodeEndpoint(m.from) + encodeEndpoint(m.to);
}
function decodeMove(token: string): { from: CubeCoord; to: CubeCoord } {
  if (token.length !== 4) throw new Error(`bad UCI move token: "${token}"`);
  const yF = token.charCodeAt(0) - 65;
  const xF = token.charCodeAt(1) - 97;
  const yT = token.charCodeAt(2) - 65;
  const xT = token.charCodeAt(3) - 97;
  return { from: holeToCube(yF, xF), to: holeToCube(yT, xT) };
}

// ─── ricefish stdio driver ────────────────────────────────────────────────────

class RicefishEngine {
  private proc: ChildProcessWithoutNullStreams;
  private buf = '';
  private waiters: Array<(line: string) => boolean> = [];

  constructor(enginePath: string) {
    this.proc = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout.on('data', (chunk) => {
      this.buf += chunk.toString();
      let nl: number;
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl).replace(/\r$/, '');
        this.buf = this.buf.slice(nl + 1);
        // Try waiters in order; first one that consumes the line wins.
        for (let i = 0; i < this.waiters.length; i++) {
          if (this.waiters[i](line)) {
            this.waiters.splice(i, 1);
            break;
          }
        }
      }
    });
    this.proc.stderr.on('data', (c) => process.stderr.write(`[ricefish stderr] ${c}`));
    this.proc.on('exit', (code) => {
      if (code !== 0 && code !== null) console.error(`ricefish exited with code ${code}`);
    });
  }

  send(line: string): void {
    this.proc.stdin.write(line + '\n');
  }

  /** Wait for the first stdout line that matches `pred` (returns the line). */
  waitFor(pred: (line: string) => boolean, timeoutMs = 60_000): Promise<string> {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('ricefish wait timeout')), timeoutMs);
      this.waiters.push((line) => {
        if (pred(line)) {
          clearTimeout(timer);
          res(line);
          return true;
        }
        return false;
      });
    });
  }

  async init(): Promise<void> {
    this.send('uci');
    await this.waitFor((l) => l === 'uciok');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
  }

  async bestMove(history: string[], movetimeMs: number): Promise<string> {
    const pos = history.length === 0 ? 'position startpos' : `position startpos moves ${history.join(' ')}`;
    this.send(pos);
    this.send(`go movetime ${movetimeMs}`);
    const line = await this.waitFor((l) => l.startsWith('bestmove '));
    const tok = line.split(/\s+/)[1];
    return tok;
  }

  quit(): void {
    try {
      this.send('quit');
    } catch {
      // ignore
    }
    this.proc.kill();
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function findMatchingMove(state: GameState, from: CubeCoord, to: CubeCoord): Move | null {
  const fromContent = state.board.get(coordKey(from));
  if (!fromContent || fromContent.type !== 'piece' || fromContent.player !== state.currentPlayer) {
    return null;
  }
  for (const m of getValidMoves(state, from)) {
    if (cubeEquals(m.to, to)) return m;
  }
  return null;
}

function serializeMoveForReplay(m: Move): Move {
  return {
    from: { q: m.from.q, r: m.from.r, s: m.from.s },
    to: { q: m.to.q, r: m.to.r, s: m.to.s },
    isJump: m.isJump,
    ...(m.jumpPath ? { jumpPath: m.jumpPath.map((c) => ({ q: c.q, r: c.r, s: c.s })) } : {}),
    ...(m.isSwap ? { isSwap: true } : {}),
    ...(m.player !== undefined ? { player: m.player } : {}),
    ...(m.turnNumber !== undefined ? { turnNumber: m.turnNumber } : {}),
  };
}

// ─── arg parsing ──────────────────────────────────────────────────────────────

interface Args {
  engine: string;
  movetime: number;
  difficulty: AIDifficulty;
  personality: AIPersonality;
  ourEngine: AIEngine;
  ricefishAs: 'top' | 'bottom' | 'alternating';
  outputDir: string;
  maxTurns: number;
  games: number;
}
function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Partial<Args> = { movetime: 500, maxTurns: 300, games: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    switch (a) {
      case '--engine': out.engine = v; i++; break;
      case '--movetime': out.movetime = parseInt(v, 10); i++; break;
      case '--difficulty': out.difficulty = v as AIDifficulty; i++; break;
      case '--personality': out.personality = v as AIPersonality; i++; break;
      case '--our-engine': out.ourEngine = v as AIEngine; i++; break;
      case '--ricefish-as': out.ricefishAs = v as Args['ricefishAs']; i++; break;
      case '--output-dir': out.outputDir = v; i++; break;
      case '--max-turns': out.maxTurns = parseInt(v, 10); i++; break;
      case '--games': out.games = parseInt(v, 10); i++; break;
      default: throw new Error(`unknown arg: ${a}`);
    }
  }
  if (!out.engine) throw new Error('--engine <path> required');
  out.difficulty ??= 'hard';
  out.personality ??= 'generalist';
  out.ourEngine ??= 'default';
  out.ricefishAs ??= out.games && out.games > 1 ? 'alternating' : 'top';
  out.outputDir ??= './matches';
  return out as Args;
}

// ─── per-game runner ──────────────────────────────────────────────────────────

interface GameResult {
  winner: PlayerIndex | null;
  ricefishPlayer: PlayerIndex;
  turns: number;
  moves: number;
  outPath: string;
}

async function playOneGame(
  args: Args,
  ricefishAsTop: boolean,
  gameIndex: number,
  engine: RicefishEngine,
): Promise<GameResult> {
  const ricefishPlayer: PlayerIndex = ricefishAsTop ? 0 : 2;
  const oursPlayer: PlayerIndex = ricefishPlayer === 0 ? 2 : 0;

  const aiPlayers: AIPlayerMap = {
    [ricefishPlayer]: { difficulty: 'hard', personality: 'generalist' },
    [oursPlayer]: { difficulty: args.difficulty, personality: args.personality, engine: args.ourEngine },
  };
  const playerColors = { [0]: PLAYER_COLORS[0], [2]: PLAYER_COLORS[2] } as Record<PlayerIndex, string>;

  let state: GameState = createGame(2, [0, 2], playerColors, aiPlayers);

  // Fresh "ucinewgame" + isready handshake so Ricefish clears any per-game state.
  engine.send('ucinewgame');
  engine.send('isready');
  await engine.waitFor((l) => l === 'readyok');

  const ricefishHistory: string[] = [];
  const startedAt = Date.now();

  while (state.winner === null && state.turnNumber <= args.maxTurns) {
    const current = state.currentPlayer;
    const moveNumber = state.moveHistory.length + 1;

    if (current === ricefishPlayer) {
      const tok = await engine.bestMove(ricefishHistory, args.movetime);
      const { from, to } = decodeMove(tok);
      const matched = findMatchingMove(state, from, to);
      if (!matched) {
        throw new Error(`Ricefish proposed illegal move "${tok}" (decoded ${JSON.stringify({ from, to })})`);
      }
      const annotated: Move = { ...matched, player: current, turnNumber: state.turnNumber };
      state = applyMove(state, annotated);
      ricefishHistory.push(tok);
      console.log(`  #${moveNumber} ricefish: ${tok}`);
    } else {
      const move = args.ourEngine === 'ricefish'
        ? findRicefishMove(state, args.difficulty, args.personality)
        : findBestMove(state, args.difficulty, args.personality);
      if (!move) {
        console.error(`  player ${current} has no legal move — terminating.`);
        break;
      }
      const legalSet = getAllValidMoves(state, current);
      const legal = legalSet.some((m) => cubeEquals(m.from, move.from) && cubeEquals(m.to, move.to));
      if (!legal) throw new Error('Our AI returned a move outside the legal set');

      const annotated: Move = { ...move, player: current, turnNumber: state.turnNumber };
      state = applyMove(state, annotated);
      const tok = encodeMove(move);
      ricefishHistory.push(tok);
      console.log(`  #${moveNumber} ours:     ${tok}`);
    }
  }

  const id = `ricefish-${startedAt}-${String(gameIndex + 1).padStart(2, '0')}`;
  const dateSaved = Date.now();
  const saved: SavedGameData = {
    id,
    initialConfig: { playerCount: 2, activePlayers: [0, 2], playerColors, aiPlayers },
    moves: state.moveHistory.map(serializeMoveForReplay),
    finishedPlayers: state.finishedPlayers.map((fp) => ({ ...fp })),
    dateSaved,
  };
  const side = ricefishAsTop ? 'top' : 'bot';
  const outPath = resolve(args.outputDir, `match-${String(gameIndex + 1).padStart(3, '0')}-rf-${side}.json`);
  writeFileSync(outPath, JSON.stringify(saved, null, 2));
  return {
    winner: state.winner,
    ricefishPlayer,
    turns: state.turnNumber - 1,
    moves: state.moveHistory.length,
    outPath,
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  mkdirSync(resolve(args.outputDir), { recursive: true });

  const engine = new RicefishEngine(resolve(args.engine));
  await engine.init();

  const results: GameResult[] = [];
  for (let i = 0; i < args.games; i++) {
    const ricefishAsTop =
      args.ricefishAs === 'top' ? true :
      args.ricefishAs === 'bottom' ? false :
      i % 2 === 0; // alternating: even games = top, odd games = bottom

    console.log(`\n── game ${i + 1}/${args.games} (ricefish=${ricefishAsTop ? 'top' : 'bottom'}) ──`);
    const r = await playOneGame(args, ricefishAsTop, i, engine);
    results.push(r);
    const label = r.winner === r.ricefishPlayer ? 'Ricefish' : r.winner === null ? 'draw/cutoff' : 'Ours';
    console.log(`  result: ${label} (turns=${r.turns}, moves=${r.moves})`);
    console.log(`  saved: ${r.outPath}`);
  }

  engine.quit();

  // Tally — count from both sides.
  const ricefishWins = results.filter((r) => r.winner === r.ricefishPlayer).length;
  const ourWins = results.filter((r) => r.winner !== null && r.winner !== r.ricefishPlayer).length;
  const draws = results.filter((r) => r.winner === null).length;
  console.log(`\n══ series summary ══`);
  console.log(`  Ricefish: ${ricefishWins} / Ours: ${ourWins} / draw: ${draws}  (of ${results.length})`);
  console.log(`  output dir: ${resolve(args.outputDir)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
