import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const uuidSchema = z.string().uuid('Invalid ID');
const usernameSchema = z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/);

// GET /api/friends — list accepted friends
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      sender_id,
      receiver_id,
      status,
      created_at,
      sender:users!friendships_sender_id_fkey(id, username, rating, avatar_url),
      receiver:users!friendships_receiver_id_fkey(id, username, rating, avatar_url)
    `)
    .eq('status', 'accepted')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  const friends = data.map((f: any) => {
    const friend = f.sender_id === userId ? f.receiver : f.sender;
    return { friendshipId: f.id, ...friend };
  });

  res.json({ success: true, data: friends });
});

// GET /api/friends/requests — list pending requests received
router.get('/requests', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      sender_id,
      created_at,
      sender:users!friendships_sender_id_fkey(id, username, rating, avatar_url)
    `)
    .eq('receiver_id', userId)
    .eq('status', 'pending');

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
});

// GET /api/friends/sent — list pending requests sent
router.get('/sent', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      receiver_id,
      created_at,
      receiver:users!friendships_receiver_id_fkey(id, username, rating, avatar_url)
    `)
    .eq('sender_id', userId)
    .eq('status', 'pending');

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
});

// POST /api/friends/request — send a friend request
router.post('/request', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const parsed = z.object({ username: usernameSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    return;
  }
  const { username } = parsed.data;

  const { data: target } = await supabase
    .from('users')
    .select('id, username')
    .eq('username', username)
    .single();

  if (!target) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  if (target.id === userId) {
    res.status(400).json({ success: false, error: 'Cannot send friend request to yourself' });
    return;
  }

  const { data: existing } = await supabase
    .from('friendships')
    .select('id, status')
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${target.id}),and(sender_id.eq.${target.id},receiver_id.eq.${userId})`
    )
    .single();

  if (existing) {
    if (existing.status === 'accepted') {
      res.status(409).json({ success: false, error: 'Already friends' });
    } else if (existing.status === 'pending') {
      res.status(409).json({ success: false, error: 'Friend request already pending' });
    } else {
      await supabase
        .from('friendships')
        .update({ status: 'pending', sender_id: userId, receiver_id: target.id, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      res.json({ success: true, data: { message: 'Friend request sent' } });
    }
    return;
  }

  const { error } = await supabase
    .from('friendships')
    .insert({ sender_id: userId, receiver_id: target.id, status: 'pending' });

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.status(201).json({ success: true, data: { message: 'Friend request sent' } });
});

// POST /api/friends/accept/:id
router.post('/accept/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const idParsed = uuidSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ success: false, error: 'Invalid friendship ID' });
    return;
  }
  const friendshipId = idParsed.data;

  const { data: friendship } = await supabase
    .from('friendships')
    .select('*')
    .eq('id', friendshipId)
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .single();

  if (!friendship) {
    res.status(404).json({ success: false, error: 'Friend request not found' });
    return;
  }

  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', friendshipId);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data: { message: 'Friend request accepted' } });
});

// POST /api/friends/reject/:id
router.post('/reject/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const idParsed = uuidSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ success: false, error: 'Invalid friendship ID' });
    return;
  }
  const friendshipId = idParsed.data;

  const { data: friendship } = await supabase
    .from('friendships')
    .select('*')
    .eq('id', friendshipId)
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .single();

  if (!friendship) {
    res.status(404).json({ success: false, error: 'Friend request not found' });
    return;
  }

  const { error } = await supabase
    .from('friendships')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', friendshipId);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data: { message: 'Friend request rejected' } });
});

// DELETE /api/friends/:id — remove a friend
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const idParsed = uuidSchema.safeParse(req.params.id);
  if (!idParsed.success) {
    res.status(400).json({ success: false, error: 'Invalid friendship ID' });
    return;
  }
  const friendshipId = idParsed.data;

  const { data: friendship } = await supabase
    .from('friendships')
    .select('*')
    .eq('id', friendshipId)
    .eq('status', 'accepted')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .single();

  if (!friendship) {
    res.status(404).json({ success: false, error: 'Friendship not found' });
    return;
  }

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data: { message: 'Friend removed' } });
});

export default router;
