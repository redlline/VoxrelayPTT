import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { getDb } from '../db/connection.js';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/users/search
  app.get('/search', async (request) => {
    const { q } = z.object({ q: z.string().min(1).max(100) }).parse(request.query);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const users = await sql`
      SELECT id, email, display_name, avatar_url, role
      FROM users
      WHERE (display_name ILIKE ${'%' + q + '%'} OR email ILIKE ${'%' + q + '%'})
        AND id != ${userId}::uuid
      LIMIT 20
    `;

    return { users };
  });

  app.get('/:id', async (request, reply) => {
    const params = request.params as any;
    const id = params.id as string;
    // Guard: if not a UUID (e.g. 'online', 'search') skip — handled by other routes
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(id)) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const sql = getDb();

    const [user] = await sql`
      SELECT id, email, display_name, avatar_url, role, is_active, last_seen_at, created_at
      FROM users WHERE id = ${id}
    `;

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return { user };
  });

  app.patch('/me', async (request, reply) => {
    const body = z.object({
      displayName: z.string().min(2).max(100).optional(),
      avatarUrl: z.string().url().optional().nullable(),
    }).parse(request.body);

    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const fields: string[] = [];
    const values: any[] = [];

    if (body.displayName) { fields.push('display_name'); values.push(body.displayName); }
    if (body.avatarUrl !== undefined) { fields.push('avatar_url'); values.push(body.avatarUrl); }

    if (fields.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const [user] = await sql.unsafe(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING id, email, display_name, avatar_url, role, is_active, last_seen_at, created_at`,
      [...values, userId],
    );

    return { user };
  });

  app.post('/change-password', async (request, reply) => {
    const body = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8).max(128),
    }).parse(request.body);

    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [user] = await sql`
      SELECT password_hash FROM users WHERE id = ${userId}
    `;

    const valid = await bcrypt.compare(body.currentPassword, user.password_hash);
    if (!valid) {
      return reply.status(400).send({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(body.newPassword, 12);
    await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${userId}`;

    return { success: true };
  });
}
