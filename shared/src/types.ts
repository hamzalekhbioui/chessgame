// ── User ──
export interface User {
  id: string;
  username: string;
  email: string;
  rating: number;
  avatar_url: string | null;
  created_at: string;
}

export interface UserProfile extends User {
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
}

// ── Auth ──
export interface AuthPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends AuthPayload {
  username: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// ── Friendships ──
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface Friendship {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}

export interface FriendRequest extends Friendship {
  sender: User;
  receiver: User;
}

// ── Game ──
export type GameStatus = 'waiting' | 'active' | 'completed' | 'aborted';
export type GameResult = 'white' | 'black' | 'draw';
export type GameResultReason =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'stalemate'
  | 'agreement'
  | 'insufficient_material'
  | 'threefold_repetition'
  | 'fifty_move_rule'
  | 'abandonment';

export interface Game {
  id: string;
  white_id: string;
  black_id: string;
  status: GameStatus;
  result: GameResult | null;
  result_reason: GameResultReason | null;
  time_control: string;
  pgn: string | null;
  starting_fen: string;
  final_fen: string | null;
  white_rating: number;
  black_rating: number;
  created_at: string;
  ended_at: string | null;
}

export interface GameWithPlayers extends Game {
  white: User;
  black: User;
}

// ── Moves ──
export type MoveClassification =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface GameMove {
  id: string;
  game_id: string;
  move_number: number;
  player_id: string;
  notation: string;
  fen_after: string;
  time_spent: number | null;
  evaluation: number | null;
  classification: MoveClassification | null;
}

// ── Socket Events ──
export interface ServerToClientEvents {
  'game:start': (data: { game: Game; color: 'white' | 'black' }) => void;
  'game:move': (data: { move: string; fen: string; moveNumber: number; whiteTime: number; blackTime: number }) => void;
  'game:over': (data: { result: GameResult; reason: GameResultReason }) => void;
  'game:clock': (data: { whiteTime: number; blackTime: number }) => void;
  'game:opponent_disconnected': () => void;
  'game:opponent_reconnected': () => void;
  'challenge:received': (data: { from: User; timeControl: string; challengeId: string }) => void;
  'challenge:cancelled': (data: { challengeId: string }) => void;
  'challenge:declined': (data: { challengeId: string }) => void;
  'friend:online': (data: { userId: string }) => void;
  'friend:offline': (data: { userId: string }) => void;
  'notification:friend_request': (data: { from: User }) => void;
  'error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'game:move': (data: { gameId: string; move: string }) => void;
  'game:resign': (data: { gameId: string }) => void;
  'game:offer_draw': (data: { gameId: string }) => void;
  'game:accept_draw': (data: { gameId: string }) => void;
  'game:decline_draw': (data: { gameId: string }) => void;
  'challenge:send': (data: { toUserId: string; timeControl: string }) => void;
  'challenge:accept': (data: { challengeId: string }) => void;
  'challenge:decline': (data: { challengeId: string }) => void;
}

// ── API Responses ──
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
