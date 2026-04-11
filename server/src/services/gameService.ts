import { Chess } from 'chess.js';
import { supabase } from '../supabase.js';
import { v4 as uuidv4 } from 'uuid';
import type { GameResult, GameResultReason } from '../../../shared/src/types.js';

interface ActiveGame {
  id: string;
  chess: Chess;
  whiteId: string;
  blackId: string;
  timeControl: string;
  whiteTime: number; // ms remaining
  blackTime: number;
  increment: number; // ms per move
  lastMoveAt: number; // Date.now()
  moves: { notation: string; fen: string; timeSpent: number }[];
  drawOffer: string | null; // id of player who offered draw
}

const activeGames = new Map<string, ActiveGame>();
// Map userId -> gameId for quick lookup
const playerGames = new Map<string, string>();

function parseTimeControl(tc: string): { baseTime: number; increment: number } {
  const parts = tc.split('+');
  const minutes = parseInt(parts[0]) || 10;
  const inc = parseInt(parts[1]) || 0;
  return { baseTime: minutes * 60 * 1000, increment: inc * 1000 };
}

export function createGame(whiteId: string, blackId: string, timeControl: string): ActiveGame {
  const { baseTime, increment } = parseTimeControl(timeControl);
  const game: ActiveGame = {
    id: uuidv4(),
    chess: new Chess(),
    whiteId,
    blackId,
    timeControl,
    whiteTime: baseTime,
    blackTime: baseTime,
    increment,
    lastMoveAt: Date.now(),
    moves: [],
    drawOffer: null,
  };
  activeGames.set(game.id, game);
  playerGames.set(whiteId, game.id);
  playerGames.set(blackId, game.id);
  return game;
}

export function getActiveGame(gameId: string): ActiveGame | undefined {
  return activeGames.get(gameId);
}

export function getPlayerGame(userId: string): ActiveGame | undefined {
  const gameId = playerGames.get(userId);
  return gameId ? activeGames.get(gameId) : undefined;
}

export function makeMove(
  gameId: string,
  playerId: string,
  moveStr: string
): {
  success: boolean;
  error?: string;
  fen?: string;
  moveNotation?: string;
  whiteTime?: number;
  blackTime?: number;
  gameOver?: boolean;
  result?: GameResult;
  reason?: GameResultReason;
} {
  const game = activeGames.get(gameId);
  if (!game) return { success: false, error: 'Game not found' };

  // Verify it's this player's turn
  const isWhiteTurn = game.chess.turn() === 'w';
  const expectedPlayer = isWhiteTurn ? game.whiteId : game.blackId;
  if (playerId !== expectedPlayer) return { success: false, error: 'Not your turn' };

  // Update clock
  const now = Date.now();
  const elapsed = now - game.lastMoveAt;

  if (isWhiteTurn) {
    game.whiteTime -= elapsed;
    if (game.whiteTime <= 0) {
      return endGameByTimeout(game, 'black');
    }
    game.whiteTime += game.increment;
  } else {
    game.blackTime -= elapsed;
    if (game.blackTime <= 0) {
      return endGameByTimeout(game, 'white');
    }
    game.blackTime += game.increment;
  }

  // Attempt the move
  const move = game.chess.move(moveStr);
  if (!move) return { success: false, error: 'Illegal move' };

  game.lastMoveAt = now;
  game.drawOffer = null; // clear any draw offer on move

  game.moves.push({
    notation: move.san,
    fen: game.chess.fen(),
    timeSpent: elapsed,
  });

  // Check game end conditions
  if (game.chess.isCheckmate()) {
    const result: GameResult = isWhiteTurn ? 'white' : 'black';
    finishGame(game, result, 'checkmate');
    return {
      success: true,
      fen: game.chess.fen(),
      moveNotation: move.san,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      gameOver: true,
      result,
      reason: 'checkmate',
    };
  }

  if (game.chess.isStalemate()) {
    finishGame(game, 'draw', 'stalemate');
    return {
      success: true,
      fen: game.chess.fen(),
      moveNotation: move.san,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      gameOver: true,
      result: 'draw',
      reason: 'stalemate',
    };
  }

  if (game.chess.isThreefoldRepetition()) {
    finishGame(game, 'draw', 'threefold_repetition');
    return {
      success: true,
      fen: game.chess.fen(),
      moveNotation: move.san,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      gameOver: true,
      result: 'draw',
      reason: 'threefold_repetition',
    };
  }

  if (game.chess.isInsufficientMaterial()) {
    finishGame(game, 'draw', 'insufficient_material');
    return {
      success: true,
      fen: game.chess.fen(),
      moveNotation: move.san,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      gameOver: true,
      result: 'draw',
      reason: 'insufficient_material',
    };
  }

  if (game.chess.isDraw()) {
    finishGame(game, 'draw', 'fifty_move_rule');
    return {
      success: true,
      fen: game.chess.fen(),
      moveNotation: move.san,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      gameOver: true,
      result: 'draw',
      reason: 'fifty_move_rule',
    };
  }

  return {
    success: true,
    fen: game.chess.fen(),
    moveNotation: move.san,
    whiteTime: game.whiteTime,
    blackTime: game.blackTime,
    gameOver: false,
  };
}

