import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import masterDataRoutes from './routes/masterData';
import orderRoutes from './routes/orders';
import planningRoutes from './routes/planning';
import miscRoutes from './routes/misc';
import workflowRoutes from './routes/workflows';
import { ensureUploadDirs, assertUploadDirsWritable, UPLOAD_DIR } from './lib/utils';
import { prisma } from './lib/prisma';
import { errorFromUnknown } from './lib/http';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production');
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT) || 4000;

ensureUploadDirs();

if (process.env.NODE_ENV === 'production') {
  try {
    assertUploadDirsWritable();
  } catch (err) {
    console.error('FATAL: UPLOAD_DIR is not writable:', UPLOAD_DIR, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

app.use(helmet());
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '50mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات تسجيل دخول كثيرة، حاول لاحقاً' },
});

app.get('/api/v1/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({
      ok: false,
      db: 'disconnected',
      error: err instanceof Error ? err.message : 'Database unreachable',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', masterDataRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1', planningRoutes);
app.use('/api/v1', workflowRoutes);
app.use('/api/v1', miscRoutes);

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const apiError = errorFromUnknown(err);
  const status = apiError.status;
  const message = apiError.message;

  if (status >= 500) {
    console.error('[error]', {
      method: req.method,
      path: req.path,
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  res.status(status).json({
    error: message,
    ...(apiError.details ? { details: apiError.details } : {}),
    ...(process.env.NODE_ENV !== 'production' && err instanceof Error && err.stack ? { stack: err.stack } : {}),
  });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
