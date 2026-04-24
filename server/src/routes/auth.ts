import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { supabase } from '../supabase.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts, please try again later' },
});

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  username: z
    .string()
    .min(3, 'Username must be 3–32 characters')
    .max(32, 'Username must be 3–32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
};

function issueAuthCookie(res: Response, userId: string): void {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  res.cookie('token', token, COOKIE_OPTS);
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    return;
  }
  const { email, password, username } = parsed.data;

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (existing) {
    res.status(409).json({ success: false, error: 'Username already taken' });
    return;
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    res.status(400).json({ success: false, error: authError?.message || 'Registration failed' });
    return;
  }

  const { data: user, error: dbError } = await supabase
    .from('users')
    .insert({ id: authData.user.id, username, email, rating: 1200 })
    .select()
    .single();

  if (dbError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    res.status(500).json({ success: false, error: 'Failed to create user profile' });
    return;
  }

  issueAuthCookie(res, user.id);
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
    },
  });
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    return;
  }
  const { email, password } = parsed.data;

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    res.status(401).json({ success: false, error: 'Invalid email or password' });
    return;
  }

  const { data: user, error: dbError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (dbError || !user) {
    res.status(500).json({ success: false, error: 'User profile not found' });
    return;
  }

  issueAuthCookie(res, user.id);
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
    },
  });
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', { path: '/' });
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
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
    res.status(401).json({ success: false, error: 'Invalid session' });
  }
});

export default router;
