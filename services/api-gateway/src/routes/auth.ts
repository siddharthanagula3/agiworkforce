import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticatedUserSchema } from '../authenticated-user';
import { requireEnv } from '../env';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';

const router: Router = Router();

const JWT_SECRET = requireEnv('JWT_SECRET');
const JWT_EXPIRES_IN = '7d';

import { supabase } from '../lib/supabase';

// DB User interface
interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  desktop_id: string | null;
  created_at: number;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = registerSchema.parse(req.body);

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      throw new AppError('User already exists', 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Note: DB generates UUID via gen_random_uuid(), we get it from the insert response

    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        created_at: Date.now(),
      })
      .select()
      .single();

    if (error || !newUser) {
      throw new AppError('Failed to create user', 500);
    }

    const user = newUser as DbUser; // Type assertion since we defined interface locally matching DB

    const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);

    const { data: userRecord } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!userRecord) {
      throw new AppError('Invalid credentials', 401);
    }

    // safe cast
    const user = userRecord as DbUser;

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        desktopId: user.desktop_id ?? undefined,
      },
    });
  }),
);

router.get(
  '/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new AppError('No token provided', 401);
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = authenticatedUserSchema.parse(payload);
      res.json({ valid: true, userId: user.userId, email: user.email });
    } catch {
      throw new AppError('Invalid token', 401);
    }
  }),
);

export { router as authRouter };
