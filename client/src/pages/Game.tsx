import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket, useSocketEvent } from '@/hooks/useSocket';
import { Flag, Handshake, Clock } from 'lucide-react';

interface GameData {
  id: string;
  white: { id: string; username: string; rating: number };
  black: { id: string; username: string; rating: number };
  timeControl: string;
  whiteTime: number;
  blackTime: number;
}

export default function Game() {
  const { id: gameId } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();

  const [chess] = useState(new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [myColor, setMyColor] = useState<'white' | 'black'>('white');
  const [whiteTime, setWhiteTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);
  const [moves, setMoves] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState<{ result: string; reason: string } | null>(null);
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawReceived, setDrawReceived] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<{ to: string; isCapture: boolean; isSpecial: boolean }[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize from navigation state (first load via challenge accept)
  useEffect(() => {
    if (location.state) {
      const { game, color } = location.state as { game: GameData; color: 'white' | 'black' };
      setGameData(game);
      setMyColor(color);
      setWhiteTime(game.whiteTime);
      setBlackTime(game.blackTime);
    } else {
      // Page reload: request full state from server (server sends game:state on reconnect,
      // but also emit explicitly in case the socket was already connected)
      socket.emit('game:request_state');
    }
  }, [location.state, socket]);

  // Client-side clock tick (speculative; server times are authoritative on each move)
  useEffect(() => {
    if (gameOver || !gameData) return;

    timerRef.current = setInterval(() => {
      const isWhiteTurn = chess.turn() === 'w';
      if (isWhiteTurn) {
        setWhiteTime((prev) => Math.max(0, prev - 100));
      } else {
        setBlackTime((prev) => Math.max(0, prev - 100));
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [chess, gameOver, gameData, fen]);

  // Server broadcast: another player moved (or our own move echoed back)
  // The server now emits SAN notation (e.g. "Nf3"), not UCI ("g1f3")
  const handleMove = useCallback(
    (data: { move: string; fen: string; whiteTime: number; blackTime: number }) => {
      chess.load(data.fen);
      setFen(data.fen);
      setWhiteTime(data.whiteTime);
      setBlackTime(data.blackTime);
      // data.move is SAN — add once here for ALL clients (mover + opponent)
      setMoves((prev) => [...prev, data.move]);
      setDrawReceived(false);
    },
    [chess]
  );

  const handleGameOver = useCallback(
    (data: { result: string; reason: string }) => {
      setGameOver(data);
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  const handleDrawOffered = useCallback(() => {
    setDrawReceived(true);
  }, []);

  // Handles both reconnect state and explicit game:request_state response
  const handleGameState = useCallback(
    (data: any) => {
      if (!data) return;
      chess.load(data.fen);
      setFen(data.fen);
      setWhiteTime(data.whiteTime);
      setBlackTime(data.blackTime);
      setMoves(data.moves || []);

      // Full state (from sendFullGameState) includes player info and color
      if (data.white && data.black) {
        setGameData({
          id: data.id,
          white: data.white,
          black: data.black,
          timeControl: data.timeControl,
          whiteTime: data.whiteTime,
          blackTime: data.blackTime,
        });
        if (data.color) setMyColor(data.color);
      }
    },
    [chess]
  );

  useSocketEvent('game:move', handleMove);
  useSocketEvent('game:over', handleGameOver);
  useSocketEvent('game:draw_offered', handleDrawOffered);
  useSocketEvent('game:state', handleGameState);

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setLegalMoves([]);
  }, []);

  const selectSquare = useCallback(
    (square: string) => {
      const piece = chess.get(square as any);
      if (!piece) return;

      const myTurnColor = chess.turn();
      const myColorChar = myColor === 'white' ? 'w' : 'b';
      if (piece.color !== myColorChar || myTurnColor !== myColorChar) return;

      const verboseMoves = chess.moves({ square: square as any, verbose: true }) as any[];
      const computed = verboseMoves.map((m) => ({
        to: m.to as string,
        isCapture: m.flags.includes('c') || m.flags.includes('e'),
        isSpecial:
          m.flags.includes('k') ||
          m.flags.includes('q') ||
          m.flags.includes('p') ||
          m.flags.includes('e'),
      }));

      setSelectedSquare(square);
      setLegalMoves(computed);
    },
    [chess, myColor]
  );

  const attemptMove = useCallback(
    (from: string, to: string): boolean => {
      if (gameOver) return false;

      const isMyTurn =
        (chess.turn() === 'w' && myColor === 'white') ||
        (chess.turn() === 'b' && myColor === 'black');
      if (!isMyTurn) return false;

      const move = chess.move({ from, to, promotion: 'q' });
      if (!move) return false;

      // Show the moved position immediately (optimistic UI)
      // Do NOT push to moves[] here — the server broadcasts back the SAN
      // via game:move and handleMove adds it for all clients uniformly.
      setFen(chess.fen());
      clearSelection();

      socket.emit('game:move', { gameId, move: `${from}${to}` });
      return true;
    },
    [chess, gameOver, myColor, gameId, socket, clearSelection]
  );

  function onDrop({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string | null }): boolean {
    if (!targetSquare) return false;
    return attemptMove(sourceSquare, targetSquare);
  }

  const onSquareClick = useCallback(
    ({ square }: { piece: unknown; square: string }) => {
      if (selectedSquare && legalMoves.some((m) => m.to === square)) {
        attemptMove(selectedSquare, square);
        return;
      }

      if (selectedSquare === square) {
        clearSelection();
        return;
      }

      selectSquare(square);
    },
    [selectedSquare, legalMoves, attemptMove, clearSelection, selectSquare]
  );

  // Clear selection when position updates from opponent's move
  useEffect(() => {
    clearSelection();
  }, [fen, clearSelection]);

  // Compute square styles for highlighting
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (selectedSquare) {
    squareStyles[selectedSquare] = {
      background: 'rgba(255, 217, 102, 0.55)',
    };
  }
  for (const m of legalMoves) {
    const targetPiece = chess.get(m.to as any);
    if (targetPiece || m.isCapture) {
      squareStyles[m.to] = {
        background:
          'radial-gradient(circle, transparent 58%, rgba(220, 50, 50, 0.55) 60%)',
        borderRadius: '0',
      };
    } else if (m.isSpecial) {
      squareStyles[m.to] = {
        background:
          'radial-gradient(circle, rgba(255, 200, 0, 0.75) 22%, transparent 24%)',
      };
    } else {
      squareStyles[m.to] = {
        background:
          'radial-gradient(circle, rgba(0, 0, 0, 0.25) 22%, transparent 24%)',
      };
    }
  }

  const resign = () => {
    socket.emit('game:resign', { gameId });
  };

  const offerDraw = () => {
    socket.emit('game:offer_draw', { gameId });
    setDrawOffered(true);
  };

  const acceptDraw = () => {
    socket.emit('game:accept_draw', { gameId });
  };

  const declineDraw = () => {
    socket.emit('game:decline_draw', { gameId });
    setDrawReceived(false);
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const opponent = gameData
    ? myColor === 'white'
      ? gameData.black
      : gameData.white
    : null;

  const me = gameData
    ? myColor === 'white'
      ? gameData.white
      : gameData.black
    : null;

  const myTime = myColor === 'white' ? whiteTime : blackTime;
  const oppTime = myColor === 'white' ? blackTime : whiteTime;

  const isMyTurn =
    (chess.turn() === 'w' && myColor === 'white') ||
    (chess.turn() === 'b' && myColor === 'black');

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
        {/* Board Area */}
        <div className="flex flex-col items-center">
          {/* Opponent Info */}
          <div className="w-full max-w-[560px] flex items-center justify-between mb-2 px-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#0f3460] flex items-center justify-center text-amber-400 font-bold text-sm">
                {opponent?.username?.[0]?.toUpperCase() || '?'}
              </div>
              <span className="text-white font-medium">{opponent?.username || 'Opponent'}</span>
              <span className="text-amber-400 text-sm">({opponent?.rating})</span>
            </div>
            <div
              className={`px-4 py-2 rounded-lg font-mono text-lg font-bold ${
                !isMyTurn && !gameOver
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#16213e] text-gray-400'
              }`}
            >
              <Clock className="w-4 h-4 inline mr-1" />
              {formatTime(oppTime)}
            </div>
          </div>

          {/* Chess Board */}
          <div className="w-full max-w-[560px]">
            <Chessboard
              options={{
                position: fen,
                onPieceDrop: onDrop,
                onSquareClick: onSquareClick,
                boardOrientation: myColor,
                squareStyles: squareStyles,
                boardStyle: {
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                },
                darkSquareStyle: { backgroundColor: '#b58863' },
                lightSquareStyle: { backgroundColor: '#f0d9b5' },
              }}
            />
          </div>

          {/* My Info */}
          <div className="w-full max-w-[560px] flex items-center justify-between mt-2 px-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-black font-bold text-sm">
                {me?.username?.[0]?.toUpperCase() || '?'}
              </div>
              <span className="text-white font-medium">{me?.username || 'You'}</span>
              <span className="text-amber-400 text-sm">({me?.rating})</span>
            </div>
            <div
              className={`px-4 py-2 rounded-lg font-mono text-lg font-bold ${
                isMyTurn && !gameOver
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#16213e] text-gray-400'
              }`}
            >
              <Clock className="w-4 h-4 inline mr-1" />
              {formatTime(myTime)}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Game Over Banner */}
          {gameOver && (
            <div className="bg-amber-900/30 border border-amber-500/50 rounded-xl p-4 text-center">
              <div className="text-xl font-bold text-white mb-1">
                {gameOver.result === 'draw'
                  ? 'Draw!'
                  : gameOver.result === myColor
                  ? 'You Won!'
                  : 'You Lost'}
              </div>
              <div className="text-sm text-amber-400 capitalize">{gameOver.reason.replace(/_/g, ' ')}</div>
              <button
                onClick={() => navigate('/')}
                className="mt-3 px-6 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition cursor-pointer"
              >
                Back to Lobby
              </button>
            </div>
          )}

          {/* Draw offer received */}
          {drawReceived && !gameOver && (
            <div className="bg-blue-900/30 border border-blue-500/50 rounded-xl p-4">
              <p className="text-blue-400 text-sm mb-2">Your opponent offers a draw</p>
              <div className="flex gap-2">
                <button
                  onClick={acceptDraw}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition cursor-pointer"
                >
                  Accept
                </button>
                <button
                  onClick={declineDraw}
                  className="flex-1 py-2 bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded-lg text-sm font-medium transition cursor-pointer"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Move History — now shows SAN (e.g. "1. e4 e5  2. Nf3") */}
          <div className="bg-[#16213e] rounded-xl p-4">
            <h3 className="text-white font-semibold mb-3">Moves</h3>
            <div className="max-h-80 overflow-y-auto space-y-1 text-sm font-mono">
              {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-gray-500 w-8">{i + 1}.</span>
                  <span className="text-white w-20">{moves[i * 2] || ''}</span>
                  <span className="text-gray-300 w-20">{moves[i * 2 + 1] || ''}</span>
                </div>
              ))}
              {moves.length === 0 && (
                <p className="text-gray-500 text-center py-4">No moves yet</p>
              )}
            </div>
          </div>

          {/* Game Actions */}
          {!gameOver && (
            <div className="flex gap-2">
              <button
                onClick={resign}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded-lg font-medium transition cursor-pointer"
              >
                <Flag className="w-4 h-4" />
                Resign
              </button>
              <button
                onClick={offerDraw}
                disabled={drawOffered}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0f3460] hover:bg-[#1a4a8a] disabled:opacity-50 text-gray-300 rounded-lg font-medium transition cursor-pointer"
              >
                <Handshake className="w-4 h-4" />
                {drawOffered ? 'Offered' : 'Draw'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
