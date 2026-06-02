import { getDb } from './connection.js';
import bcrypt from 'bcrypt';

const DEFAULT_PASSWORD = 'admin123';

export async function seedDefaultData() {
  try {
    const sql = getDb();

    const [existing] = await sql`SELECT COUNT(*)::int as count FROM users`;
    if (existing.count > 0) return;

    console.log('Seeding default data...');

    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || DEFAULT_PASSWORD;
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await sql`
      INSERT INTO users (email, password_hash, display_name, role)
      VALUES ('admin@voxrelay.local', ${passwordHash}, 'Admin', 'admin')
    `;

    const channels = await sql`
      INSERT INTO channels (name, description, type)
      VALUES
        ('General', 'General discussion channel', 'public'),
        ('Emergency', 'Emergency broadcast channel', 'public'),
        ('Tech Support', 'Technical support channel', 'public')
      RETURNING id
    `;

    const [admin] = await sql`SELECT id FROM users WHERE email = 'admin@voxrelay.local'`;

    for (const ch of channels) {
      await sql`
        INSERT INTO channel_members (channel_id, user_id, role)
        VALUES (${ch.id}, ${admin.id}, 'owner')
      `;
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('  ✅ Default data seeded successfully'.padEnd(59) + '=');
    console.log('  Admin email:    admin@voxrelay.local');
    console.log(`  Admin password:  ${adminPassword}`);
    if (process.env.DEFAULT_ADMIN_PASSWORD && process.env.DEFAULT_ADMIN_PASSWORD !== DEFAULT_PASSWORD) {
      console.log('  ⚠️  Using DEFAULT_ADMIN_PASSWORD from environment');
    }
    console.log('='.repeat(60));
    console.log('');
  } catch (err) {
    console.error('Seed error (non-fatal):', err);
  }
}
