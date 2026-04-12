import { Chess } from 'chess.js';
import { StockfishEngine, EngineEval } from './stockfish.js';

export type MoveClass =
  | 'brilliant'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface AnalyzedMove {
  moveNumber: number; // 1-indexed ply
  notation: string; // SAN e.g. "Nf3"
  uci: string; // e.g. "g1f3"
  fenBefore: string;
  fenAfter: string;
  playerColor: 'w' | 'b';
  evalBefore: number; // centipawns from white's perspective
  evalAfter: number;
  bestMove: string; // engine's best move (UCI)
  cpLoss: number; // how much worse the played move was vs best
  classification: MoveClass;
  isBrilliant: boolean;
  isCritical: boolean;
  explanation: string;
}

export interface GameAnalysis {
  moves: AnalyzedMove[];
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteAcpl: number;
  blackAcpl: number;
  criticalMoments: number[]; // indexes into moves array
}

// ── Evaluation helpers ─────────────────────────────────────────

const MATE_SCORE = 100_000; // large cp value representing a mate
const MATE_CUTOFF = 10_000; // anything above this is "winning"

/** Convert an engine eval (from side-to-move perspective) into centipawns from WHITE's perspective. */
function normalizeEval(e: EngineEval, sideToMove: 'w' | 'b'): number {
  let cp: number;
  if (e.mate !== null) {
    // Mate score: positive mate = side to move mates, negative = side to move gets mated
    const sign = e.mate > 0 ? 1 : -1;
    cp = sign * (MATE_SCORE - Math.abs(e.mate) * 10);
  } else if (e.cp !== null) {
    cp = e.cp;
  } else {
    cp = 0;
  }
  // Flip if black to move so all evals are from white's perspective
  return sideToMove === 'w' ? cp : -cp;
}

// ── Classification ─────────────────────────────────────────────

export function classifyByCpLoss(cpLoss: number): MoveClass {
  if (cpLoss <= 10) return 'best';
  if (cpLoss <= 30) return 'excellent';
  if (cpLoss <= 70) return 'good';
  if (cpLoss <= 150) return 'inaccuracy';
  if (cpLoss <= 300) return 'mistake';
  return 'blunder';
}

// ── Material counting (for brilliant detection) ────────────────

const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

function materialBalance(fen: string): number {
  // Positive = white has more material
  const position = fen.split(' ')[0];
  let balance = 0;
  for (const char of position) {
    if (char === '/' || /\d/.test(char)) continue;
    const value = PIECE_VALUES[char.toLowerCase()] || 0;
    balance += char === char.toUpperCase() ? value : -value;
  }
  return balance;
}

/**
 * Detect a brilliant move:
 * - The mover willingly loses material (material drops from their perspective)
 * - But the position evaluation is still equal or better for them
 * - AND the move is the engine's top choice (or near-top)
 */
function detectBrilliant(
  fenBefore: string,
  fenAfter: string,
  evalBefore: number,
  evalAfter: number,
  cpLoss: number,
  playerColor: 'w' | 'b',
  playedUci: string,
  bestMove: string
): boolean {
  // Must be at least "good" quality - not a blunder disguised as a sacrifice
  if (cpLoss > 30) return false;

  // Compute material delta from player's perspective
  const matBefore = materialBalance(fenBefore);
  const matAfter = materialBalance(fenAfter);
  const playerMatDelta = playerColor === 'w' ? matAfter - matBefore : matBefore - matAfter;

  // Must have sacrificed at least a minor piece (~200 cp of material)
  if (playerMatDelta > -200) return false;

  // Evaluation from player's perspective should still be good
  const playerEvalAfter = playerColor === 'w' ? evalAfter : -evalAfter;
  if (playerEvalAfter < -50) return false;

  // Move should be the engine's pick (or very close)
  if (playedUci !== bestMove && cpLoss > 10) return false;

  return true;
}

// ── Explanations ───────────────────────────────────────────────

function explain(
  classification: MoveClass,
  cpLoss: number,
  evalBefore: number,
  evalAfter: number,
  bestMove: string,
  isBrilliant: boolean,
  playerColor: 'w' | 'b'
): string {
  if (isBrilliant) {
    return 'Brilliant! A stunning sacrifice that gains a decisive advantage.';
  }

  const playerEvalBefore = playerColor === 'w' ? evalBefore : -evalBefore;
  const playerEvalAfter = playerColor === 'w' ? evalAfter : -evalAfter;
  const swing = playerEvalAfter - playerEvalBefore;

  if (classification === 'best') return 'Best move — the top engine choice.';
  if (classification === 'excellent') return 'Excellent move. Close to the engine\'s top choice.';
  if (classification === 'good') return 'A solid move.';

  const bestMoveHint = bestMove ? ` Best was ${bestMove}.` : '';

  if (classification === 'inaccuracy') {
    return `Inaccuracy. You gave up about ${Math.round(cpLoss)} centipawns.${bestMoveHint}`;
  }
  if (classification === 'mistake') {
    if (swing < -250) return `Mistake. This move significantly worsens your position.${bestMoveHint}`;
    return `Mistake. You lost ${Math.round(cpLoss)} centipawns of advantage.${bestMoveHint}`;
  }
  // Blunder
  if (Math.abs(evalBefore) > MATE_CUTOFF || Math.abs(evalAfter) > MATE_CUTOFF) {
    return `Blunder! Missed a winning line or walked into mate.${bestMoveHint}`;
  }
  if (swing < -500) return `Blunder! This move loses material or a decisive advantage.${bestMoveHint}`;
  return `Blunder. You lost ${Math.round(cpLoss)} centipawns.${bestMoveHint}`;
}

