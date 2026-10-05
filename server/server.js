import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDb } from './db.js';
import { migrateIndexes } from './migrate-indexes.js';
import { addSyncClient } from './sync-hub.js';
import entriesRoutes from './routes/entries.routes.js';
import auditRoutes from './routes/audit.routes.js';
import authRoutes from './routes/auth.routes.js';
import holidaysRoutes from './routes/holidays.routes.js';
import configRoutes from './routes/config.routes.js';
import importRoutes from './routes/import.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ojt_dtr_tracker';

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Connect to MongoDB
connectDb(MONGODB_URI)
  .then(() => migrateIndexes().catch(err => console.error('Index migration error:', err)))
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Real-time Sync (SSE) ---
app.get('/api/sync', (req, res) => {
  const remove = addSyncClient(req.query.userId, res);
  req.on('close', remove);
});

app.use('/api/entries', entriesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/holidays', holidaysRoutes);
app.use('/api/config', configRoutes);
app.use('/api/import', importRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
