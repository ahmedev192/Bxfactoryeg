import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { authMiddleware, AuthRequest, requireAdmin } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { param } from '../lib/param';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

router.get('/users', authMiddleware, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  res.json(users);
});

router.post('/users', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  const { email, password, name, role } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash, name, role } });
  await logAudit(req.user!.userId, 'CREATE', 'User', user.id);
  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

router.patch('/users/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const { name, role } = req.body as { name?: string; role?: UserRole };
  const data: { name?: string; role?: UserRole } = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'name أو role مطلوب' });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  await logAudit(req.user!.userId, 'UPDATE', 'User', id);
  res.json(user);
});

export default router;