// ── Accuracy scoring ───────────────────────────────────────────

/**
 * Convert average centipawn loss to a 0-100 accuracy score.
 * Uses a tuned formula that mirrors Chess.com's approach.
 */
function acplToAccuracy(acpl: number): number {
  // Chess.com-style: exponential decay
  // accuracy = 103.17 * exp(-0.04354 * acpl) - 3.17
  const accuracy = 103.17 * Math.exp(-0.04354 * acpl) - 3.17;
  return Math.max(0, Math.min(100, accuracy));
}

// ── Main analysis function ─────────────────────────────────────

export async function analyzeGame(pgn: string, depth: number = 14): Promise<GameAnalysis> {
  const engine = new StockfishEngine();
  await engine.start();
  engine.setOption('Threads', 2);
  engine.setOption('Hash', 128);
  await engine.newGame();

  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true }) as any[];

    // Replay game and analyze each position
    const replay = new Chess();
    const analyzed: AnalyzedMove[] = [];
    let whiteCpLossSum = 0;
    let whiteMoveCount = 0;
    let blackCpLossSum = 0;
    let blackMoveCount = 0;

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const fenBefore = replay.fen();
      const sideToMove = replay.turn() as 'w' | 'b';

      // 1. Evaluate position BEFORE the move - this gives us best move + best eval
      const evalBeforeResult = await engine.analyze(fenBefore, depth);
      const evalBefore = normalizeEval(evalBeforeResult, sideToMove);
      const bestMove = evalBeforeResult.bestMove;

      // Play the actual move
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
      const fenAfter = replay.fen();
      const playedUci = move.from + move.to + (move.promotion || '');

      // 2. Evaluate position AFTER the move
      const evalAfterResult = await engine.analyze(fenAfter, depth);
      // After the move, side to move has flipped
      const sideAfter = replay.turn() as 'w' | 'b';
      const evalAfter = normalizeEval(evalAfterResult, sideAfter);

      // 3. Compute cp_loss from the moving player's perspective
      // (positive = move was worse than best)
      const playerEvalBefore = sideToMove === 'w' ? evalBefore : -evalBefore;
      const playerEvalAfter = sideToMove === 'w' ? evalAfter : -evalAfter;
      let cpLoss = playerEvalBefore - playerEvalAfter;
      if (cpLoss < 0) cpLoss = 0; // clamp - can't be negative

      // 4. Special case: if the played move IS the best move, cp loss is 0
      if (playedUci === bestMove) cpLoss = 0;

      const classification = classifyByCpLoss(cpLoss);
      const isBrilliant = detectBrilliant(
        fenBefore,
        fenAfter,
        evalBefore,
        evalAfter,
        cpLoss,
        sideToMove,
        playedUci,
        bestMove
      );

      // 5. Critical moment: large evaluation swing (from the player's perspective)
      const swing = Math.abs(playerEvalAfter - playerEvalBefore);
      const isCritical = swing > 150 && cpLoss > 100;

      const explanation = explain(
        classification,
        cpLoss,
        evalBefore,
        evalAfter,
        bestMove,
        isBrilliant,
        sideToMove
      );

      analyzed.push({
        moveNumber: i + 1,
        notation: move.san,
        uci: playedUci,
        fenBefore,
        fenAfter,
        playerColor: sideToMove,
        evalBefore,
        evalAfter,
        bestMove,
        cpLoss,
        classification: isBrilliant ? 'brilliant' as MoveClass : classification,
        isBrilliant,
        isCritical,
        explanation,
      });

      if (sideToMove === 'w') {
        whiteCpLossSum += cpLoss;
        whiteMoveCount++;
      } else {
        blackCpLossSum += cpLoss;
        blackMoveCount++;
      }
    }

    const whiteAcpl = whiteMoveCount > 0 ? whiteCpLossSum / whiteMoveCount : 0;
    const blackAcpl = blackMoveCount > 0 ? blackCpLossSum / blackMoveCount : 0;
    const whiteAccuracy = acplToAccuracy(whiteAcpl);
    const blackAccuracy = acplToAccuracy(blackAcpl);

    const criticalMoments = analyzed
      .map((m, idx) => (m.isCritical ? idx : -1))
      .filter((idx) => idx >= 0);

    return {
      moves: analyzed,
      whiteAccuracy,
      blackAccuracy,
      whiteAcpl,
      blackAcpl,
      criticalMoments,
    };
  } finally {
    await engine.quit();
  }
}
