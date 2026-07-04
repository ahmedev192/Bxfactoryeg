import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError, ZodSchema } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function asyncHandler<TReq extends Request = Request>(
  handler: (req: TReq, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: TReq, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function validateBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'بيانات غير صالحة', parsed.error.flatten());
  }
  return parsed.data;
}

export function errorFromUnknown(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return new ApiError(400, 'بيانات غير صالحة', err.flatten());
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return new ApiError(409, 'يوجد سجل بنفس القيمة بالفعل', err.meta);
    if (err.code === 'P2025') return new ApiError(404, 'السجل غير موجود', err.meta);
    if (err.code === 'P2003') return new ApiError(400, 'لا يمكن تنفيذ العملية بسبب ارتباطات موجودة', err.meta);
    return new ApiError(400, 'خطأ في قاعدة البيانات', { code: err.code, meta: err.meta });
  }

  if (err instanceof Error) return new ApiError(500, err.message);
  return new ApiError(500, 'خطأ في الخادم');
}
