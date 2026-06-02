import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { getDb } from '../db/connection.js';
import { getRedis } from '../lib/redis.js';

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  // Strict rate limiting for auth endpoints
  const authRateLimit = {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  };

  app.post('/register', authRateLimit, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const sql = getDb();

    const existing = await sql`SELECT id FROM users WHERE email = ${body.email}`;
    if (existing.length > 0) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const [user] = await sql`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${body.email}, ${passwordHash}, ${body.displayName})
      RETURNING id, email, display_name, role, created_at
    `;

    const accessToken = app.jwt.sign(
      { sub: user.id, role: user.role, displayName: user.display_name },
      { expiresIn: '15m' },
    );

    const refreshToken = await generateRefreshToken(sql, user.id);
    setRefreshCookie(reply, refreshToken);

    return {
      user,
      accessToken,
    };
  });

  app.post('/login', authRateLimit, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const sql = getDb();

    const [user] = await sql`
      SELECT id, email, password_hash, display_name, role, is_active
      FROM users WHERE email = ${body.email}
    `;

    if (!user || !user.is_active) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    await sql`
      UPDATE users SET last_seen_at = NOW() WHERE id = ${user.id}
    `;

    const accessToken = app.jwt.sign(
      { sub: user.id, role: user.role, displayName: user.display_name },
      { expiresIn: '15m' },
    );

    const refreshToken = await generateRefreshToken(sql, user.id);
    setRefreshCookie(reply, refreshToken);

    const { password_hash, ...safeUser } = user;
    return { user: safeUser, accessToken };
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies.refreshToken;
    if (token) {
      const sql = getDb();
      const tokenId = token.split('.')[0];
      if (tokenId) {
        await sql`DELETE FROM refresh_tokens WHERE id = ${tokenId}`;
      }
    }
    reply.clearCookie('refreshToken', { path: '/' });
    return { success: true };
  });

  app.post('/refresh', async (request, reply) => {
    const token = request.cookies.refreshToken;
    if (!token) {
      return reply.status(401).send({ error: 'Refresh token required' });
    }

    const sql = getDb();
    const [tokenId, tokenSecret] = token.split('.');
    if (!tokenId || !tokenSecret) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    const [row] = await sql`
      SELECT rt.id, rt.user_id, rt.token_hash, rt.expires_at, u.role, u.is_active, u.display_name
      FROM refresh_tokens rt
      JOIN users u ON u.id = rt.user_id
      WHERE rt.id = ${tokenId}
        AND rt.expires_at > NOW()
    `;

    if (!row) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    const match = await bcrypt.compare(tokenSecret, row.token_hash);
    if (!match) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    if (!row.is_active) {
      return reply.status(401).send({ error: 'Account disabled' });
    }

    await sql`DELETE FROM refresh_tokens WHERE id = ${row.id}`;

    const accessToken = app.jwt.sign(
      { sub: row.user_id, role: row.role, displayName: row.display_name },
      { expiresIn: '15m' },
    );
    const newRefreshToken = await generateRefreshToken(sql, row.user_id);
    setRefreshCookie(reply, newRefreshToken);

    return { accessToken };
  });

  app.post('/forgot-password', async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    const sql = getDb();

    const [user] = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (user) {
      const redis = getRedis();
      const resetToken = crypto.randomUUID();
      await redis.setex(`reset:${resetToken}`, 3600, user.id);
      // TODO: Send email with reset link
    }

    return { message: 'If the email exists, a reset link has been sent' };
  });

  app.post('/reset-password', async (request, reply) => {
    const { token, password } = z
      .object({ token: z.string().uuid(), password: z.string().min(8) })
      .parse(request.body);

    const redis = getRedis();
    const userId = await redis.get(`reset:${token}`);

    if (!userId) {
      return reply.status(400).send({ error: 'Invalid or expired token' });
    }

    const sql = getDb();
    const passwordHash = await bcrypt.hash(password, 12);
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`;
    await redis.del(`reset:${token}`);

    return { message: 'Password updated successfully' };
  });

  app.get('/me', async (request) => {
    await request.jwtVerify();
    const { sub } = request.user as { sub: string };
    const sql = getDb();
    const [user] = await sql`
      SELECT id, email, display_name, avatar_url, role, is_active, last_seen_at, created_at
      FROM users WHERE id = ${sub}
    `;
    return { user };
  });
}

async function generateRefreshToken(sql: any, userId: string): Promise<string> {
  const tokenSecret = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await bcrypt.hash(tokenSecret, 10);
  const [row] = await sql`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, NOW() + INTERVAL '7 days')
    RETURNING id
  `;
  return `${row.id}.${tokenSecret}`;
}

function setRefreshCookie(reply: any, token: string) {
  reply.setCookie('refreshToken', token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60,
  });
}
