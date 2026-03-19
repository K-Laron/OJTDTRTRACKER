import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Simple plain-text or lightweight hash for this use case
  createdAt: { type: Date, default: Date.now }
});

const entrySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  id: { type: String, required: true, unique: true },
  date: { type: String, required: true },
  amTimeIn: String,
  amTimeOut: String,
  pmTimeIn: String,
  pmTimeOut: String,
  hoursRendered: Number,
  overtimeHours: Number,
  lateMinutes: Number,
  undertimeMinutes: Number,
  remarks: String,
  activities: String,
  createdAt: { type: Date, default: Date.now }
});

const holidaySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: String, required: true },
  name: String,
  type: { type: String, enum: ['holiday', 'sick_leave', 'vacation_leave'] }
});

const configSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  key: { type: String, default: 'main' },
  profile: {
    name: String,
    department: String,
    school: String,
    supervisor: String,
    position: String,
    startDate: String
  },
  settings: {
    requiredHours: Number,
    breakDuration: Number,
    expectedTimeIn: String,
    expectedTimeOut: String,
    weeklyTarget: Number,
    autoBackup: String,
    lastBackupDate: Date,
    notificationsEnabled: Boolean,
    clockInReminder: String,
    clockOutReminder: String,
    timeFormat: String
  },
  theme: String
});

export const User = mongoose.model('User', userSchema);
export const Entry = mongoose.model('Entry', entrySchema);
export const Holiday = mongoose.model('Holiday', holidaySchema);
export const Config = mongoose.model('Config', configSchema);