function endGameByTimeout(game: ActiveGame, winner: GameResult) {
  finishGame(game, winner, 'timeout');
  return {
    success: true,
    fen: game.chess.fen(),
    whiteTime: game.whiteTime,
    blackTime: game.blackTime,
    gameOver: true,
    result: winner,
    reason: 'timeout' as GameResultReason,
  };
}

export function resignGame(gameId: string, playerId: string) {
  const game = activeGames.get(gameId);
  if (!game) return null;

  const result: GameResult = playerId === game.whiteId ? 'black' : 'white';
  finishGame(game, result, 'resignation');
  return { result, reason: 'resignation' as GameResultReason };
}

export function offerDraw(gameId: string, playerId: string): boolean {
  const game = activeGames.get(gameId);
  if (!game) return false;
  game.drawOffer = playerId;
  return true;
}

export function acceptDraw(gameId: string, playerId: string): { result: GameResult; reason: GameResultReason } | null {
  const game = activeGames.get(gameId);
  if (!game || !game.drawOffer || game.drawOffer === playerId) return null;

  finishGame(game, 'draw', 'agreement');
  return { result: 'draw', reason: 'agreement' };
}

export function declineDraw(gameId: string, playerId: string): boolean {
  const game = activeGames.get(gameId);
  if (!game || !game.drawOffer || game.drawOffer === playerId) return false;
  game.drawOffer = null;
  return true;
}

async function finishGame(game: ActiveGame, result: GameResult, reason: GameResultReason) {
  // Save to database
  const pgn = game.chess.pgn();

  try {
    await supabase.from('games').insert({
      id: game.id,
      white_id: game.whiteId,
      black_id: game.blackId,
      status: 'completed',
      result,
      result_reason: reason,
      time_control: game.timeControl,
      pgn,
      starting_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      final_fen: game.chess.fen(),
      white_rating: 1200,
      black_rating: 1200,
      ended_at: new Date().toISOString(),
    });

    // Save individual moves
    if (game.moves.length > 0) {
      const moveRows = game.moves.map((m, i) => ({
        game_id: game.id,
        move_number: i + 1,
        player_id: i % 2 === 0 ? game.whiteId : game.blackId,
        notation: m.notation,
        fen_after: m.fen,
        time_spent: m.timeSpent,
      }));
      await supabase.from('moves').insert(moveRows);
    }

    // Update ratings (simple Elo)
    await updateRatings(game.whiteId, game.blackId, result);
  } catch (err) {
    console.error('Failed to save game:', err);
  }

  // Cleanup
  activeGames.delete(game.id);
  playerGames.delete(game.whiteId);
  playerGames.delete(game.blackId);
}

async function updateRatings(whiteId: string, blackId: string, result: GameResult) {
  const { data: white } = await supabase.from('users').select('rating').eq('id', whiteId).single();
  const { data: black } = await supabase.from('users').select('rating').eq('id', blackId).single();

  if (!white || !black) return;

  const K = 32;
  const expectedWhite = 1 / (1 + Math.pow(10, (black.rating - white.rating) / 400));
  const expectedBlack = 1 - expectedWhite;

  let scoreWhite: number;
  if (result === 'white') scoreWhite = 1;
  else if (result === 'black') scoreWhite = 0;
  else scoreWhite = 0.5;

  const newWhiteRating = Math.round(white.rating + K * (scoreWhite - expectedWhite));
  const newBlackRating = Math.round(black.rating + K * ((1 - scoreWhite) - expectedBlack));

  await supabase.from('users').update({ rating: newWhiteRating }).eq('id', whiteId);
  await supabase.from('users').update({ rating: newBlackRating }).eq('id', blackId);
}

export function getGameState(gameId: string) {
  const game = activeGames.get(gameId);
  if (!game) return null;

  return {
    id: game.id,
    fen: game.chess.fen(),
    whiteId: game.whiteId,
    blackId: game.blackId,
    whiteTime: game.whiteTime,
    blackTime: game.blackTime,
    timeControl: game.timeControl,
    moves: game.moves.map((m) => m.notation),
    turn: game.chess.turn(),
    drawOffer: game.drawOffer,
  };
}
