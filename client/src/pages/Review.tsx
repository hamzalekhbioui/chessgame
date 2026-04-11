import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Play,
  Pause,
  BarChart3,
} from 'lucide-react';

interface MoveData {
  notation: string;
  fen_after: string;
  time_spent: number | null;
  evaluation: number | null;
  classification: string | null;
}

interface GameData {
  id: string;
  white: { id: string; username: string; rating: number };
  black: { id: string; username: string; rating: number };
  result: string;
  result_reason: string;
  pgn: string;
  time_control: string;
  moves: MoveData[];
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  best: 'text-cyan-400',
  excellent: 'text-green-400',
  good: 'text-green-300',
  inaccuracy: 'text-yellow-400',
  mistake: 'text-orange-400',
  blunder: 'text-red-400',
};

export default function Review() {
  const { id: gameId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [game, setGame] = useState<GameData | null>(null);
  const [chess] = useState(new Chess());
  const [currentMove, setCurrentMove] = useState(-1); // -1 = initial position
  const [fen, setFen] = useState(chess.fen());
  const [autoPlay, setAutoPlay] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;
    api.getGame(gameId).then((res: any) => {
      if (res.success && res.data) {
        setGame(res.data);
      }
      setLoading(false);
    });
  }, [gameId]);

  const goToMove = useCallback(
    (index: number) => {
      if (!game) return;

      if (index < 0) {
        chess.reset();
        setCurrentMove(-1);
        setFen(chess.fen());
        return;
      }

      if (index >= game.moves.length) return;

      // Load the FEN at this move
      chess.load(game.moves[index].fen_after);
      setCurrentMove(index);
      setFen(game.moves[index].fen_after);
    },
    [game, chess]
  );

  const goForward = useCallback(() => {
    if (!game) return;
    goToMove(Math.min(currentMove + 1, game.moves.length - 1));
  }, [game, currentMove, goToMove]);

  const goBack = useCallback(() => {
    goToMove(Math.max(currentMove - 1, -1));
  }, [currentMove, goToMove]);

  const goToStart = useCallback(() => goToMove(-1), [goToMove]);
  const goToEnd = useCallback(() => {
    if (game) goToMove(game.moves.length - 1);
  }, [game, goToMove]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goBack();
      else if (e.key === 'ArrowRight') goForward();
      else if (e.key === 'Home') goToStart();
      else if (e.key === 'End') goToEnd();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goBack, goForward, goToStart, goToEnd]);

  // Auto play
  useEffect(() => {
    if (!autoPlay || !game) return;

    const timer = setInterval(() => {
      setCurrentMove((prev) => {
        const next = prev + 1;
        if (next >= game.moves.length) {
          setAutoPlay(false);
          return prev;
        }
        chess.load(game.moves[next].fen_after);
        setFen(game.moves[next].fen_after);
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoPlay, game, chess]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">Loading game...</div>
    );
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">Game not found</div>
    );
  }

  const boardOrientation =
    user && game.black.id === user.id ? 'black' : 'white';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Game Info */}
      <div className="bg-[#16213e] rounded-xl p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-white font-medium">{game.white.username}</span>
          <span className="text-gray-500">vs</span>
          <span className="text-white font-medium">{game.black.username}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>{game.time_control}</span>
          <span className="capitalize">
            {game.result === 'draw' ? 'Draw' : `${game.result} wins`} &middot;{' '}
            {game.result_reason?.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
        {/* Board */}
        <div className="flex flex-col items-center">
          <div className="w-full max-w-[560px]">
            <Chessboard
              options={{
                position: fen,
                boardOrientation: boardOrientation as 'white' | 'black',
                allowDragging: false,
                boardStyle: {
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                },
                darkSquareStyle: { backgroundColor: '#b58863' },
                lightSquareStyle: { backgroundColor: '#f0d9b5' },
              }}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={goToStart}
              className="p-2 bg-[#16213e] hover:bg-[#0f3460] text-white rounded-lg transition cursor-pointer"
            >
              <ChevronsLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goBack}
              className="p-2 bg-[#16213e] hover:bg-[#0f3460] text-white rounded-lg transition cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setAutoPlay(!autoPlay)}
              className={`p-2 rounded-lg transition cursor-pointer ${
                autoPlay
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#16213e] hover:bg-[#0f3460] text-white'
              }`}
            >
              {autoPlay ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button
              onClick={goForward}
              className="p-2 bg-[#16213e] hover:bg-[#0f3460] text-white rounded-lg transition cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={goToEnd}
              className="p-2 bg-[#16213e] hover:bg-[#0f3460] text-white rounded-lg transition cursor-pointer"
            >
              <ChevronsRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Move List */}
        <div className="bg-[#16213e] rounded-xl p-4">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-400" />
            Move History
          </h3>
          <div className="max-h-[500px] overflow-y-auto">
            <div className="space-y-0.5">
              {Array.from({ length: Math.ceil(game.moves.length / 2) }).map((_, i) => {
                const whiteIdx = i * 2;
                const blackIdx = i * 2 + 1;
                const whiteMove = game.moves[whiteIdx];
                const blackMove = game.moves[blackIdx];

                return (
                  <div key={i} className="flex gap-1 text-sm font-mono">
                    <span className="text-gray-600 w-8 shrink-0">{i + 1}.</span>
                    {whiteMove && (
                      <button
                        onClick={() => goToMove(whiteIdx)}
                        className={`w-24 text-left px-2 py-0.5 rounded cursor-pointer transition ${
                          currentMove === whiteIdx
                            ? 'bg-amber-500/20 text-amber-400'
                            : `hover:bg-white/5 ${
                                whiteMove.classification
                                  ? CLASSIFICATION_COLORS[whiteMove.classification] || 'text-white'
                                  : 'text-white'
                              }`
                        }`}
                      >
                        {whiteMove.notation}
                        {whiteMove.classification && (
                          <span className="text-xs ml-1 opacity-60">
                            {whiteMove.classification === 'blunder' && '??'}
                            {whiteMove.classification === 'mistake' && '?'}
                            {whiteMove.classification === 'inaccuracy' && '?!'}
                            {whiteMove.classification === 'best' && '!'}
                          </span>
                        )}
                      </button>
                    )}
                    {blackMove && (
                      <button
                        onClick={() => goToMove(blackIdx)}
                        className={`w-24 text-left px-2 py-0.5 rounded cursor-pointer transition ${
                          currentMove === blackIdx
                            ? 'bg-amber-500/20 text-amber-400'
                            : `hover:bg-white/5 ${
                                blackMove.classification
                                  ? CLASSIFICATION_COLORS[blackMove.classification] || 'text-gray-300'
                                  : 'text-gray-300'
                              }`
                        }`}
                      >
                        {blackMove.notation}
                        {blackMove.classification && (
                          <span className="text-xs ml-1 opacity-60">
                            {blackMove.classification === 'blunder' && '??'}
                            {blackMove.classification === 'mistake' && '?'}
                            {blackMove.classification === 'inaccuracy' && '?!'}
                            {blackMove.classification === 'best' && '!'}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current move info */}
          {currentMove >= 0 && game.moves[currentMove] && (
            <div className="mt-4 pt-4 border-t border-[#0f3460]">
              <div className="text-sm text-gray-400">
                Move {currentMove + 1}: {game.moves[currentMove].notation}
              </div>
              {game.moves[currentMove].evaluation !== null && (
                <div className="text-sm text-amber-400 mt-1">
                  Eval: {game.moves[currentMove].evaluation! > 0 ? '+' : ''}
                  {game.moves[currentMove].evaluation?.toFixed(2)}
                </div>
              )}
              {game.moves[currentMove].time_spent && (
                <div className="text-sm text-gray-500 mt-1">
                  Time: {(game.moves[currentMove].time_spent! / 1000).toFixed(1)}s
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
