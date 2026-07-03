import { syncBuiltInTemplates } from './templates';

const mode = (process.argv.includes('--upsert') || process.env.SYNC_BUILTINS === 'upsert') ? 'upsert' : 'missing';
const result = await syncBuiltInTemplates(mode);
console.log(`Synced built-in soundtracks (${mode}). Inserted: ${result.inserted}. Updated: ${result.updated}. Total built-ins: ${result.total}. Revision: ${result.revision}.`);
