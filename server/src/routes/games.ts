import { Router, Response } from 'express';
import { supabase } from '../supabase.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/games — list user's completed games
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('games')
    .select(
      `
      *,
      white:users!games_white_id_fkey(id, username, rating, avatar_url),
      black:users!games_black_id_fkey(id, username, rating, avatar_url)
    `,
      { count: 'exact' }
    )
    .eq('status', 'completed')
    .or(`white_id.eq.${userId},black_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.json({
    success: true,
    data: {
      games: data,
      total: count,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
});

// GET /api/games/:id — get a specific game with moves
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const { data: game, error } = await supabase
    .from('games')
    .select(
      `
      *,
      white:users!games_white_id_fkey(id, username, rating, avatar_url),
      black:users!games_black_id_fkey(id, username, rating, avatar_url)
    `
    )
    .eq('id', id)
    .single();

  if (error || !game) {
    res.status(404).json({ success: false, error: 'Game not found' });
    return;
  }

  // Fetch moves
  const { data: moves } = await supabase
    .from('moves')
    .select('*')
    .eq('game_id', id)
    .order('move_number', { ascending: true });

  res.json({
    success: true,
    data: { ...game, moves: moves || [] },
  });
});

export default router;
