import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { AuditEvent, User, Entry, Holiday, Config } from './models.js';
import { syncPhilippinePublicHolidays } from './holiday-sync.js';
import {
  buildImportPreview,
  DEFAULT_SETTINGS,
  entriesConflict,
  normalizeProfile,
  normalizeSettings,
  resolveEntryUpdate,
  sanitizeEntry,
  sanitizeHoliday,
  sanitizeImportPayload,
} from './tracker-core.js';

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

function notifyClients(userId, resources = ['entries', 'holidays', 'config']) {
  const payload = JSON.stringify({ type: 'update', resources });
  clients
    .filter(c => c.userId === userId)
    .forEach(client => client.res.write(`data: ${payload}\n\n`));
}

function isTransactionUnsupported(err) {
  if (!err) return false;
  return (
    err.code === 20
    || err.codeName === 'IllegalOperation'
    || /Transaction numbers are only allowed/i.test(err.message || '')
    || /replica set member or mongos/i.test(err.message || '')
  );
}

async function withOptionalTransaction(work) {
  const session = await mongoose.startSession();
  let usedTransaction = false;
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        usedTransaction = true;
        result = await work(session);
      });
      return { result, usedTransaction };
    } catch (err) {
      if (!isTransactionUnsupported(err)) throw err;
      usedTransaction = false;
      result = await work(null);
      return { result, usedTransaction };
    }
  } finally {
    await session.endSession();
  }
}

async function writeAuditEvent(event, session = null) {
  await AuditEvent.create([{
    ts: new Date(),
    meta: null,
    ...event,
  }], session ? { session } : undefined);
}

async function readAuditEvents(userId, limit = 50) {
  return AuditEvent
    .find({ userId })
    .sort({ ts: -1, _id: -1 })
    .limit(limit)
    .lean();
}

async function getUserSettings(userId, session = null) {
  const query = Config.findOne({ userId });
  if (session) query.session(session);
  const config = await query.lean();
  return normalizeSettings(config?.settings || DEFAULT_SETTINGS);
}

function cleanEntryForAudit(entry) {
  if (!entry) return null;
  const { _id, __v, userId, ...rest } = entry;
  return rest;
}

function cleanHolidayForAudit(holiday) {
  if (!holiday) return null;
  const { _id, __v, userId, ...rest } = holiday;
  return rest;
}

function cleanConfigForAudit(config) {
  if (!config) {
    return {
      profile: normalizeProfile({}),
      settings: normalizeSettings(DEFAULT_SETTINGS),
      theme: 'dark',
    };
  }
  return {
    profile: normalizeProfile(config.profile || {}),
    settings: normalizeSettings(config.settings || DEFAULT_SETTINGS),
    theme: config.theme === 'light' ? 'light' : 'dark',
  };
}

async function getUserStateSnapshot(userId, session = null) {
  const entriesQuery = Entry.find({ userId });
  const holidaysQuery = Holiday.find({ userId });
  const configQuery = Config.findOne({ userId });
  if (session) {
    entriesQuery.session(session);
    holidaysQuery.session(session);
    configQuery.session(session);
  }

  const [entries, holidays, config] = await Promise.all([
    entriesQuery.lean(),
    holidaysQuery.lean(),
    configQuery.lean(),
  ]);

  return {
    entries: entries.map(cleanEntryForAudit),
    holidays: holidays.map(cleanHolidayForAudit),
    ...cleanConfigForAudit(config),
  };
}

function getErrorStatus(err) {
  if (err?.code === 11000) return 400;
  if (typeof err?.message === 'string' && err.message) return 400;
  return 500;
}

function getHolidaySyncYears(config) {
  const currentYear = new Date().getFullYear();
  const startYear = Number.parseInt(config?.profile?.startDate?.slice(0, 4), 10);
  const earliestYear = Number.isInteger(startYear) ? Math.min(startYear, currentYear) : currentYear;
  const years = [];

  for (let year = earliestYear; year <= currentYear + 1; year += 1) {
    years.push(year);
  }

  return years;
}

function getRequestedHolidaySyncYears(req, config) {
  const requestedYears = [
    req.query.year,
    ...(Array.isArray(req.query.years)
      ? req.query.years
      : typeof req.query.years === 'string'
        ? req.query.years.split(',')
        : []),
  ]
    .flatMap(value => (Array.isArray(value) ? value : [value]))
    .map(value => Number.parseInt(String(value).trim(), 10))
    .filter(year => Number.isInteger(year) && year >= 1900 && year <= 2100);

  const fallbackYears = getHolidaySyncYears(config);
  return [...new Set([...(requestedYears.length ? requestedYears : []), ...fallbackYears])].sort((a, b) => a - b);
}

