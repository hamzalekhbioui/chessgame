import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useSocketEvent } from '@/hooks/useSocket';
import { UserPlus, UserCheck, UserX, Search, Users, Send, X } from 'lucide-react';

interface Friend {
  friendshipId: string;
  id: string;
  username: string;
  rating: number;
  avatar_url: string | null;
}

interface FriendRequest {
  id: string;
  sender_id: string;
  sender: { id: string; username: string; rating: number; avatar_url: string | null };
}

export default function Friends() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [addUsername, setAddUsername] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [tab, setTab] = useState<'friends' | 'requests' | 'add'>('friends');

  const loadFriends = () => {
    api.getFriends().then((res: any) => {
      if (res.success) setFriends(res.data || []);
    });
  };

  const loadRequests = () => {
    api.getFriendRequests().then((res: any) => {
      if (res.success) setRequests(res.data || []);
    });
  };

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, []);

  const handleNewFriendRequest = useCallback(() => {
    loadRequests();
  }, []);

  useSocketEvent('notification:friend_request', handleNewFriendRequest);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    const res: any = await api.searchUsers(searchQuery);
    if (res.success) setSearchResults(res.data || []);
  };

  const handleSendRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!addUsername.trim()) return;

    const res: any = await api.sendFriendRequest(addUsername.trim());
    if (res.success) {
      setMessage({ text: 'Friend request sent!', type: 'success' });
      setAddUsername('');
    } else {
      setMessage({ text: res.error || 'Failed to send request', type: 'error' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAccept = async (id: string) => {
    const res: any = await api.acceptFriendRequest(id);
    if (res.success) {
      loadRequests();
      loadFriends();
    }
  };

  const handleReject = async (id: string) => {
    const res: any = await api.rejectFriendRequest(id);
    if (res.success) {
      loadRequests();
    }
  };

  const handleRemove = async (friendshipId: string) => {
    const res: any = await api.removeFriend(friendshipId);
    if (res.success) {
      loadFriends();
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
        <Users className="w-7 h-7 text-amber-400" />
        Friends
      </h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['friends', 'requests', 'add'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg font-medium text-sm transition cursor-pointer ${
              tab === t
                ? 'bg-amber-500 text-black'
                : 'bg-[#16213e] text-gray-400 hover:text-white'
            }`}
          >
            {t === 'friends' && `Friends (${friends.length})`}
            {t === 'requests' && `Requests (${requests.length})`}
            {t === 'add' && 'Add Friend'}
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-900/30 border border-green-500/50 text-green-400'
              : 'bg-red-900/30 border border-red-500/50 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Friends List */}
      {tab === 'friends' && (
        <div className="space-y-2">
          {friends.length === 0 ? (
            <div className="bg-[#16213e] rounded-xl p-8 text-center text-gray-400">
              No friends yet. Send some friend requests!
            </div>
          ) : (
            friends.map((f) => (
              <div key={f.id} className="bg-[#16213e] rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0f3460] flex items-center justify-center text-amber-400 font-bold">
                    {f.username[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-white font-medium">{f.username}</div>
                    <div className="text-sm text-amber-400">Rating: {f.rating}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(f.friendshipId)}
                  className="p-2 text-gray-500 hover:text-red-400 transition cursor-pointer"
                  title="Remove friend"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Requests */}
      {tab === 'requests' && (
        <div className="space-y-2">
          {requests.length === 0 ? (
            <div className="bg-[#16213e] rounded-xl p-8 text-center text-gray-400">
              No pending friend requests.
            </div>
          ) : (
            requests.map((r) => (
              <div key={r.id} className="bg-[#16213e] rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0f3460] flex items-center justify-center text-amber-400 font-bold">
                    {r.sender.username[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-white font-medium">{r.sender.username}</div>
                    <div className="text-sm text-amber-400">Rating: {r.sender.rating}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(r.id)}
                    className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" /> Accept
                  </button>
                  <button
                    onClick={() => handleReject(r.id)}
                    className="flex items-center gap-1 px-3 py-2 bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded-lg text-sm transition cursor-pointer"
                  >
                    <UserX className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Friend */}
      {tab === 'add' && (
        <div className="space-y-6">
          <form onSubmit={handleSendRequest} className="bg-[#16213e] rounded-xl p-6">
            <h3 className="text-white font-medium mb-3 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-amber-400" />
              Send Friend Request
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                placeholder="Enter exact username"
                className="flex-1 px-4 py-3 bg-[#1a1a2e] border border-[#0f3460] rounded-lg text-white focus:outline-none focus:border-amber-400 transition"
              />
              <button
                type="submit"
                className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="bg-[#16213e] rounded-xl p-6">
            <h3 className="text-white font-medium mb-3 flex items-center gap-2">
              <Search className="w-5 h-5 text-amber-400" />
              Search Users
            </h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by username..."
                className="flex-1 px-4 py-3 bg-[#1a1a2e] border border-[#0f3460] rounded-lg text-white focus:outline-none focus:border-amber-400 transition"
              />
              <button
                onClick={handleSearch}
                className="px-6 py-3 bg-[#0f3460] hover:bg-[#1a4a8a] text-white rounded-lg transition cursor-pointer"
              >
                Search
              </button>
            </div>
            <div className="space-y-2">
              {searchResults.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between bg-[#1a1a2e] rounded-lg p-3">
                  <div>
                    <span className="text-white font-medium">{u.username}</span>
                    <span className="text-amber-400 text-sm ml-2">({u.rating})</span>
                  </div>
                  <button
                    onClick={async () => {
                      const res: any = await api.sendFriendRequest(u.username);
                      if (res.success) {
                        setMessage({ text: `Request sent to ${u.username}`, type: 'success' });
                      } else {
                        setMessage({ text: res.error || 'Failed', type: 'error' });
                      }
                      setTimeout(() => setMessage(null), 3000);
                    }}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
