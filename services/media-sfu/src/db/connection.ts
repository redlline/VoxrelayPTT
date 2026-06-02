import postgres from 'postgres';

let sql: postgres.Sql<{}>;

export async function connectDb() {
  const dbPassword = process.env.DB_PASSWORD;
  if (!dbPassword) {
    throw new Error('DB_PASSWORD environment variable is required');
  }

  sql = postgres({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'voxrelay',
    username: process.env.DB_USER || 'voxrelay',
    password: dbPassword,
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
  });

  const [{ version }] = await sql`SELECT version()`;
  console.log(`Connected to PostgreSQL: ${version}`);
}

export function getDb() {
  if (!sql) throw new Error('Database not connected');
  return sql;
}

export async function closeDb() {
  if (sql) await sql.end();
}
