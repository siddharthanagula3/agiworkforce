import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticatedUserSchema } from '../authenticated-user';
import { requireEnv } from '../env';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';

const router: Router = Router();

const JWT_SECRET = requireEnv('JWT_SECRET');
const JWT_EXPIRES_IN = '7d';

import { supabase } from '../lib/supabase';

// Dummy hash for timing attack prevention - generated with bcrypt.hash('dummy', 10)
// This ensures we always run bcrypt.compare even when user doesn't exist,
// preventing timing-based user enumeration attacks
const DUMMY_PASSWORD_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

// Rate limiting for auth endpoints: 5 attempts per 15 minute window
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per window
  message: { error: 'Too many authentication attempts, please try again after 15 minutes' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

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
  authRateLimiter,
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
  authRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);

    const { data: userRecord } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    // Always run bcrypt.compare to prevent timing attacks that could reveal user existence
    // Use dummy hash when user doesn't exist so timing is consistent
    const hashToCompare = userRecord ? (userRecord as DbUser).password_hash : DUMMY_PASSWORD_HASH;
    const isValid = await bcrypt.compare(password, hashToCompare);

    // Check both conditions after bcrypt to maintain consistent timing
    if (!userRecord || !isValid) {
      throw new AppError('Invalid credentials', 401);
    }

    // safe cast (we know userRecord exists at this point)
    const user = userRecord as DbUser;

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
