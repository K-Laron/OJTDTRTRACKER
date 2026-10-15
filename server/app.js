import express from 'express';
import cors from 'cors';
import entriesRoutes from './routes/entries.routes.js';
import auditRoutes from './routes/audit.routes.js';
import authRoutes from './routes/auth.routes.js';
import holidaysRoutes from './routes/holidays.routes.js';
import configRoutes from './routes/config.routes.js';
import importRoutes from './routes/import.routes.js';
import syncRoutes from './routes/sync.routes.js';

export function createApp({ allowedOrigins = null } = {}) {
  const app = express();
  const origins = allowedOrigins || new Set(
    String(process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
  );

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origins.has(origin)) return callback(null, true);
      return callback(new Error('CORS origin not allowed'));
    },
  }));
  app.use(express.json({ limit: '5mb' }));

  app.use('/api/sync', syncRoutes);
  app.use('/api/entries', entriesRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/holidays', holidaysRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/import', importRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const denied = err.message === 'CORS origin not allowed';
    return res.status(denied ? 403 : 500).json({ error: denied ? err.message : 'Internal server error' });
  });

  return app;
}
