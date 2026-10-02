import pg from 'pg';

// "Developer mode" DB client — TS port of the identical local-db.mjs used across the rest of
// this platform (admin-dashboard-andrejkatin, consent-andrejkatin, rei40-andrejkatin,
// bigfive-andrejkatin — duplicated per this codebase family's established convention). A drop-in
// stand-in for @neondatabase/serverless's neon() when DB_MODE=local. Only the tagged-template
// call shape is used anywhere in this repo's own DB code (confirmed via grep), so that's all
// this needs to support. Typed loosely (matches neon's own callable-object shape closely enough
// for this codebase's actual usage) rather than fully replicating neon's exported type.
export function createLocalSql(connectionString: string) {
  const pool = new pg.Pool({ connectionString });

  async function sql(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
    const result = await pool.query(text, values as any[]);
    return result.rows;
  }
  sql.query = async (text: string, params: unknown[] = []) => (await pool.query(text, params as any[])).rows;
  return sql;
}
