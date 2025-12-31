import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticatedUserSchema } from '../authenticated-user';
import { requireEnv } from '../env';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router: Router = Router();

const JWT_SECRET = requireEnv('JWT_SECRET');
const JWT_EXPIRES_IN = '7d';

interface User {
  id: string;
  email: string;
  passwordHash: string;
  desktopId?: string;
  createdAt: number;
}

const users = new Map<string, User>();

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

    if (users.has(email)) {
      throw new AppError('User already exists', 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user: User = {
      id: randomUUID(),
      email,
      passwordHash,
      createdAt: Date.now(),
    };

    users.set(email, user);

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

    const user = users.get(email);
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
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
        desktopId: user.desktopId,
      },
    });
  }),
);

router.get('/verify', (req: Request, res: Response) => {
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
});

export { router as authRouter };
