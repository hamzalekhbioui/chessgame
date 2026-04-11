import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { History, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

interface GameRecord {
  id: string;
  white: { id: string; username: string; rating: number };
  black: { id: string; username: string; rating: number };
  result: string;
  result_reason: string;
  time_control: string;
  created_at: string;
}

export default function Games() {
  const { user } = useAuth();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getGames(page).then((res: any) => {
      if (res.success && res.data) {
        setGames(res.data.games || []);
        setTotalPages(res.data.totalPages || 1);
      }
      setLoading(false);
    });
  }, [page]);

  const getResultLabel = (game: GameRecord) => {
    if (!user) return '';
    const isWhite = game.white.id === user.id;
    if (game.result === 'draw') return 'Draw';
    if ((game.result === 'white' && isWhite) || (game.result === 'black' && !isWhite)) return 'Won';
    return 'Lost';
  };

  const getResultColor = (game: GameRecord) => {
    const label = getResultLabel(game);
    if (label === 'Won') return 'text-green-400';
    if (label === 'Lost') return 'text-red-400';
    return 'text-gray-400';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
        <History className="w-7 h-7 text-amber-400" />
        Game History
      </h1>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading games...</div>
      ) : games.length === 0 ? (
        <div className="bg-[#16213e] rounded-xl p-12 text-center text-gray-400">
          No games played yet. Challenge a friend to get started!
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {games.map((game) => {
              const opponent =
                user && game.white.id === user.id ? game.black : game.white;
              const playedAs =
                user && game.white.id === user.id ? 'White' : 'Black';

              return (
                <div
                  key={game.id}
                  className="bg-[#16213e] rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        playedAs === 'White' ? 'bg-white' : 'bg-gray-800 border border-gray-600'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">vs {opponent.username}</span>
                        <span className="text-amber-400 text-sm">({opponent.rating})</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {game.time_control} &middot;{' '}
                        {new Date(game.created_at).toLocaleDateString()} &middot;{' '}
                        <span className="capitalize">{game.result_reason?.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-semibold ${getResultColor(game)}`}>
                      {getResultLabel(game)}
                    </span>
                    <Link
                      to={`/review/${game.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#0f3460] hover:bg-[#1a4a8a] text-gray-300 rounded-lg text-sm transition no-underline"
                    >
                      <Eye className="w-4 h-4" />
                      Review
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 bg-[#16213e] hover:bg-[#0f3460] disabled:opacity-30 text-white rounded-lg transition cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-gray-400 text-sm">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 bg-[#16213e] hover:bg-[#0f3460] disabled:opacity-30 text-white rounded-lg transition cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
