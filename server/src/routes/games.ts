import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { analyzeGame } from '../services/analysisService.js';

const router = Router();
router.use(authMiddleware);

const uuidSchema = z.string().uuid('Invalid game ID');
const pageSchema = z.coerce.number().int().min(1).default(1);
const depthSchema = z.coerce.number().int().min(8).max(20).default(14);

// GET /api/games — list user's completed games
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const pageResult = pageSchema.safeParse(req.query.page);
  const page = pageResult.success ? pageResult.data : 1;
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
  const idParsed = uuidSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ success: false, error: 'Invalid game ID' });
    return;
  }

  const { data: game, error } = await supabase
    .from('games')
    .select(
      `
      *,
      white:users!games_white_id_fkey(id, username, rating, avatar_url),
      black:users!games_black_id_fkey(id, username, rating, avatar_url)
    `
    )
    .eq('id', idParsed.data)
    .single();

  if (error || !game) {
    res.status(404).json({ success: false, error: 'Game not found' });
    return;
  }

  const { data: moves } = await supabase
    .from('moves')
    .select('*')
    .eq('game_id', idParsed.data)
    .order('move_number', { ascending: true });

  res.json({
    success: true,
    data: { ...game, moves: moves || [] },
  });
});

// POST /api/games/:id/analyze — run Stockfish analysis on a completed game
router.post('/:id/analyze', async (req: AuthRequest, res: Response) => {
  const idParsed = uuidSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ success: false, error: 'Invalid game ID' });
    return;
  }
  const id = idParsed.data;
  const userId = req.userId!;

  const depthResult = depthSchema.safeParse(req.body?.depth);
  const depth = depthResult.success ? depthResult.data : 14;

  const { data: game, error: fetchError } = await supabase
    .from('games')
    .select('id, white_id, black_id, pgn, status, white_accuracy, black_accuracy')
    .eq('id', id)
    .single();

  if (fetchError || !game) {
    res.status(404).json({ success: false, error: 'Game not found' });
    return;
  }

  if (game.white_id !== userId && game.black_id !== userId) {
    res.status(403).json({ success: false, error: 'Not your game' });
    return;
  }

  if (game.status !== 'completed' || !game.pgn) {
    res.status(400).json({ success: false, error: 'Game is not completed' });
    return;
  }

  // Return cached analysis if already done
  if (game.white_accuracy !== null && game.white_accuracy !== undefined) {
    const { data: existingMoves } = await supabase
      .from('moves')
      .select('*')
      .eq('game_id', id)
      .order('move_number', { ascending: true });

    if (existingMoves && existingMoves.length > 0 && existingMoves[0].cp_loss !== null) {
      res.json({
        success: true,
        data: {
          cached: true,
          whiteAccuracy: game.white_accuracy,
          blackAccuracy: game.black_accuracy,
          moves: existingMoves,
        },
      });
      return;
    }
  }

  try {
    const analysis = await analyzeGame(game.pgn, depth);

    await supabase
      .from('games')
      .update({
        white_accuracy: analysis.whiteAccuracy,
        black_accuracy: analysis.blackAccuracy,
        white_acpl: analysis.whiteAcpl,
        black_acpl: analysis.blackAcpl,
        analyzed_at: new Date().toISOString(),
      })
      .eq('id', id);

    for (const m of analysis.moves) {
      await supabase
        .from('moves')
        .update({
          evaluation: m.evalAfter / 100,
          classification: m.classification,
          best_move: m.bestMove,
          cp_loss: Math.round(m.cpLoss),
          explanation: m.explanation,
          is_brilliant: m.isBrilliant,
          is_critical: m.isCritical,
        })
        .eq('game_id', id)
        .eq('move_number', m.moveNumber);
    }

    res.json({
      success: true,
      data: {
        cached: false,
        whiteAccuracy: analysis.whiteAccuracy,
        blackAccuracy: analysis.blackAccuracy,
        whiteAcpl: analysis.whiteAcpl,
        blackAcpl: analysis.blackAcpl,
        criticalMoments: analysis.criticalMoments,
        moves: analysis.moves,
      },
    });
  } catch (err) {
    console.error('[analyze] failed:', err);
    res.status(500).json({
      success: false,
      error: `Analysis failed: ${(err as Error).message}`,
    });
  }
});

export default router;
