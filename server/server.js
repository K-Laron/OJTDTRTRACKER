import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { User, Entry, Holiday, Config } from './models.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ojt_dtr_tracker';

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- Real-time Sync (SSE) ---
let clients = [];

app.get('/api/sync', (req, res) => {
  const userId = req.query.userId;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send initial connected event
  res.write('data: {"type":"connected"}\n\n');
  
  const client = { id: Date.now(), userId, res };
  clients.push(client);
  
  req.on('close', () => {
    clients = clients.filter(c => c.id !== client.id);
  });
});

function notifyClients(userId) {
  clients.filter(c => c.userId === userId).forEach(client => client.res.write('data: {"type":"update"}\n\n'));
}

// --- API Routes ---

// --- Auth ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    
    const user = new User({ username, password });
    await user.save();
    res.json({ success: true, userId: user._id.toString(), username: user.username });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    res.json({ success: true, userId: user._id.toString(), username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Middleware to require userId
function requireAuth(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  next();
}

// Entries
app.get('/api/entries', requireAuth, async (req, res) => {
  try {
    const entries = await Entry.find({ userId: req.userId }).sort({ date: -1 });
    res.json(entries);
  } catch (err) {
    console.error('Fetch entries error:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

app.post('/api/entries', requireAuth, async (req, res) => {
  try {
    const entry = new Entry({ ...req.body, userId: req.userId });
    await entry.save();
    notifyClients(req.userId);
    res.json(entry);
  } catch (err) {
    console.error('Add entry error:', err);
    res.status(500).json({ error: 'Failed to add entry' });
  }
});

app.put('/api/entries/:id', requireAuth, async (req, res) => {
  try {
    const entry = await Entry.findOneAndUpdate({ id: req.params.id, userId: req.userId }, req.body, { new: true });
    notifyClients(req.userId);
    res.json(entry);
  } catch (err) {
    console.error('Update entry error:', err);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

app.delete('/api/entries/:id', requireAuth, async (req, res) => {
  try {
    await Entry.findOneAndDelete({ id: req.params.id, userId: req.userId });
    notifyClients(req.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete entry error:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// Holidays
app.get('/api/holidays', requireAuth, async (req, res) => {
  try {
    const holidays = await Holiday.find({ userId: req.userId });
    res.json(holidays);
  } catch (err) {
    console.error('Fetch holidays error:', err);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

app.post('/api/holidays', requireAuth, async (req, res) => {
  try {
    const holiday = new Holiday({ ...req.body, userId: req.userId });
    await holiday.save();
    notifyClients(req.userId);
    res.json(holiday);
  } catch (err) {
    console.error('Add holiday error:', err);
    res.status(500).json({ error: 'Failed to add holiday' });
  }
});

app.delete('/api/holidays/:date', requireAuth, async (req, res) => {
  try {
    await Holiday.findOneAndDelete({ date: req.params.date, userId: req.userId });
    notifyClients(req.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete holiday error:', err);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

// Config (Profile, Settings, Theme)
app.get('/api/config', requireAuth, async (req, res) => {
  try {
    let config = await Config.findOne({ userId: req.userId });
    if (!config) {
      config = new Config({ userId: req.userId });
      await config.save();
    }
    res.json(config);
  } catch (err) {
    console.error('Fetch config error:', err);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

app.put('/api/config', requireAuth, async (req, res) => {
  try {
    const config = await Config.findOneAndUpdate({ userId: req.userId }, req.body, { new: true, upsert: true });
    notifyClients(req.userId);
    res.json(config);
  } catch (err) {
    console.error('Update config error:', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Bulk Import
app.post('/api/import', requireAuth, async (req, res) => {
  try {
    const { entries, holidays, profile, settings, theme } = req.body;
    const userId = req.userId;

    // 1. Clear existing data
    await Promise.all([
      Entry.deleteMany({ userId }),
      Holiday.deleteMany({ userId }),
      Config.deleteMany({ userId })
    ]);

    // 2. Insert new entries
    if (Array.isArray(entries)) {
      const sanitizedEntries = entries.map(e => {
        const { _id, ...rest } = e; // Strip MongoDB IDs if present
        return { ...rest, userId };
      });
      await Entry.insertMany(sanitizedEntries);
    }

    // 3. Insert new holidays
    if (Array.isArray(holidays)) {
      const sanitizedHolidays = holidays.map(h => {
        const { _id, ...rest } = h;
        return { ...rest, userId };
      });
      await Holiday.insertMany(sanitizedHolidays);
    }

    // 4. Create new config
    const config = new Config({
      userId,
      profile: profile || {},
      settings: settings || {},
      theme: theme || 'dark'
    });
    await config.save();

    notifyClients(userId);
    res.json({ success: true, message: 'Data imported successfully' });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to import data: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
