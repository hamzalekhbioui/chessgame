import { Router, Response } from 'express';
import { supabase } from '../supabase.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/users/profile/:username
router.get('/profile/:username', async (req: AuthRequest, res: Response) => {
  const { username } = req.params;

  const { data: user } = await supabase
    .from('users')
    .select('id, username, email, rating, avatar_url, created_at')
    .eq('username', username)
    .single();

  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  // Get game stats
  const { count: totalGames } = await supabase
    .from('games')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .or(`white_id.eq.${user.id},black_id.eq.${user.id}`);

  const { count: wins } = await supabase
    .from('games')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .or(
      `and(white_id.eq.${user.id},result.eq.white),and(black_id.eq.${user.id},result.eq.black)`
    );

  const { count: draws } = await supabase
    .from('games')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .eq('result', 'draw')
    .or(`white_id.eq.${user.id},black_id.eq.${user.id}`);

  const gamesPlayed = totalGames || 0;
  const winsCount = wins || 0;
  const drawsCount = draws || 0;

  res.json({
    success: true,
    data: {
      ...user,
      games_played: gamesPlayed,
      wins: winsCount,
      losses: gamesPlayed - winsCount - drawsCount,
      draws: drawsCount,
    },
  });
});

// GET /api/users/search?q=username
router.get('/search', async (req: AuthRequest, res: Response) => {
  const query = req.query.q as string;

  if (!query || query.length < 2) {
    res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    return;
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, username, rating, avatar_url')
    .ilike('username', `%${query}%`)
    .neq('id', req.userId!)
    .limit(10);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
});

export default router;
