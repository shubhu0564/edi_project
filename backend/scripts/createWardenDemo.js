/**
 * ResolveX — safe demo Warden account creator (STEP 7)
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │  STATUS: NOT RUN against any database as part of STEP 7.               │
 * │  Non-destructive: creates ONE warden account if it doesn't exist.     │
 * │  Does NOT wipe data (unlike config/seed.js) and does NOT touch any    │
 * │  existing account. Run it manually when you want to demo the Warden   │
 * │  dashboard.                                                           │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   node scripts/createWardenDemo.js
 *
 * Demo credentials created:
 *   warden@hostel.com / warden123   (role: warden)
 *
 * If an account with that email already exists it is left untouched and the
 * script reports its current role.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');

const DEMO = { name: 'Priya Nair', email: 'warden@hostel.com', password: 'warden123', role: 'warden' };

(async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Aborting.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB (db: ${mongoose.connection.name})`);

  const existing = await User.findOne({ email: DEMO.email });
  if (existing) {
    console.log(`User ${DEMO.email} already exists (role: ${existing.role}, active: ${existing.isActive}) — left unchanged.`);
  } else {
    const user = await User.create(DEMO); // password hashed by the User pre-save hook
    console.log(`Created demo warden: ${user.email} / ${DEMO.password}  (role: ${user.role})  _id=${user._id}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error('Failed:', err.message);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
