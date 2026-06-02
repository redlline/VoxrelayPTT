import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { sendToUser } from './ws.js';

// GET /api/v1/conversations — list user conversations
// POST /api/v1/conversations — create conversation
// GET /api/v1/conversations/:id — get conversation details
// POST /api/v1/conversations/:id/messages — send message
// GET /api/v1/conversations/:id/messages — get messages (paginated)
// POST /api/v1/conversations/:id/read — mark as read
// POST /api/v1/conversations/:id/members — add member (group only)
// DELETE /api/v1/conversations/:id/members/:userId — remove member (group only)

export async function messageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List conversations
  app.get('/conversations', async (request) => {
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const conversations = await sql`
      SELECT c.*,
        COALESCE(
          (SELECT row_to_json(m) FROM (
            SELECT m.id, m.content, m.type, m.created_at as "createdAt",
              m.sender_id as "senderId"
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
          ) m),
          NULL
        ) as last_message,
        COALESCE(
          (SELECT COUNT(*)::int FROM messages m
           WHERE m.conversation_id = c.id
           AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)
           AND m.sender_id != ${userId}
          ), 0
        ) as unread_count,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'userId', u.id, 'displayName', u.display_name, 'lastReadAt', cp2.last_read_at
          )) FROM conversation_participants cp2
          JOIN users u ON u.id = cp2.user_id
          WHERE cp2.conversation_id = c.id),
          '[]'::json
        ) as participants
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ${userId}
      ORDER BY COALESCE(
        (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
        c.created_at
      ) DESC
    `;

    const result = conversations.map((c: any) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      lastMessage: c.last_message ? {
        id: c.last_message.id,
        conversationId: c.id,
        senderId: c.last_message.senderId,
        content: c.last_message.content,
        type: c.last_message.type,
        metadata: c.last_message.metadata,
        createdAt: c.last_message.createdAt,
      } : null,
      unreadCount: c.unread_count,
      participants: c.participants || [],
    }));

    return { conversations: result };
  });

  // Create conversation
  app.post('/conversations', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const schema = z.object({
      type: z.enum(['direct', 'group']),
      name: z.string().min(1).max(100).optional(),
      memberIds: z.array(z.string()).min(1).max(100),
    });

    const body = schema.parse(request.body);

    // Resolve usernames to UUIDs
    const resolvedIds: string[] = [];
    for (const mid of body.memberIds) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mid);
      if (isUuid) {
        resolvedIds.push(mid);
      } else {
        const [user] = await sql`
          SELECT id FROM users WHERE display_name = ${mid} OR email = ${mid} LIMIT 1
        `;
        if (!user) {
          return reply.status(400).send({ error: `User not found: ${mid}` });
        }
        resolvedIds.push(user.id);
      }
    }

    const allMemberIds = [...new Set([userId, ...resolvedIds])];

    // For direct conversations, check if one already exists
    if (body.type === 'direct' && allMemberIds.length === 2) {
      const otherId = allMemberIds.find(id => id !== userId)!;
      const [existing] = await sql`
        SELECT c.id FROM conversations c
        WHERE c.type = 'direct'
          AND (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id = c.id) = 2
          AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = ${userId})
          AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = ${otherId})
        LIMIT 1
      `;

      if (existing) {
        const [conv] = await sql`SELECT * FROM conversations WHERE id = ${existing.id}`;
        return { conversation: conv };
      }
    }

    const [conversation] = await sql.begin(async (tx) => {
      const [c] = await tx`
        INSERT INTO conversations (type, name)
        VALUES (${body.type}, ${body.type === 'group' ? body.name || 'Group' : null})
        RETURNING *
      `;

      for (const mid of allMemberIds) {
        await tx`
          INSERT INTO conversation_participants (conversation_id, user_id, is_admin)
          VALUES (${c.id}, ${mid}, ${mid === userId})
        `;
      }

      return [c];
    });

    return reply.status(201).send({ conversation });
  });

  // Get conversation details
  app.get('/conversations/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT id FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;
    if (!member) return reply.status(403).send({ error: 'Not a participant' });

    const [conversation] = await sql`
      SELECT c.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'userId', u.id, 'displayName', u.display_name, 'avatarUrl', u.avatar_url,
            'lastReadAt', cp.last_read_at, 'isAdmin', cp.is_admin
          )) FROM conversation_participants cp
          JOIN users u ON u.id = cp.user_id
          WHERE cp.conversation_id = c.id),
          '[]'::json
        ) as participants
      FROM conversations c
      WHERE c.id = ${id}
    `;

    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    return { conversation };
  });

  // Send message
  app.post('/conversations/:id/messages', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string; displayName: string };
    const sql = getDb();

    const schema = z.object({
      content: z.string().min(1).max(5000),
      type: z.enum(['text', 'image', 'location', 'file', 'voice']).default('text'),
      metadata: z.record(z.any()).optional().nullable(),
    });
    const body = schema.parse(request.body);

    const [member] = await sql`
      SELECT id FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;
    if (!member) return reply.status(403).send({ error: 'Not a participant' });

    const [message] = await sql`
      INSERT INTO messages (conversation_id, sender_id, content, type, metadata)
      VALUES (${id}, ${userId}, ${body.content}, ${body.type}, ${body.metadata ? JSON.stringify(body.metadata) : null})
      RETURNING *
    `;

    await sql`
      UPDATE conversations SET updated_at = NOW() WHERE id = ${id}
    `;

    // Real-time broadcast via WS
    const msgPayload = {
      type: 'message.new',
      message: {
        id: message.id,
        conversationId: id,
        senderId: userId,
        content: body.content,
        messageType: body.type,
        metadata: body.metadata,
        createdAt: message.created_at,
        sender: {
          id: userId,
          displayName: (request.user as any).displayName || '',
        },
      },
    };

    const participants = await sql`
      SELECT user_id FROM conversation_participants WHERE conversation_id = ${id}
    `;
    for (const p of participants) {
      if (p.user_id !== userId) {
        sendToUser(p.user_id, msgPayload);
      }
    }

    // Normalize metadata — always return as object (never string)
    let respMetadata = message.metadata;
    if (typeof respMetadata === 'string') {
      try { respMetadata = JSON.parse(respMetadata); } catch { respMetadata = null; }
    }
    // Fallback to body metadata if DB returned null
    if (!respMetadata && body.metadata) respMetadata = body.metadata;

    return reply.status(201).send({
      message: {
        id: message.id,
        conversationId: id,
        senderId: userId,
        content: body.content,
        type: body.type,
        metadata: respMetadata,
        createdAt: message.created_at,
      },
    });
  });

  // Get messages (paginated, cursor-based)
  app.get('/conversations/:id/messages', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT id FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;
    if (!member) return reply.status(403).send({ error: 'Not a participant' });

    const querySchema = z.object({
      before: z.string().optional(),
      limit: z.coerce.number().max(100).default(50),
    });
    const query = querySchema.parse(request.query);

    let messages;
    if (query.before) {
      messages = await sql`
        SELECT m.*, u.display_name, u.avatar_url
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ${id} AND m.id < ${query.before}::uuid
        ORDER BY m.created_at DESC
        LIMIT ${query.limit + 1}
      `;
    } else {
      messages = await sql`
        SELECT m.*, u.display_name, u.avatar_url
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ${id}
        ORDER BY m.created_at DESC
        LIMIT ${query.limit + 1}
      `;
    }

    const hasMore = messages.length > query.limit;
    if (hasMore) messages = messages.slice(0, query.limit);

    return {
      messages: messages.map((m: any) => {
        // metadata may come back as string from DB driver — always parse it
        let metadata = m.metadata;
        if (typeof metadata === 'string') {
          try { metadata = JSON.parse(metadata); } catch { metadata = null; }
        }
        return {
          id: m.id,
          conversationId: id,
          senderId: m.sender_id,
          content: m.content,
          type: m.type,
          metadata,
          createdAt: m.created_at,
          sender: {
            id: m.sender_id,
            displayName: m.display_name,
            avatarUrl: m.avatar_url,
          },
        };
      }),
      hasMore,
      nextCursor: messages.length > 0 ? messages[messages.length - 1].id : null,
    };
  });

  // Mark conversation as read
  app.post('/conversations/:id/read', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT id FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;
    if (!member) return reply.status(403).send({ error: 'Not a participant' });

    await sql`
      UPDATE conversation_participants
      SET last_read_at = NOW()
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;

    // Notify other participants that user read messages
    const [updated] = await sql`
      SELECT last_read_at FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;

    const participants = await sql`
      SELECT user_id FROM conversation_participants WHERE conversation_id = ${id}
    `;
    for (const p of participants) {
      if (p.user_id !== userId) {
        sendToUser(p.user_id, {
          type: 'message.read',
          conversationId: id,
          userId,
          lastReadAt: updated.last_read_at,
        });
      }
    }

    return { success: true, lastReadAt: updated.last_read_at };
  });

  // Add member to group conversation
  app.post('/conversations/:id/members', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const schema = z.object({
      userId: z.string().uuid(),
      isAdmin: z.boolean().default(false),
    });
    const body = schema.parse(request.body);

    const [conversation] = await sql`
      SELECT type FROM conversations WHERE id = ${id}
    `;
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    if (conversation.type !== 'group') return reply.status(400).send({ error: 'Only group conversations support adding members' });

    const [requester] = await sql`
      SELECT is_admin FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;
    if (!requester || !requester.is_admin) return reply.status(403).send({ error: 'Only admins can add members' });

    const existing = await sql`
      SELECT id FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${body.userId}
    `;
    if (existing.length > 0) return reply.status(409).send({ error: 'Already a member' });

    await sql`
      INSERT INTO conversation_participants (conversation_id, user_id, is_admin)
      VALUES (${id}, ${body.userId}, ${body.isAdmin})
    `;

    // Notify new member
    sendToUser(body.userId, {
      type: 'conversation.added',
      conversationId: id,
    });

    return { success: true };
  });

  // Remove member from group conversation
  app.delete('/conversations/:id/members/:memberId', async (request, reply) => {
    const { id, memberId } = z
      .object({ id: z.string().uuid(), memberId: z.string().uuid() })
      .parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [conversation] = await sql`
      SELECT type FROM conversations WHERE id = ${id}
    `;
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    if (conversation.type !== 'group') return reply.status(400).send({ error: 'Only group conversations support removing members' });

    const [requester] = await sql`
      SELECT is_admin FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;
    if (!requester || !requester.is_admin) return reply.status(403).send({ error: 'Only admins can remove members' });

    await sql`
      DELETE FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${memberId}
    `;

    sendToUser(memberId, {
      type: 'conversation.removed',
      conversationId: id,
    });

    return { success: true };
  });

  // Typing indicator
  app.post('/conversations/:id/typing', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId, displayName } = request.user as { sub: string; displayName: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT id FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;
    if (!member) return reply.status(403).send({ error: 'Not a participant' });

    const participants = await sql`
      SELECT user_id FROM conversation_participants WHERE conversation_id = ${id}
    `;
    for (const p of participants) {
      if (p.user_id !== userId) {
        sendToUser(p.user_id, {
          type: 'typing',
          conversationId: id,
          userId,
          displayName,
        });
      }
    }

    return { success: true };
  });

  // Delete conversation (remove current user from participants)
  app.delete('/conversations/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: userId } = request.user as { sub: string };
    const sql = getDb();

    const [member] = await sql`
      SELECT id FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;
    if (!member) return reply.status(403).send({ error: 'Not a participant' });

    await sql`
      DELETE FROM conversation_participants
      WHERE conversation_id = ${id} AND user_id = ${userId}
    `;

    // Check if any participants remain; if none, remove the conversation entirely
    const remaining = await sql`
      SELECT COUNT(*)::int as cnt FROM conversation_participants
      WHERE conversation_id = ${id}
    `;
    if (remaining[0].cnt === 0) {
      await sql`DELETE FROM conversations WHERE id = ${id}::uuid`;
    }

    return { success: true };
  });
}