function toConflictResponse(current, resolution) {
  return {
    error: 'Entry changed elsewhere',
    current,
    conflicts: resolution.conflictingFields,
    clientChangedFields: resolution.clientChangedFields,
    serverChangedFields: resolution.serverChangedFields,
  };
}

// --- API Routes ---

app.get('/api/audit', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const events = await readAuditEvents(req.userId, limit);
    res.json(events);
  } catch (err) {
    console.error('Fetch audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

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
    const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : '';
    const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : '';
    const page = Number.parseInt(req.query.page, 10);
    const limit = Number.parseInt(req.query.limit, 10);

    const query = { userId: req.userId };
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = dateFrom;
      if (dateTo) query.date.$lte = dateTo;
    }

    const entryQuery = Entry.find(query).sort({ date: -1 }).lean();
    if (Number.isFinite(page) || Number.isFinite(limit)) {
      const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
      const safeLimit = Math.min(500, Math.max(1, Number.isFinite(limit) ? limit : 50));
      const [items, total] = await Promise.all([
        entryQuery.skip((safePage - 1) * safeLimit).limit(safeLimit),
        Entry.countDocuments(query),
      ]);
      return res.json({
        items,
        page: safePage,
        limit: safeLimit,
        total,
        hasMore: safePage * safeLimit < total,
      });
    }

    const entries = await entryQuery;
    res.json(entries);
  } catch (err) {
    console.error('Fetch entries error:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

app.post('/api/entries', requireAuth, async (req, res) => {
  try {
    const { result: entry } = await withOptionalTransaction(async (session) => {
      const settings = await getUserSettings(req.userId, session);
      const sanitizedEntry = sanitizeEntry(req.body, settings, { requireId: true });
      const [createdEntry] = await Entry.create([{ ...sanitizedEntry, userId: req.userId }], session ? { session } : undefined);
      await writeAuditEvent({
        userId: req.userId,
        entity: 'entry',
        action: 'create',
        after: cleanEntryForAudit(createdEntry.toObject()),
      }, session);
      return createdEntry;
    });
    notifyClients(req.userId, ['entries']);
    res.json(entry);
  } catch (err) {
    console.error('Add entry error:', err);
    res.status(getErrorStatus(err)).json({ error: err.message || 'Failed to add entry' });
  }
});

app.put('/api/entries/:id', requireAuth, async (req, res) => {
  try {
    const { previousState, ...updates } = req.body || {};
    const { result } = await withOptionalTransaction(async (session) => {
      const currentQuery = Entry.findOne({ id: req.params.id, userId: req.userId });
      if (session) currentQuery.session(session);
      const current = await currentQuery;
      if (!current) return { status: 404, body: { error: 'Entry not found' } };

      const settings = await getUserSettings(req.userId, session);
      const resolution = resolveEntryUpdate(current.toObject(), previousState, updates, settings);
      if (resolution.type === 'conflict') {
        return {
          status: 409,
          body: toConflictResponse(current.toObject(), resolution),
        };
      }

      current.set(resolution.entry);
      await current.save(session ? { session } : undefined);
      await writeAuditEvent({
        userId: req.userId,
        entity: 'entry',
        action: resolution.type === 'merged' ? 'merge' : 'update',
        before: cleanEntryForAudit(previousState || {}),
        after: cleanEntryForAudit(current.toObject()),
        meta: resolution.type === 'merged'
          ? {
              mergedFields: resolution.clientChangedFields,
              serverChangedFields: resolution.serverChangedFields,
            }
          : null,
      }, session);
      return { status: 200, body: current.toObject() };
    });

    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    notifyClients(req.userId, ['entries']);
    res.json(result.body);
  } catch (err) {
    console.error('Update entry error:', err);
    res.status(getErrorStatus(err)).json({ error: err.message || 'Failed to update entry' });
  }
});

app.delete('/api/entries/:id', requireAuth, async (req, res) => {
  try {
    const previousState = req.body?.previousState;
    const force = req.body?.force === true;
    const { result } = await withOptionalTransaction(async (session) => {
      const currentQuery = Entry.findOne({ id: req.params.id, userId: req.userId });
      if (session) currentQuery.session(session);
      const current = await currentQuery;
      if (!current) return { status: 404, body: { error: 'Entry not found' } };

      const currentObject = current.toObject();
      if (entriesConflict(currentObject, previousState) && !force) {
        return {
          status: 409,
          body: {
            error: 'Entry changed elsewhere',
            current: currentObject,
            conflicts: ['delete'],
          },
        };
      }

      await current.deleteOne(session ? { session } : undefined);
      await writeAuditEvent({
        userId: req.userId,
        entity: 'entry',
        action: force && entriesConflict(currentObject, previousState) ? 'force-delete' : 'delete',
        before: cleanEntryForAudit(currentObject),
      }, session);
      return { status: 200, body: { success: true } };
    });

    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    notifyClients(req.userId, ['entries']);
    res.json(result.body);
  } catch (err) {
    console.error('Delete entry error:', err);
    res.status(getErrorStatus(err)).json({ error: err.message || 'Failed to delete entry' });
  }
});

// Holidays
app.get('/api/holidays', requireAuth, async (req, res) => {
  try {
    const config = await Config.findOne({ userId: req.userId }).lean();
    try {
      await syncPhilippinePublicHolidays({
        userId: req.userId,
        years: getRequestedHolidaySyncYears(req, config),
        HolidayModel: Holiday,
      });
    } catch (syncErr) {
      console.error('Philippine holiday sync error:', syncErr);
    }

    const holidays = await Holiday.find({ userId: req.userId }).sort({ date: 1 }).lean();
    res.json(holidays);
  } catch (err) {
    console.error('Fetch holidays error:', err);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

app.post('/api/holidays', requireAuth, async (req, res) => {
  try {
    const { result } = await withOptionalTransaction(async (session) => {
      const sanitizedHoliday = sanitizeHoliday(req.body || {});
      const existingQuery = Holiday.findOne({ userId: req.userId, date: sanitizedHoliday.date });
      if (session) existingQuery.session(session);
      const existingHoliday = await existingQuery;
      if (existingHoliday) {
        return { status: 400, body: { error: 'A holiday or leave already exists for this date' } };
      }

      const [holiday] = await Holiday.create([{ ...sanitizedHoliday, userId: req.userId }], session ? { session } : undefined);
      await writeAuditEvent({
        userId: req.userId,
        entity: 'holiday',
        action: 'create',
        after: cleanHolidayForAudit(holiday.toObject()),
      }, session);
      return { status: 200, body: holiday.toObject() };
    });

    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    notifyClients(req.userId, ['holidays']);
    res.json(result.body);
  } catch (err) {
    console.error('Add holiday error:', err);
    res.status(getErrorStatus(err)).json({ error: err.message || 'Failed to add holiday' });
  }
});

app.put('/api/holidays/:date', requireAuth, async (req, res) => {
  try {
    const { result } = await withOptionalTransaction(async (session) => {
      const sanitizedHoliday = sanitizeHoliday({ ...req.body, date: req.params.date });
      const existingQuery = Holiday.findOne({ userId: req.userId, date: req.params.date });
      if (session) existingQuery.session(session);
      const existingHoliday = await existingQuery;
      const holiday = await Holiday.findOneAndUpdate(
        { userId: req.userId, date: req.params.date },
        { ...sanitizedHoliday, userId: req.userId },
        { new: true, upsert: true, session: session || undefined }
      );
      await writeAuditEvent({
        userId: req.userId,
        entity: 'holiday',
        action: existingHoliday ? 'update' : 'create',
        before: cleanHolidayForAudit(existingHoliday?.toObject()),
        after: cleanHolidayForAudit(holiday.toObject()),
      }, session);
      return { status: 200, body: holiday.toObject() };
    });

    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    notifyClients(req.userId, ['holidays']);
    res.json(result.body);
  } catch (err) {
    console.error('Update holiday error:', err);
    res.status(getErrorStatus(err)).json({ error: err.message || 'Failed to update holiday' });
  }
});

app.delete('/api/holidays/:date', requireAuth, async (req, res) => {
  try {
    const { result } = await withOptionalTransaction(async (session) => {
      const holiday = await Holiday.findOneAndDelete(
        { date: req.params.date, userId: req.userId },
        { session: session || undefined }
      );
      if (!holiday) return { status: 404, body: { error: 'Holiday not found' } };
      await writeAuditEvent({
        userId: req.userId,
        entity: 'holiday',
        action: 'delete',
        before: cleanHolidayForAudit(holiday.toObject()),
      }, session);
      return { status: 200, body: { success: true } };
    });

    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    notifyClients(req.userId, ['holidays']);
    res.json(result.body);
  } catch (err) {
    console.error('Delete holiday error:', err);
    res.status(getErrorStatus(err)).json({ error: err.message || 'Failed to delete holiday' });
  }
});

// Config (Profile, Settings, Theme)
app.get('/api/config', requireAuth, async (req, res) => {
  try {
    let config = await Config.findOne({ userId: req.userId }).lean();
    if (!config) {
      const created = new Config({ userId: req.userId });
      await created.save();
      config = created.toObject();
    }
    res.json(config);
  } catch (err) {
    console.error('Fetch config error:', err);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

app.put('/api/config', requireAuth, async (req, res) => {
  try {
    const { result } = await withOptionalTransaction(async (session) => {
      const previousQuery = Config.findOne({ userId: req.userId });
      if (session) previousQuery.session(session);
      const previousConfig = await previousQuery.lean();
      const config = await Config.findOneAndUpdate(
        { userId: req.userId },
        req.body,
        { new: true, upsert: true, session: session || undefined }
      );
      await writeAuditEvent({
        userId: req.userId,
        entity: 'config',
        action: 'update',
        before: cleanConfigForAudit(previousConfig),
        after: cleanConfigForAudit(config.toObject ? config.toObject() : config),
      }, session);
      return { status: 200, body: config.toObject ? config.toObject() : config };
    });

    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }
    notifyClients(req.userId, ['config']);
    res.json(result.body);
  } catch (err) {
    console.error('Update config error:', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Bulk Import
app.post('/api/import/preview', requireAuth, async (req, res) => {
  try {
    const sanitized = sanitizeImportPayload(req.body || {});
    const currentState = await getUserStateSnapshot(req.userId);
    res.json(buildImportPreview(sanitized, currentState));
  } catch (err) {
    res.status(400).json({ error: err.message || 'Invalid import payload' });
  }
});

app.post('/api/import', requireAuth, async (req, res) => {
  let backup = null;
  try {
    const userId = req.userId;
    const sanitized = sanitizeImportPayload(req.body || {});
    const importAfterState = {
      entries: sanitized.entries,
      holidays: sanitized.holidays,
      profile: sanitized.profile,
      settings: sanitized.settings,
      theme: sanitized.theme,
    };

    const { result, usedTransaction } = await withOptionalTransaction(async (session) => {
      const beforeState = await getUserStateSnapshot(userId, session);
      if (!session) backup = structuredClone(beforeState);

      await Promise.all([
        Entry.deleteMany({ userId }, session ? { session } : undefined),
        Holiday.deleteMany({ userId }, session ? { session } : undefined),
        Config.deleteMany({ userId }, session ? { session } : undefined),
      ]);

      if (sanitized.entries.length) {
        await Entry.insertMany(
          sanitized.entries.map(entry => ({ ...entry, userId })),
          session ? { session } : undefined
        );
      }

      if (sanitized.holidays.length) {
        await Holiday.insertMany(
          sanitized.holidays.map(holiday => ({ ...holiday, userId })),
          session ? { session } : undefined
        );
      }

      await Config.create([{
        userId,
        profile: sanitized.profile,
        settings: sanitized.settings,
        theme: sanitized.theme,
      }], session ? { session } : undefined);

      await writeAuditEvent({
        userId,
        entity: 'import',
        action: 'replace',
        before: beforeState,
        after: importAfterState,
        meta: { transactional: Boolean(session) },
      }, session);

      return {
        success: true,
        message: session
          ? 'Data imported successfully'
          : 'Data imported successfully (without Mongo transactions)',
      };
    });
    notifyClients(userId, ['entries', 'holidays', 'config']);
    res.json({ ...result, transactional: usedTransaction });
  } catch (err) {
    console.error('Import error:', err);
    if (backup) {
      try {
        await Promise.all([
          Entry.deleteMany({ userId: req.userId }),
          Holiday.deleteMany({ userId: req.userId }),
          Config.deleteMany({ userId: req.userId })
        ]);
        if (backup.entries?.length) await Entry.insertMany(backup.entries.map(entry => ({ ...entry, userId: req.userId })));
        if (backup.holidays?.length) await Holiday.insertMany(backup.holidays.map(holiday => ({ ...holiday, userId: req.userId })));
        await new Config({
          userId: req.userId,
          profile: backup.profile,
          settings: backup.settings,
          theme: backup.theme,
        }).save();
        await writeAuditEvent({
          userId: req.userId,
          entity: 'import',
          action: 'rollback',
          before: {
            error: err.message || 'Unknown import failure',
          },
          after: backup,
          meta: { restoredFromFallback: true },
        });
        notifyClients(req.userId, ['entries', 'holidays', 'config']);
      } catch (restoreErr) {
        console.error('Import rollback error:', restoreErr);
      }
    }
    if (isTransactionUnsupported(err)) {
      return res.status(500).json({ error: 'Mongo transactions are not available in this MongoDB setup. The app can still run, but bulk import atomicity is limited.' });
    }
    res.status(400).json({ error: 'Failed to import data: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
