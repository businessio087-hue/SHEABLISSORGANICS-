import { ensureAccountSchema, closeAccountConnections } from '../server/accounts.mjs';

// Explicit release preparation only. Importing accounts.mjs and handling requests never runs DDL.
// DATABASE_URL points at the shared production database; run only with deployment approval.
try {
  const result = await ensureAccountSchema();
  console.log(result.applied ? 'SheaBliss account migration completed.' : 'SheaBliss account migration already completed; no changes made.');
} catch {
  console.error('SheaBliss account migration failed. Review database availability and account-schema compatibility; no completion was recorded for unfinished work.');
  process.exitCode = 1;
} finally {
  try { await closeAccountConnections(); } catch {
    console.error('Account database connections could not be cleanly closed.');
    process.exitCode = 1;
  }
}
