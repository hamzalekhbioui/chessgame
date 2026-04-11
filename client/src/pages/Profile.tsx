import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { User, Trophy, Target, Minus, BarChart3 } from 'lucide-react';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  rating: number;
  avatar_url: string | null;
  created_at: string;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
}

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    api.getUserProfile(username).then((res: any) => {
      if (res.success) setProfile(res.data);
      setLoading(false);
    });
  }, [username]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">Loading profile...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">User not found</div>
      </div>
    );
  }

  const winRate = profile.games_played > 0
    ? Math.round((profile.wins / profile.games_played) * 100)
    : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-[#16213e] rounded-2xl p-8 mb-6">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-[#0f3460] flex items-center justify-center text-3xl text-amber-400 font-bold">
            {profile.username[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{profile.username}</h1>
            <div className="flex items-center gap-2 mt-1">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 text-lg font-semibold">{profile.rating}</span>
              <span className="text-gray-500 text-sm">rating</span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Member since {new Date(profile.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#16213e] rounded-xl p-5 text-center">
          <Target className="w-6 h-6 text-blue-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">{profile.games_played}</div>
          <div className="text-sm text-gray-400">Games</div>
        </div>
        <div className="bg-[#16213e] rounded-xl p-5 text-center">
          <Trophy className="w-6 h-6 text-green-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-green-400">{profile.wins}</div>
          <div className="text-sm text-gray-400">Wins</div>
        </div>
        <div className="bg-[#16213e] rounded-xl p-5 text-center">
          <User className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-red-400">{profile.losses}</div>
          <div className="text-sm text-gray-400">Losses</div>
        </div>
        <div className="bg-[#16213e] rounded-xl p-5 text-center">
          <Minus className="w-6 h-6 text-gray-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-300">{profile.draws}</div>
          <div className="text-sm text-gray-400">Draws</div>
        </div>
      </div>

      {/* Win Rate Bar */}
      {profile.games_played > 0 && (
        <div className="bg-[#16213e] rounded-xl p-6 mt-4">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Win Rate</span>
            <span>{winRate}%</span>
          </div>
          <div className="h-3 bg-[#1a1a2e] rounded-full overflow-hidden flex">
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${(profile.wins / profile.games_played) * 100}%` }}
            />
            <div
              className="bg-gray-500 transition-all"
              style={{ width: `${(profile.draws / profile.games_played) * 100}%` }}
            />
            <div
              className="bg-red-500 transition-all"
              style={{ width: `${(profile.losses / profile.games_played) * 100}%` }}
            />
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Wins
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-500" /> Draws
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Losses
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
