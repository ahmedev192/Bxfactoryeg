import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { authMiddleware, AuthRequest, requireAdmin } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { param } from '../lib/param';
import { asyncHandler, ApiError, validateBody } from '../lib/http';
import { createUserSchema, loginSchema, updateUserSchema } from '../lib/schemas';

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = validateBody(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(423, 'الحساب مقفل مؤقتاً بسبب محاولات دخول كثيرة');
  }
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    if (user) {
      const failedLoginCount = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          lockedUntil: failedLoginCount >= 10 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      });
    }
    throw new ApiError(401, 'بيانات الدخول غير صحيحة');
  }
  if (!user.isActive) throw new ApiError(403, 'الحساب غير مفعل');
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  const token = signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive } });
}));

router.get('/me', authMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive });
}));

router.get('/users', authMiddleware, requireAdmin, asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  res.json(users);
}));

router.post('/users', authMiddleware, requireAdmin, asyncHandler(async (req: AuthRequest, res) => {
  const { email, password, name, role } = validateBody(createUserSchema, req.body);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, role, passwordChangedAt: new Date() },
  });
  await logAudit(req.user!.userId, 'CREATE', 'User', user.id);
  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive });
}));

router.patch('/users/:id', authMiddleware, requireAdmin, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'المستخدم غير موجود');

  const { name, role, isActive, password } = validateBody(updateUserSchema, req.body);
  const data: {
    name?: string;
    role?: UserRole;
    isActive?: boolean;
    passwordHash?: string;
    tokenVersion?: { increment: number };
    passwordChangedAt?: Date;
  } = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (isActive !== undefined) data.isActive = isActive;
  if (password !== undefined) {
    data.passwordHash = await bcrypt.hash(password, 10);
    data.passwordChangedAt = new Date();
    data.tokenVersion = { increment: 1 };
  } else if (role !== undefined || isActive === false) {
    data.tokenVersion = { increment: 1 };
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  await logAudit(req.user!.userId, 'UPDATE', 'User', id);
  res.json(user);
}));

export default router;
