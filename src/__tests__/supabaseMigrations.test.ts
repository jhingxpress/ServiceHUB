/**
 * Repo hygiene: every file in supabase/migrations/ must use the
 * Supabase CLI timestamp naming convention (numeric version prefix,
 * e.g. <YYYYMMDDHHMMSS>_<name>.sql). Non-conforming files (review
 * scripts, test harnesses) break `supabase db push` / `migration up`
 * and must live elsewhere (e.g. supabase/review/).
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const MIGRATION_NAME = /^\d+_.+\.sql$/;

describe('supabase/migrations file naming', () => {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'));

  it('contains migration files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s follows the timestamp naming convention', (file) => {
    expect(file).toMatch(MIGRATION_NAME);
  });
});
