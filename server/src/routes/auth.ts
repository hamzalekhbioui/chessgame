import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../supabase.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, username } = req.body;

  if (!email || !password || !username) {
    res.status(400).json({ success: false, error: 'Email, password, and username are required' });
    return;
  }

  if (username.length < 3 || username.length > 32) {
    res.status(400).json({ success: false, error: 'Username must be 3-32 characters' });
    return;
  }

  // Check if username is taken
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (existing) {
    res.status(409).json({ success: false, error: 'Username already taken' });
    return;
  }

  // Create auth user via Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    res.status(400).json({ success: false, error: authError?.message || 'Registration failed' });
    return;
  }

  // Insert into our users table
  const { data: user, error: dbError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      username,
      email,
      rating: 1200,
    })
    .select()
    .single();

  if (dbError) {
    // Cleanup: delete auth user if DB insert fails
    await supabase.auth.admin.deleteUser(authData.user.id);
    res.status(500).json({ success: false, error: 'Failed to create user profile' });
    return;
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        rating: user.rating,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
      },
      token,
    },
  });
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, error: 'Email and password are required' });
    return;
  }

  // Authenticate via Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    res.status(401).json({ success: false, error: 'Invalid email or password' });
    return;
  }

  // Fetch user profile
  const { data: user, error: dbError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (dbError || !user) {
    res.status(500).json({ success: false, error: 'User profile not found' });
    return;
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        rating: user.rating,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
      },
      token,
    },
  });
});

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token' });
    return;
  }

  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET!) as { userId: string };
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        rating: user.rating,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
      },
    });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

export default router;
