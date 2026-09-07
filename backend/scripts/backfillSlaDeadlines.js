/**
 * ResolveX — SLA deadline backfill utility (STEP 3)
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │  STATUS: NOT RUN.                                                      │
 * │  This script has NOT been executed against any database.              │
 * │  It exists so missing SLA deadlines can be filled in later, on        │
 * │  explicit instruction. Running it is a manual, opt-in action.         │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * What it does:
 *   - Connects to MongoDB using the existing MONGO_URI from backend/.env
 *     (unchanged connection string, unchanged database name).
 *   - Finds Complaint documents where slaDeadline is null/missing.
 *   - Computes slaDeadline = createdAt + SLA hours (from the centralized
 *     SLA matrix via services/slaService), based on each complaint's priority.
 *   - In the default (dry-run) mode it only REPORTS what it would change.
 *   - It never deletes, resets, or seeds data. It only sets slaDeadline on
 *     documents that currently lack one.
 *
 * Usage (only when explicitly asked to run it):
 *   node scripts/backfillSlaDeadlines.js            # dry run — reports only
 *   node scripts/backfillSlaDeadlines.js --apply    # actually writes slaDeadline
 *
 * Safety notes:
 *   - Documents that already have an slaDeadline are left untouched.
 *   - Complaints with an unknown priority are skipped and listed, not guessed.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Complaint = require('../models/Complaint');
const { calculateDeadline, getSLAConfig } = require('../services/slaService');

const APPLY = process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB (db: ${mongoose.connection.name})`);
  console.log(APPLY ? 'MODE: APPLY (will write slaDeadline)' : 'MODE: DRY RUN (no writes)');

  const missing = await Complaint.find({
    $or: [{ slaDeadline: null }, { slaDeadline: { $exists: false } }]
  }).select('_id priority createdAt slaDeadline');

  console.log(`Complaints missing slaDeadline: ${missing.length}`);

  let updated = 0;
  const skipped = [];

  for (const c of missing) {
    try {
      getSLAConfig(c.priority); // validates priority
      const deadline = calculateDeadline(c.priority, c.createdAt);
      console.log(`  ${c._id} priority=${c.priority} createdAt=${c.createdAt.toISOString()} -> slaDeadline=${deadline.toISOString()}`);
      if (APPLY) {
        await Complaint.updateOne({ _id: c._id }, { $set: { slaDeadline: deadline } });
        updated += 1;
      }
    } catch (err) {
      skipped.push({ id: c._id.toString(), priority: c.priority, reason: err.message });
    }
  }

  if (skipped.length) {
    console.log(`Skipped ${skipped.length} complaint(s) with unresolvable priority:`);
    skipped.forEach(s => console.log(`  ${s.id} priority=${s.priority} — ${s.reason}`));
  }

  console.log(APPLY ? `Done. Updated ${updated} complaint(s).` : 'Dry run complete. No documents were modified.');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Backfill failed:', err.message);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
