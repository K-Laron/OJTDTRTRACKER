import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDb } from './db.js';
import { migrateIndexes } from './migrate-indexes.js';
import entriesRoutes from './routes/entries.routes.js';
import auditRoutes from './routes/audit.routes.js';
import authRoutes from './routes/auth.routes.js';
import holidaysRoutes from './routes/holidays.routes.js';
import configRoutes from './routes/config.routes.js';
import importRoutes from './routes/import.routes.js';
import syncRoutes from './routes/sync.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ojt_dtr_tracker';
const allowedOrigins = new Set(
  String(process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
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
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
}));
app.use(express.json({ limit: '5mb' }));

// Connect to MongoDB
connectDb(MONGODB_URI)
  .then(() => migrateIndexes().catch(err => console.error('Index migration error:', err)))
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Real-time Sync (SSE) ---
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
  console.error('Unhandled API error:', err);
  if (res.headersSent) return next(err);
  const denied = err.message === 'CORS origin not allowed';
  return res.status(denied ? 403 : 500).json({ error: denied ? err.message : 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
