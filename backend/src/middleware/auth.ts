import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { verifyToken, JwtPayload } from '../lib/jwt';
import { canView, canWrite, canManageUsers, canExportPdf, canPlan } from '../lib/audit';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح' });
  }
  try {
    const tokenPayload = verifyToken(header.slice(7));
    prisma.user
      .findUnique({ where: { id: tokenPayload.userId } })
      .then((user) => {
        if (!user || !user.isActive) {
          return res.status(401).json({ error: 'المستخدم غير مفعل' });
        }
        if (user.tokenVersion !== tokenPayload.tokenVersion) {
          return res.status(401).json({ error: 'انتهت صلاحية الجلسة' });
        }
        req.user = {
          userId: user.id,
          email: user.email,
          role: user.role,
          tokenVersion: user.tokenVersion,
        };
        next();
      })
      .catch(next);
  } catch {
    return res.status(401).json({ error: 'رمز غير صالح' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'صلاحيات غير كافية' });
    }
    next();
  };
}

export function requireWrite(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !canWrite(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيات الكتابة مطلوبة' });
  }
  next();
}

export function requireView(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !canView(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيات العرض مطلوبة' });
  }
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !canManageUsers(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيات المدير مطلوبة' });
  }
  next();
}

export function requirePdfExport(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !canExportPdf(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيات تصدير PDF مطلوبة' });
  }
  next();
}

export function requirePlan(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !canPlan(req.user.role)) {
    return res.status(403).json({ error: 'صلاحيات التخطيط مطلوبة' });
  }
  next();
}
