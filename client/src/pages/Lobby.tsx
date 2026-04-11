import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket, useSocketEvent } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { Swords, Clock, User, Wifi, WifiOff } from 'lucide-react';

interface Friend {
  friendshipId: string;
  id: string;
  username: string;
  rating: number;
  avatar_url: string | null;
}

interface Challenge {
  from: { id: string; username: string; rating: number };
  timeControl: string;
  challengeId: string;
}

const TIME_CONTROLS = [
  { label: '1 min', value: '1+0', category: 'Bullet' },
  { label: '2+1', value: '2+1', category: 'Bullet' },
  { label: '3 min', value: '3+0', category: 'Blitz' },
  { label: '5 min', value: '5+0', category: 'Blitz' },
  { label: '5+3', value: '5+3', category: 'Blitz' },
  { label: '10 min', value: '10+0', category: 'Rapid' },
  { label: '15+10', value: '15+10', category: 'Rapid' },
  { label: '30 min', value: '30+0', category: 'Classical' },
];

export default function Lobby() {
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [onlineFriends, setOnlineFriends] = useState<Set<string>>(new Set());
  const [selectedTC, setSelectedTC] = useState('10+0');
  const [pendingChallenge, setPendingChallenge] = useState<string | null>(null);
  const [incomingChallenges, setIncomingChallenges] = useState<Challenge[]>([]);

  useEffect(() => {
    api.getFriends().then((res: any) => {
      if (res.success && res.data) setFriends(res.data);
    });
  }, []);

  const handleOnline = useCallback((data: { userId: string }) => {
    setOnlineFriends((prev) => new Set(prev).add(data.userId));
  }, []);

  const handleOffline = useCallback((data: { userId: string }) => {
    setOnlineFriends((prev) => {
      const next = new Set(prev);
      next.delete(data.userId);
      return next;
    });
  }, []);

  const handleOnlineList = useCallback((data: { userIds: string[] }) => {
    setOnlineFriends(new Set(data.userIds));
  }, []);

  const handleChallengeReceived = useCallback((data: Challenge) => {
    setIncomingChallenges((prev) => [...prev, data]);
  }, []);

  const handleChallengeDeclined = useCallback((data: { challengeId: string }) => {
    setPendingChallenge(null);
    setIncomingChallenges((prev) => prev.filter((c) => c.challengeId !== data.challengeId));
  }, []);

  const handleGameStart = useCallback((data: any) => {
    navigate(`/game/${data.game.id}`, { state: data });
  }, [navigate]);

  useSocketEvent('friends:online_list', handleOnlineList);
  useSocketEvent('friend:online', handleOnline);
  useSocketEvent('friend:offline', handleOffline);
  useSocketEvent('challenge:received', handleChallengeReceived);
  useSocketEvent('challenge:declined', handleChallengeDeclined);
  useSocketEvent('game:start', handleGameStart);

  const challengeFriend = (friendId: string) => {
    socket.emit('challenge:send', { toUserId: friendId, timeControl: selectedTC });
    setPendingChallenge(friendId);
  };

  const acceptChallenge = (challengeId: string) => {
    socket.emit('challenge:accept', { challengeId });
    setIncomingChallenges((prev) => prev.filter((c) => c.challengeId !== challengeId));
  };

  const declineChallenge = (challengeId: string) => {
    socket.emit('challenge:decline', { challengeId });
    setIncomingChallenges((prev) => prev.filter((c) => c.challengeId !== challengeId));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Incoming Challenges */}
        {incomingChallenges.length > 0 && (
          <div className="lg:col-span-3">
            <div className="bg-amber-900/30 border border-amber-500/50 rounded-xl p-4 space-y-3">
              <h3 className="text-amber-400 font-semibold flex items-center gap-2">
                <Swords className="w-5 h-5" />
                Incoming Challenges
              </h3>
              {incomingChallenges.map((c) => (
                <div
                  key={c.challengeId}
                  className="flex items-center justify-between bg-[#1a1a2e] rounded-lg p-3"
                >
                  <div>
                    <span className="text-white font-medium">{c.from.username}</span>
                    <span className="text-gray-400 ml-2">({c.from.rating})</span>
                    <span className="text-gray-500 ml-3">{c.timeControl}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptChallenge(c.challengeId)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition cursor-pointer"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineChallenge(c.challengeId)}
                      className="px-4 py-2 bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded-lg text-sm font-medium transition cursor-pointer"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Time Control Selection */}
        <div className="lg:col-span-1">
          <div className="bg-[#16213e] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              Time Control
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {TIME_CONTROLS.map((tc) => (
                <button
                  key={tc.value}
                  onClick={() => setSelectedTC(tc.value)}
                  className={`px-3 py-3 rounded-lg text-sm font-medium transition cursor-pointer ${
                    selectedTC === tc.value
                      ? 'bg-amber-500 text-black'
                      : 'bg-[#1a1a2e] text-gray-300 hover:bg-[#0f3460]'
                  }`}
                >
                  <div>{tc.label}</div>
                  <div className={`text-xs ${selectedTC === tc.value ? 'text-black/60' : 'text-gray-500'}`}>
                    {tc.category}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Online Friends */}
        <div className="lg:col-span-2">
          <div className="bg-[#16213e] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-amber-400" />
              Friends
            </h2>
            {friends.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                No friends yet. Add friends to start playing!
              </p>
            ) : (
              <div className="space-y-2">
                {friends
                  .sort((a, b) => {
                    const aOnline = onlineFriends.has(a.id) ? 1 : 0;
                    const bOnline = onlineFriends.has(b.id) ? 1 : 0;
                    return bOnline - aOnline;
                  })
                  .map((friend) => {
                    const isOnline = onlineFriends.has(friend.id);
                    return (
                      <div
                        key={friend.id}
                        className="flex items-center justify-between bg-[#1a1a2e] rounded-lg p-3"
                      >
                        <div className="flex items-center gap-3">
                          {isOnline ? (
                            <Wifi className="w-4 h-4 text-green-400" />
                          ) : (
                            <WifiOff className="w-4 h-4 text-gray-600" />
                          )}
                          <span className={`font-medium ${isOnline ? 'text-white' : 'text-gray-500'}`}>
                            {friend.username}
                          </span>
                          <span className="text-sm text-amber-400">({friend.rating})</span>
                        </div>
                        <button
                          onClick={() => challengeFriend(friend.id)}
                          disabled={!isOnline || pendingChallenge === friend.id}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-medium rounded-lg text-sm transition cursor-pointer disabled:cursor-not-allowed"
                        >
                          {pendingChallenge === friend.id ? 'Waiting...' : 'Challenge'}
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="lg:col-span-3">
          <div className="bg-[#16213e] rounded-xl p-6 flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{user?.rating}</div>
              <div className="text-sm text-gray-400">Your Rating</div>
            </div>
            <div className="w-px h-12 bg-[#0f3460]" />
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{onlineFriends.size}</div>
              <div className="text-sm text-gray-400">Friends Online</div>
            </div>
            <div className="w-px h-12 bg-[#0f3460]" />
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{selectedTC}</div>
              <div className="text-sm text-gray-400">Time Control</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
