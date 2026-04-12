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
  Sparkles,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface MoveData {
  move_number: number;
  notation: string;
  fen_after: string;
  time_spent: number | null;
  evaluation: number | null;
  classification: string | null;
  best_move?: string | null;
  cp_loss?: number | null;
  explanation?: string | null;
  is_brilliant?: boolean | null;
  is_critical?: boolean | null;
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
  white_accuracy?: number | null;
  black_accuracy?: number | null;
  analyzed_at?: string | null;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  brilliant: 'text-cyan-300',
  best: 'text-cyan-400',
  excellent: 'text-green-400',
  good: 'text-green-300',
  inaccuracy: 'text-yellow-400',
  mistake: 'text-orange-400',
  blunder: 'text-red-400',
};

const CLASSIFICATION_SYMBOL: Record<string, string> = {
  brilliant: '!!',
  best: '!',
  excellent: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  brilliant: 'Brilliant',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

export default function Review() {
  const { id: gameId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [game, setGame] = useState<GameData | null>(null);
  const [chess] = useState(new Chess());
  const [currentMove, setCurrentMove] = useState(-1);
  const [fen, setFen] = useState(chess.fen());
  const [autoPlay, setAutoPlay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

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

  const runAnalysis = useCallback(async () => {
    if (!gameId || analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    const res: any = await api.analyzeGame(gameId, 14);
    if (!res.success) {
      setAnalyzeError(res.error || 'Analysis failed');
      setAnalyzing(false);
      return;
    }

    // Refetch game to pick up persisted analysis
    const fresh: any = await api.getGame(gameId);
    if (fresh.success && fresh.data) setGame(fresh.data);
    setAnalyzing(false);
  }, [gameId, analyzing]);

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

  const boardOrientation = user && game.black.id === user.id ? 'black' : 'white';
  const isAnalyzed = game.white_accuracy != null && game.black_accuracy != null;
  const currentMoveData = currentMove >= 0 ? game.moves[currentMove] : null;

  // Accuracy-weighted move counts per player
  const counts: Record<'white' | 'black', Record<string, number>> = {
    white: {},
    black: {},
  };
  game.moves.forEach((m, idx) => {
    if (!m.classification) return;
    const color = idx % 2 === 0 ? 'white' : 'black';
    counts[color][m.classification] = (counts[color][m.classification] || 0) + 1;
  });

  const criticalMoments = game.moves
    .map((m, idx) => ({ m, idx }))
    .filter(({ m }) => m.is_critical);

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

      {/* Analyze bar */}
      {!isAnalyzed && (
        <div className="bg-[#16213e] rounded-xl p-4 mb-4 flex items-center justify-between">
          <div className="text-gray-300 text-sm">
            Run Stockfish analysis to see move quality, accuracy, and suggestions.
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition cursor-pointer"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Analyze Game
              </>
            )}
          </button>
        </div>
      )}
      {analyzeError && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-3 mb-4 text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {analyzeError}
        </div>
      )}

      {/* Accuracy summary */}
      {isAnalyzed && (
        <div className="bg-[#16213e] rounded-xl p-4 mb-4 grid grid-cols-2 gap-4">
          <AccuracyCard
            label={game.white.username}
            accuracy={game.white_accuracy!}
            counts={counts.white}
            sideColor="white"
          />
          <AccuracyCard
            label={game.black.username}
            accuracy={game.black_accuracy!}
            counts={counts.black}
            sideColor="black"
          />
        </div>
      )}

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
            <button onClick={goToStart} className="p-2 bg-[#16213e] hover:bg-[#0f3460] text-white rounded-lg transition cursor-pointer">
              <ChevronsLeft className="w-5 h-5" />
            </button>
            <button onClick={goBack} className="p-2 bg-[#16213e] hover:bg-[#0f3460] text-white rounded-lg transition cursor-pointer">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setAutoPlay(!autoPlay)}
              className={`p-2 rounded-lg transition cursor-pointer ${
                autoPlay ? 'bg-amber-500 text-black' : 'bg-[#16213e] hover:bg-[#0f3460] text-white'
              }`}
            >
              {autoPlay ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button onClick={goForward} className="p-2 bg-[#16213e] hover:bg-[#0f3460] text-white rounded-lg transition cursor-pointer">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button onClick={goToEnd} className="p-2 bg-[#16213e] hover:bg-[#0f3460] text-white rounded-lg transition cursor-pointer">
              <ChevronsRight className="w-5 h-5" />
            </button>
          </div>

          {/* Current-move analysis panel */}
          {currentMoveData && (
            <div className="w-full max-w-[560px] mt-4 bg-[#16213e] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-white font-semibold">
                  {currentMove + 1}. {currentMoveData.notation}
                  {currentMoveData.classification && (
                    <span
                      className={`ml-2 ${CLASSIFICATION_COLORS[currentMoveData.classification] || ''}`}
                    >
                      {CLASSIFICATION_SYMBOL[currentMoveData.classification]}{' '}
                      {CLASSIFICATION_LABEL[currentMoveData.classification]}
                    </span>
                  )}
                </div>
                {currentMoveData.evaluation != null && (
                  <div className="text-amber-400 font-mono text-sm">
                    {currentMoveData.evaluation > 0 ? '+' : ''}
                    {currentMoveData.evaluation.toFixed(2)}
                  </div>
                )}
              </div>
              {currentMoveData.explanation && (
                <p className="text-gray-300 text-sm">{currentMoveData.explanation}</p>
              )}
              {currentMoveData.best_move && currentMoveData.classification !== 'best' && currentMoveData.classification !== 'brilliant' && (
                <div className="text-xs text-gray-400 mt-2">
                  Engine's top move:{' '}
                  <span className="font-mono text-cyan-400">{currentMoveData.best_move}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Side panel: moves + critical moments */}
        <div className="space-y-4">
          {criticalMoments.length > 0 && (
            <div className="bg-[#16213e] rounded-xl p-4">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                Critical Moments
              </h3>
              <div className="space-y-1 text-sm">
                {criticalMoments.map(({ m, idx }) => (
                  <button
                    key={idx}
                    onClick={() => goToMove(idx)}
                    className={`w-full text-left px-2 py-1 rounded hover:bg-white/5 transition cursor-pointer ${
                      CLASSIFICATION_COLORS[m.classification || ''] || 'text-white'
                    }`}
                  >
                    {Math.floor(idx / 2) + 1}
                    {idx % 2 === 0 ? '.' : '...'} {m.notation}{' '}
                    <span className="opacity-60">
                      {CLASSIFICATION_SYMBOL[m.classification || '']}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
                        <MoveCell
                          move={whiteMove}
                          active={currentMove === whiteIdx}
                          onClick={() => goToMove(whiteIdx)}
                        />
                      )}
                      {blackMove && (
                        <MoveCell
                          move={blackMove}
                          active={currentMove === blackIdx}
                          onClick={() => goToMove(blackIdx)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MoveCell({
  move,
  active,
  onClick,
}: {
  move: MoveData;
  active: boolean;
  onClick: () => void;
}) {
  const cls = move.classification || '';
  const colorClass = CLASSIFICATION_COLORS[cls] || 'text-white';
  return (
    <button
      onClick={onClick}
      className={`w-24 text-left px-2 py-0.5 rounded cursor-pointer transition ${
        active ? 'bg-amber-500/20 text-amber-400' : `hover:bg-white/5 ${colorClass}`
      }`}
    >
      {move.notation}
      {cls && CLASSIFICATION_SYMBOL[cls] && (
        <span className="text-xs ml-1 opacity-70">{CLASSIFICATION_SYMBOL[cls]}</span>
      )}
    </button>
  );
}

function AccuracyCard({
  label,
  accuracy,
  counts,
  sideColor,
}: {
  label: string;
  accuracy: number;
  counts: Record<string, number>;
  sideColor: 'white' | 'black';
}) {
  const order = ['brilliant', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-sm ${
              sideColor === 'white' ? 'bg-gray-100' : 'bg-gray-900 border border-gray-600'
            }`}
          />
          <span className="text-white font-medium">{label}</span>
        </div>
        <span className="text-amber-400 font-bold text-lg">{accuracy.toFixed(1)}%</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {order.map((k) =>
          counts[k] ? (
            <span key={k} className={CLASSIFICATION_COLORS[k]}>
              {CLASSIFICATION_LABEL[k]}: {counts[k]}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}
