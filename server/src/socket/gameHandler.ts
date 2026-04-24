import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { supabase } from '../supabase.js';
import {
  createGame,
  getActiveGame,
  getPlayerGame,
  makeMove,
  resignGame,
  offerDraw,
  acceptDraw,
  declineDraw,
  getGameState,
} from '../services/gameService.js';

interface Challenge {
  id: string;
  fromUserId: string;
  toUserId: string;
  timeControl: string;
  createdAt: number;
}

const onlineUsers = new Map<string, Set<string>>(); // userId -> Set<socketId>
const challenges = new Map<string, Challenge>(); // challengeId -> Challenge
const socketUserMap = new Map<string, string>(); // socketId -> userId

function parseCookieToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === 'token') return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function setupSocketHandlers(io: Server) {
  // Auth middleware — prefer httpOnly cookie, fall back to handshake.auth.token
  io.use((socket, next) => {
    const cookieToken = parseCookieToken(socket.handshake.headers.cookie);
    const token = cookieToken || socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      socket.data.userId = decoded.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId: string = socket.data.userId;
    const origin = socket.handshake.headers.origin || 'unknown';
    console.log(`[SOCKET] Connected userId=${userId} socketId=${socket.id} origin=${origin}`);

    // Track online status
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);
    socketUserMap.set(socket.id, userId);

    console.log(`[SOCKET] onlineUsers now: [${Array.from(onlineUsers.keys()).join(', ')}]`);

    // Notify friends user is online
    notifyFriendsOnlineStatus(io, userId, true);

    // Send this user the list of friends who are already online
    sendOnlineFriends(socket, userId);

    // Rejoin active game if any (handles page reload reconnect)
    const existingGame = getPlayerGame(userId);
    if (existingGame) {
      const gameRoom = `game:${existingGame.id}`;
      socket.join(gameRoom);
      sendFullGameState(io, socket, existingGame.id, userId);
    }

    // ── Challenge Handlers ──

    socket.on('challenge:send', async (data: { toUserId: string; timeControl: string }) => {
      const { toUserId, timeControl } = data;

      const areFriends = await checkFriendship(userId, toUserId);
      if (!areFriends) {
        socket.emit('error', { message: 'You can only challenge friends' });
        return;
      }

      if (getPlayerGame(userId) || getPlayerGame(toUserId)) {
        socket.emit('error', { message: 'One of the players is already in a game' });
        return;
      }

      const challengeId = `challenge_${Date.now()}_${userId}`;
      const challenge: Challenge = {
        id: challengeId,
        fromUserId: userId,
        toUserId,
        timeControl: timeControl || '10+0',
        createdAt: Date.now(),
      };
      challenges.set(challengeId, challenge);

      const { data: sender } = await supabase
        .from('users')
        .select('id, username, rating, avatar_url')
        .eq('id', userId)
        .single();

      const targetSockets = onlineUsers.get(toUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('challenge:received', {
            from: sender,
            timeControl: challenge.timeControl,
            challengeId,
          });
        }
      } else {
        socket.emit('error', { message: 'User is offline' });
        challenges.delete(challengeId);
      }
    });

    socket.on('challenge:accept', async (data: { challengeId: string }) => {
      const challenge = challenges.get(data.challengeId);
      if (!challenge || challenge.toUserId !== userId) {
        socket.emit('error', { message: 'Challenge not found' });
        return;
      }

      challenges.delete(data.challengeId);

      const isWhite = Math.random() < 0.5;
      const whiteId = isWhite ? challenge.fromUserId : challenge.toUserId;
      const blackId = isWhite ? challenge.toUserId : challenge.fromUserId;

      const game = createGame(whiteId, blackId, challenge.timeControl);
      const gameRoom = `game:${game.id}`;

      const challengerSockets = onlineUsers.get(challenge.fromUserId);
      const accepterSockets = onlineUsers.get(challenge.toUserId);

      if (challengerSockets) {
        for (const sid of challengerSockets) {
          const s = io.sockets.sockets.get(sid);
          s?.join(gameRoom);
        }
      }
      if (accepterSockets) {
        for (const sid of accepterSockets) {
          const s = io.sockets.sockets.get(sid);
          s?.join(gameRoom);
        }
      }

      const [{ data: whitePlr }, { data: blackPlr }] = await Promise.all([
        supabase.from('users').select('id, username, rating, avatar_url').eq('id', whiteId).single(),
        supabase.from('users').select('id, username, rating, avatar_url').eq('id', blackId).single(),
      ]);

      const gameData = {
        id: game.id,
        white: whitePlr,
        black: blackPlr,
        timeControl: game.timeControl,
        whiteTime: game.whiteTime,
        blackTime: game.blackTime,
      };

      if (challengerSockets) {
        for (const sid of challengerSockets) {
          io.to(sid).emit('game:start', {
            game: gameData,
            color: challenge.fromUserId === whiteId ? 'white' : 'black',
          });
        }
      }
      if (accepterSockets) {
        for (const sid of accepterSockets) {
          io.to(sid).emit('game:start', {
            game: gameData,
            color: challenge.toUserId === whiteId ? 'white' : 'black',
          });
        }
      }
    });

    socket.on('challenge:decline', (data: { challengeId: string }) => {
      const challenge = challenges.get(data.challengeId);
      if (!challenge || challenge.toUserId !== userId) return;

      challenges.delete(data.challengeId);

      const challengerSockets = onlineUsers.get(challenge.fromUserId);
      if (challengerSockets) {
        for (const sid of challengerSockets) {
          io.to(sid).emit('challenge:declined', { challengeId: data.challengeId });
        }
      }
    });

    // ── Game Handlers ──

    // Client requests full state (e.g. after page reload)
    socket.on('game:request_state', async () => {
      const game = getPlayerGame(userId);
      if (!game) return;
      const gameRoom = `game:${game.id}`;
      socket.join(gameRoom);
      await sendFullGameState(io, socket, game.id, userId);
    });

    socket.on('game:move', (data: { gameId: string; move: string }) => {
      const result = makeMove(data.gameId, userId, data.move);

      if (!result.success) {
        socket.emit('error', { message: result.error || 'Invalid move' });
        return;
      }

      const gameRoom = `game:${data.gameId}`;

      // Broadcast SAN notation so the moves list is human-readable on all clients
      io.to(gameRoom).emit('game:move', {
        move: result.moveNotation!, // SAN (e.g. "Nf3"), not UCI ("g1f3")
        fen: result.fen!,
        moveNumber: getActiveGame(data.gameId)?.moves.length || 0,
        whiteTime: result.whiteTime!,
        blackTime: result.blackTime!,
      });

      if (result.gameOver) {
        io.to(gameRoom).emit('game:over', {
          result: result.result!,
          reason: result.reason!,
        });
      }
    });

    socket.on('game:resign', (data: { gameId: string }) => {
      const result = resignGame(data.gameId, userId);
      if (!result) return;

      io.to(`game:${data.gameId}`).emit('game:over', {
        result: result.result,
        reason: result.reason,
      });
    });

    socket.on('game:offer_draw', (data: { gameId: string }) => {
      if (offerDraw(data.gameId, userId)) {
        const game = getActiveGame(data.gameId);
        if (!game) return;
        const opponentId = userId === game.whiteId ? game.blackId : game.whiteId;
        const opponentSockets = onlineUsers.get(opponentId);
        if (opponentSockets) {
          for (const sid of opponentSockets) {
            io.to(sid).emit('game:draw_offered', { from: userId });
          }
        }
      }
    });

    socket.on('game:accept_draw', (data: { gameId: string }) => {
      const result = acceptDraw(data.gameId, userId);
      if (result) {
        io.to(`game:${data.gameId}`).emit('game:over', {
          result: result.result,
          reason: result.reason,
        });
      }
    });

    socket.on('game:decline_draw', (data: { gameId: string }) => {
      declineDraw(data.gameId, userId);
    });

    // ── Disconnect ──

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${userId} (socket: ${socket.id})`);

      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          notifyFriendsOnlineStatus(io, userId, false);
        }
      }
      socketUserMap.delete(socket.id);

      const game = getPlayerGame(userId);
      if (game && !onlineUsers.has(userId)) {
        const opponentId = userId === game.whiteId ? game.blackId : game.whiteId;
        const opponentSockets = onlineUsers.get(opponentId);
        if (opponentSockets) {
          for (const sid of opponentSockets) {
            io.to(sid).emit('game:opponent_disconnected');
          }
        }
      }
    });
  });

  // Clean up stale challenges every minute
  setInterval(() => {
    const now = Date.now();
    for (const [id, challenge] of challenges) {
      if (now - challenge.createdAt > 60_000) {
        challenges.delete(id);
      }
    }
  }, 60_000);
}

async function sendFullGameState(io: Server, socket: Socket, gameId: string, userId: string) {
  const state = getGameState(gameId);
  if (!state) return;

  const [{ data: whitePlr }, { data: blackPlr }] = await Promise.all([
    supabase.from('users').select('id, username, rating, avatar_url').eq('id', state.whiteId).single(),
    supabase.from('users').select('id, username, rating, avatar_url').eq('id', state.blackId).single(),
  ]);

  socket.emit('game:state', {
    ...state,
    white: whitePlr,
    black: blackPlr,
    color: userId === state.whiteId ? 'white' : 'black',
  });
}

async function checkFriendship(userId1: string, userId2: string): Promise<boolean> {
  const { data } = await supabase
    .from('friendships')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
    )
    .single();

  return !!data;
}

async function notifyFriendsOnlineStatus(io: Server, userId: string, isOnline: boolean) {
  const { data: friendships, error } = await supabase
    .from('friendships')
    .select('sender_id, receiver_id')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

  if (error) {
    console.error(`[PRESENCE] notifyFriendsOnlineStatus query error:`, error.message);
    return;
  }
  if (!friendships) return;

  const event = isOnline ? 'friend:online' : 'friend:offline';
  let notified = 0;

  for (const f of friendships) {
    const friendId = f.sender_id === userId ? f.receiver_id : f.sender_id;
    const friendSockets = onlineUsers.get(friendId);
    if (friendSockets) {
      for (const sid of friendSockets) {
        io.to(sid).emit(event, { userId });
        notified++;
      }
    }
  }

  console.log(
    `[PRESENCE] ${userId} ${event}: notified ${notified} socket(s) across ${friendships.length} friendship(s)`
  );
}

async function sendOnlineFriends(socket: Socket, userId: string) {
  const { data: friendships, error } = await supabase
    .from('friendships')
    .select('sender_id, receiver_id')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

  if (error) {
    console.error(`[PRESENCE] sendOnlineFriends query error for ${userId}:`, error.message);
  }

  const onlineFriendIds: string[] = [];
  if (friendships) {
    for (const f of friendships) {
      const friendId = f.sender_id === userId ? f.receiver_id : f.sender_id;
      if (onlineUsers.has(friendId)) {
        onlineFriendIds.push(friendId);
      }
    }
  }

  console.log(
    `[PRESENCE] sendOnlineFriends to ${userId}: ${friendships?.length || 0} friendships, ${onlineFriendIds.length} online: [${onlineFriendIds.join(', ')}]`
  );

  socket.emit('friends:online_list', { userIds: onlineFriendIds });
}

export function getOnlineUsers(): string[] {
  return Array.from(onlineUsers.keys());
}
