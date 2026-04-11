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
    notation        VARCHAR(10) NOT NULL,
    fen_after       VARCHAR(100) NOT NULL,
    time_spent      INT,
    evaluation      FLOAT,
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

-- Row Level Security (RLS) Policies
-- Note: Since we use the service role key on the server, RLS is bypassed.
-- These policies are for extra safety if you ever use the anon key directly.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;

-- Users: anyone can read, only own user can update
CREATE POLICY "Users are viewable by everyone" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own record" ON users FOR UPDATE USING (auth.uid() = id);

-- Friendships: involved users can read
CREATE POLICY "Users can view own friendships" ON friendships FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can insert friendships" ON friendships FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

-- Games: involved users can read
CREATE POLICY "Users can view own games" ON games FOR SELECT
    USING (auth.uid() = white_id OR auth.uid() = black_id);

-- Moves: anyone in the game can read
CREATE POLICY "Users can view moves of own games" ON moves FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM games
            WHERE games.id = moves.game_id
            AND (games.white_id = auth.uid() OR games.black_id = auth.uid())
        )
    );


-- Allow service role and authenticated users to insert into users table
CREATE POLICY "Allow insert for users" ON users FOR INSERT WITH CHECK (true);

-- Allow inserts on all tables from server (service role bypasses, but just in case)
CREATE POLICY "Allow insert for friendships" ON friendships FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can insert friendships" ON friendships;

CREATE POLICY "Allow insert for games" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow insert for moves" ON moves FOR INSERT WITH CHECK (true);

-- Allow updates
CREATE POLICY "Allow update for users" ON users FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Users can update own record" ON users;

CREATE POLICY "Allow update for friendships" ON friendships FOR UPDATE USING (true);
CREATE POLICY "Allow update for games" ON games FOR UPDATE USING (true);

-- Allow deletes for friendships
CREATE POLICY "Allow delete for friendships" ON friendships FOR DELETE USING (true);