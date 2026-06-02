import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { broadcastToAll, broadcastToChannel, broadcastToDispatchers, sendToUser } from './ws.js';

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  type: z.enum(['public', 'private']).default('public'),
});

export async function channelRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request) => {
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const channels = await sql`
      SELECT c.*, cm.role as member_role,
        (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count
      FROM channels c
      LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ${userId}
      WHERE c.is_active = true
        AND (c.type = 'public' OR cm.user_id IS NOT NULL)
      ORDER BY c.name
    `;

    return { channels };
  });

  app.get('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const sql = getDb();

    const { sub: userId } = request.user as { sub: string };

    const [channel] = await sql`
      SELECT c.*,
        (SELECT json_agg(json_build_object(
          'id', u.id, 'displayName', u.display_name,
          'avatarUrl', u.avatar_url, 'role', cm.role,
          'isMuted', cm.is_muted
        )) FROM channel_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.channel_id = c.id) as members
      FROM channels c WHERE c.id = ${id} AND c.is_active = true
    `;

    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const [roleRow] = await sql`
      SELECT role FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${userId}
    `;

    const isDirectCall = channel.description === 'Direct call' || channel.description === 'Direct PTT call';

    return { channel: { ...channel, isDirectCall, currentUserRole: roleRow?.role || null } };
  });

  app.post('/', async (request, reply) => {
    const body = createChannelSchema.parse(request.body);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [channel] = await sql.begin(async (tx) => {
      const [c] = await tx`
        INSERT INTO channels (name, description, type, owner_id)
        VALUES (${body.name}, ${body.description}, ${body.type}, ${userId})
        RETURNING *
      `;

      await tx`
        INSERT INTO channel_members (channel_id, user_id, role)
        VALUES (${c.id}, ${userId}, 'owner')
      `;

      return [c];
    });

    return reply.status(201).send({ channel });
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      type: z.enum(['public', 'private']).optional(),
    }).parse(request.body);

    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT role FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${userId}
    `;

    if (!member || member.role !== 'owner') {
      return reply.status(403).send({ error: 'Only channel owner can update' });
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (body.name) { fields.push('name'); values.push(body.name); }
    if (body.description !== undefined) { fields.push('description'); values.push(body.description); }
    if (body.type) { fields.push('type'); values.push(body.type); }

    if (fields.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const [channel] = await sql.unsafe(
      `UPDATE channels SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id],
    );

    return { channel };
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT role FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${userId}
    `;

    if (!member || member.role !== 'owner') {
      return reply.status(403).send({ error: 'Only channel owner can delete' });
    }

    await sql`UPDATE channels SET is_active = false WHERE id = ${id}`;
    return { success: true };
  });

  app.post('/:id/join', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const existing = await sql`
      SELECT id FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${userId}
    `;

    if (existing.length > 0) {
      return reply.status(400).send({ error: 'Already a member' });
    }

    await sql`
      INSERT INTO channel_members (channel_id, user_id)
      VALUES (${id}, ${userId})
    `;

    return { success: true };
  });

  app.post('/:id/leave', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    await sql`
      DELETE FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${userId}
    `;

    return { success: true };
  });

  app.get('/:id/members', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const sql = getDb();

    const members = await sql`
      SELECT u.id, u.display_name, u.avatar_url, u.role as user_role,
             cm.role as member_role, cm.joined_at, cm.is_muted,
             u.last_seen_at
      FROM channel_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.channel_id = ${id}
      ORDER BY cm.joined_at
    `;

    return { members };
  });

  app.post('/:id/members', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      userId: z.string().uuid(),
      role: z.enum(['admin', 'member']).default('member'),
    }).parse(request.body);

    const { sub: requesterId, role: requesterRole } = request.user as { sub: string; role: string };
    const sql = getDb();

    const [requesterMember] = await sql`
      SELECT role FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${requesterId}
    `;

    const canManage = requesterRole === 'admin' || requesterMember?.role === 'owner' || requesterMember?.role === 'admin';
    if (!canManage) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const [channel] = await sql`
      SELECT id, is_active FROM channels
      WHERE id = ${id}
    `;
    if (!channel || !channel.is_active) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const [user] = await sql`
      SELECT id, display_name, email, is_active
      FROM users
      WHERE id = ${body.userId}
    `;
    if (!user || !user.is_active) {
      return reply.status(404).send({ error: 'User not found or inactive' });
    }

    const existing = await sql`
      SELECT id FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${body.userId}
    `;
    if (existing.length > 0) {
      return reply.status(409).send({ error: 'User is already a channel member' });
    }

    const [member] = await sql`
      INSERT INTO channel_members (channel_id, user_id, role)
      VALUES (${id}, ${body.userId}, ${body.role})
      RETURNING id, channel_id, user_id, role, joined_at
    `;

    return reply.status(201).send({
      member: {
        ...member,
        display_name: user.display_name,
        email: user.email,
      },
    });
  });

  app.delete('/:id/members/:userId', async (request, reply) => {
    const { id, userId } = z
      .object({ id: z.string().uuid(), userId: z.string().uuid() })
      .parse(request.params);

    const { sub: requesterId } = request.user as { sub: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT role FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${requesterId}
    `;

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const [targetMember] = await sql`
      SELECT role FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${userId}
    `;

    if (!targetMember) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    if (targetMember.role === 'owner') {
      return reply.status(403).send({ error: 'Cannot remove owner' });
    }

    await sql`
      DELETE FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${userId}
    `;

    broadcastToChannel(id, {
      type: 'channel.user_left',
      channelId: id,
      userId,
    });

    return { success: true };
  });

  app.patch('/:id/members/:userId/mute', async (request, reply) => {
    const { id, userId } = z
      .object({ id: z.string().uuid(), userId: z.string().uuid() })
      .parse(request.params);
    const body = z.object({ muted: z.boolean() }).parse(request.body);
    const { sub: requesterId, role: requesterRole } = request.user as { sub: string; role: string };
    const sql = getDb();

    const [requesterMember] = await sql`
      SELECT role FROM channel_members
      WHERE channel_id = ${id} AND user_id = ${requesterId}
    `;

    if (requesterRole !== 'admin' && (!requesterMember || (requesterMember.role !== 'owner' && requesterMember.role !== 'admin'))) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const [target] = await sql`
      SELECT cm.role, u.display_name FROM channel_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.channel_id = ${id} AND cm.user_id = ${userId}
    `;

    if (!target) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    if (target.role === 'owner') {
      return reply.status(403).send({ error: 'Cannot mute owner' });
    }

    await sql`
      UPDATE channel_members SET is_muted = ${body.muted}
      WHERE channel_id = ${id} AND user_id = ${userId}
    `;

    if (body.muted) {
      broadcastToChannel(id, {
        type: 'channel.user_muted',
        channelId: id,
        userId,
        displayName: target.display_name,
      });
    } else {
      broadcastToChannel(id, {
        type: 'channel.user_unmuted',
        channelId: id,
        userId,
        displayName: target.display_name,
      });
    }

    return { success: true, muted: body.muted };
  });

  // SOS alert
  app.post('/:id/sos', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ message: z.string().max(500).default('') }).parse(request.body || {});
    const { sub: userId, displayName } = request.user as { sub: string; displayName: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT cm.role, u.display_name
      FROM channel_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.channel_id = ${id} AND cm.user_id = ${userId}
    `;
    if (!member) return reply.status(403).send({ error: 'Not a channel member' });

    const [channel] = await sql`SELECT name FROM channels WHERE id = ${id}`;
    if (!channel) return reply.status(404).send({ error: 'Channel not found' });

    // Log SOS
    const [alert] = await sql`
      INSERT INTO sos_alerts (channel_id, user_id, message)
      VALUES (${id}, ${userId}, ${body.message})
      RETURNING id, created_at
    `;

    const sosEvent = {
      type: 'sos.alert',
      sosId: alert.id,
      channelId: id,
      channelName: channel.name,
      userId,
      displayName: member.display_name || displayName,
      message: body.message,
      createdAt: alert.created_at,
    };

    broadcastToAll(sosEvent);
    broadcastToChannel(id, sosEvent);
    broadcastToDispatchers(sosEvent);

    return reply.status(201).send({ sos: sosEvent });
  });

  // Resolve SOS
  app.post('/:id/sos/:sosId/resolve', async (request, reply) => {
    const { id, sosId } = z.object({ id: z.string().uuid(), sosId: z.string().uuid() }).parse(request.params);
    const { sub: userId, displayName } = request.user as { sub: string; displayName: string };
    const sql = getDb();

    const [alert] = await sql`
      UPDATE sos_alerts SET resolved_at = NOW(), resolved_by = ${userId}
      WHERE id = ${sosId} AND channel_id = ${id} AND resolved_at IS NULL
      RETURNING id
    `;

    if (!alert) return reply.status(404).send({ error: 'SOS alert not found or already resolved' });

    const resolveEvent = {
      type: 'sos.resolved',
      sosId,
      channelId: id,
      resolvedBy: userId,
      resolvedByName: displayName,
    };

    broadcastToChannel(id, resolveEvent);
    broadcastToDispatchers(resolveEvent);

    return { success: true, sosId };
  });

  // List active SOS alerts
  app.get('/:id/sos', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT id FROM channel_members WHERE channel_id = ${id} AND user_id = ${userId}
    `;
    if (!member) return reply.status(403).send({ error: 'Not a channel member' });

    const alerts = await sql`
      SELECT sa.*, u.display_name
      FROM sos_alerts sa
      JOIN users u ON u.id = sa.user_id
      WHERE sa.channel_id = ${id}
      ORDER BY sa.created_at DESC
      LIMIT 50
    `;

    return { sosAlerts: alerts };
  });

  // GPS — get channel member locations
  app.get('/:id/locations', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT id FROM channel_members WHERE channel_id = ${id} AND user_id = ${userId}
    `;
    if (!member) return reply.status(403).send({ error: 'Not a channel member' });

    const rows = await sql`
      SELECT ul.user_id, ul.latitude, ul.longitude, ul.accuracy, ul.updated_at,
             u.display_name
      FROM user_locations ul
      JOIN users u ON u.id = ul.user_id
      WHERE ul.channel_id = ${id}
        AND ul.updated_at > NOW() - INTERVAL '5 minutes'
      ORDER BY ul.updated_at DESC
    `;
    const locations = rows.map((r: any) => ({
      userId: r.user_id,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      accuracy: r.accuracy ? Number(r.accuracy) : null,
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      displayName: r.display_name,
    }));

    return { locations };
  });
}
