-- ============================================
-- ChessGame Database Schema for Supabase
-- Run this in the Supabase SQL Editor
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username    VARCHAR(32) UNIQUE NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    rating      INT DEFAULT 1200,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Friendships table
CREATE TABLE IF NOT EXISTS friendships (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id   UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    status      VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sender_id, receiver_id)
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    white_id        UUID REFERENCES users(id) NOT NULL,
    black_id        UUID REFERENCES users(id) NOT NULL,
    status          VARCHAR(20) DEFAULT 'active' CHECK (status IN ('waiting', 'active', 'completed', 'aborted')),
    result          VARCHAR(20) CHECK (result IN ('white', 'black', 'draw')),
    result_reason   VARCHAR(30) CHECK (result_reason IN (
        'checkmate', 'resignation', 'timeout', 'stalemate',
        'agreement', 'insufficient_material', 'threefold_repetition',
        'fifty_move_rule', 'abandonment'
    )),
    time_control    VARCHAR(20) NOT NULL,
    starting_fen    VARCHAR(100) DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    final_fen       VARCHAR(100),
    pgn             TEXT,
    white_rating    INT,
    black_rating    INT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    ended_at        TIMESTAMPTZ
);

-- Moves table
CREATE TABLE IF NOT EXISTS moves (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id         UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
    move_number     INT NOT NULL,
    player_id       UUID REFERENCES users(id) NOT NULL,
    notation        VARCHAR(10) NOT NULL,   -- SAN, e.g. "Nf3"
    fen_after       VARCHAR(100) NOT NULL,
    time_spent      INT,                    -- milliseconds
    evaluation      FLOAT,                  -- pawns from white's perspective
    classification  VARCHAR(20) CHECK (classification IN ('best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_friendships_sender ON friendships(sender_id);
CREATE INDEX IF NOT EXISTS idx_friendships_receiver ON friendships(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);
CREATE INDEX IF NOT EXISTS idx_friendships_accepted ON friendships(sender_id, receiver_id) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_friendships_pending_receiver ON friendships(receiver_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_id);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_completed ON games(created_at DESC) WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_moves_game ON moves(game_id, move_number);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
-- The server uses the service_role key which bypasses RLS entirely.
-- These policies govern direct anon/authenticated client access, providing
-- defence-in-depth. They do NOT grant broad write permissions because the
-- server is the only authorised writer.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;

-- ── Users ──
-- Anyone can look up public profiles; only own row is editable.
CREATE POLICY "users_select_all"
    ON users FOR SELECT USING (true);

CREATE POLICY "users_update_own"
    ON users FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Server (service role) handles INSERT — no anon insert policy needed.

-- ── Friendships ──
-- Users can only see friendships they are part of.
CREATE POLICY "friendships_select_own"
    ON friendships FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can only create friendship rows where they are the sender.
CREATE POLICY "friendships_insert_as_sender"
    ON friendships FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

-- Users can update a friendship row only if they are the receiver
-- (to accept/reject requests) or either party (to cancel their own request).
CREATE POLICY "friendships_update_own"
    ON friendships FOR UPDATE
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Either party can remove the friendship row.
CREATE POLICY "friendships_delete_own"
    ON friendships FOR DELETE
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ── Games ──
-- Players can only read games they participated in.
CREATE POLICY "games_select_own"
    ON games FOR SELECT
    USING (auth.uid() = white_id OR auth.uid() = black_id);

-- No direct client writes to games — server (service role) does all mutations.

-- ── Moves ──
-- Players can read moves of their own games.
CREATE POLICY "moves_select_own_game"
    ON moves FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM games
            WHERE games.id = moves.game_id
            AND (games.white_id = auth.uid() OR games.black_id = auth.uid())
        )
    );

-- No direct client writes to moves — server (service role) does all mutations.
