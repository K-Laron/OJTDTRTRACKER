import dotenv from 'dotenv';
import { connectDb } from './db.js';
import { migrateIndexes } from './migrate-indexes.js';
import { createApp } from './app.js';

dotenv.config();

const app = createApp();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ojt_dtr_tracker';

connectDb(MONGODB_URI)
  .then(() => migrateIndexes().catch(err => console.error('Index migration error:', err)))
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
