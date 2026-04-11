const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const token = localStorage.getItem('token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const json = await res.json();

  if (!res.ok) {
    return { success: false, error: json.error || 'Request failed' };
  }

  return json;
}

export const api = {
  // Auth
  register: (data: { email: string; password: string; username: string }) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  getMe: () => request('/auth/me'),

  // Users
  searchUsers: (query: string) => request(`/users/search?q=${encodeURIComponent(query)}`),

  getUserProfile: (username: string) => request(`/users/profile/${encodeURIComponent(username)}`),

  // Friends
  getFriends: () => request('/friends'),

  getFriendRequests: () => request('/friends/requests'),

  getSentRequests: () => request('/friends/sent'),

  sendFriendRequest: (username: string) =>
    request('/friends/request', { method: 'POST', body: JSON.stringify({ username }) }),

  acceptFriendRequest: (id: string) =>
    request(`/friends/accept/${id}`, { method: 'POST' }),

  rejectFriendRequest: (id: string) =>
    request(`/friends/reject/${id}`, { method: 'POST' }),

  removeFriend: (id: string) =>
    request(`/friends/${id}`, { method: 'DELETE' }),

  // Games
  getGames: (page = 1) => request(`/games?page=${page}`),

  getGame: (id: string) => request(`/games/${id}`),
};
