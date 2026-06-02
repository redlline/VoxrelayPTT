import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { getDb } from '../db/connection.js';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

function requireAdmin(request: any, reply: any): boolean {
  const { role } = request.user as { role: string };
  if (role !== 'admin') {
    void reply.status(403).send({ error: 'Admin access required' });
    return false;
  }
  return true;
}

function isValidDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase();
  return /^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(normalized);
}

function looksLikePem(value: string, label: string): boolean {
  return value.includes(`-----BEGIN ${label}-----`) && value.includes(`-----END ${label}-----`);
}

function looksLikePrivateKeyPem(value: string): boolean {
  const normalized = value.replace(/\r\n/g, '\n');
  return [
    ['-----BEGIN PRIVATE KEY-----', '-----END PRIVATE KEY-----'],
    ['-----BEGIN RSA PRIVATE KEY-----', '-----END RSA PRIVATE KEY-----'],
    ['-----BEGIN EC PRIVATE KEY-----', '-----END EC PRIVATE KEY-----'],
  ].some(([begin, end]) => normalized.includes(begin) && normalized.includes(end));
}

function normalizePem(value: string): string {
  return value.trim().replace(/\r\n/g, '\n') + '\n';
}

async function atomicWrite(filePath: string, data: string, mode?: number): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${Date.now()}`;
  await writeFile(tmp, data, mode ? { mode } : undefined);
  await rename(tmp, filePath);
}

function maskDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length < 2) return domain;
  const head = parts[0];
  if (head.length <= 2) return `**.${parts.slice(1).join('.')}`;
  return `${head.slice(0, 2)}***.${parts.slice(1).join('.')}`;
}

async function logAdminAction(
  request: any,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, ip_address)
    VALUES (
      ${(request.user as any).sub},
      ${action},
      ${entityType},
      ${entityId},
      ${JSON.stringify(metadata)}::jsonb,
      ${(request.ip || null)}
    )
  `;
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.addHook('preHandler', (request, reply, done) => {
    if (!requireAdmin(request, reply)) return;
    done();
  });

  app.get('/users', async (request) => {
    const query = z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().max(100).default(20),
      search: z.string().optional(),
      role: z.enum(['admin', 'dispatcher', 'user', 'listener']).optional(),
    }).parse(request.query);

    const sql = getDb();
    const offset = (query.page - 1) * query.limit;

    let conditions = sql`WHERE 1=1`;
    if (query.search) {
      conditions = sql`${conditions} AND (email ILIKE ${'%' + query.search + '%'} OR display_name ILIKE ${'%' + query.search + '%'})`;
    }
    if (query.role) {
      conditions = sql`${conditions} AND role = ${query.role}`;
    }

    const users = await sql`
      SELECT id, email, display_name, avatar_url, role, is_active, last_seen_at, created_at
      FROM users ${conditions}
      ORDER BY created_at DESC
      LIMIT ${query.limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql`SELECT COUNT(*)::int FROM users ${conditions}`;

    return { users, total: count, page: query.page, limit: query.limit };
  });

  app.post('/users', async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      displayName: z.string().min(2).max(100),
      role: z.enum(['admin', 'dispatcher', 'user', 'listener']).default('user'),
    }).parse(request.body);

    const sql = getDb();

    const existing = await sql`SELECT id FROM users WHERE email = ${body.email}`;
    if (existing.length > 0) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const [user] = await sql`
      INSERT INTO users (email, password_hash, display_name, role)
      VALUES (${body.email}, ${passwordHash}, ${body.displayName}, ${body.role})
      RETURNING id, email, display_name, role, is_active, created_at
    `;

    await logAdminAction(request, 'admin.user.created', 'user', user.id, {
      email: user.email,
      role: user.role,
      isActive: user.is_active,
    });

    return reply.status(201).send({ user });
  });

  app.patch('/users/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      email: z.string().email().optional(),
      password: z.string().min(8).optional(),
      displayName: z.string().min(2).max(100).optional(),
      role: z.enum(['admin', 'dispatcher', 'user', 'listener']).optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body);

    const sql = getDb();

    const fields: string[] = [];
    const values: any[] = [];

    if (body.email) {
      const existing = await sql`SELECT id FROM users WHERE email = ${body.email} AND id <> ${id}`;
      if (existing.length > 0) {
        return reply.status(409).send({ error: 'Email already registered' });
      }
      fields.push('email');
      values.push(body.email);
    }

    if (body.password) {
      const passwordHash = await bcrypt.hash(body.password, 12);
      fields.push('password_hash');
      values.push(passwordHash);
    }

    if (body.displayName) { fields.push('display_name'); values.push(body.displayName); }
    if (body.role) { fields.push('role'); values.push(body.role); }
    if (body.isActive !== undefined) { fields.push('is_active'); values.push(body.isActive); }

    if (fields.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const [user] = await sql.unsafe(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING id, email, display_name, role, is_active, last_seen_at, created_at`,
      [...values, id],
    );

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    await logAdminAction(request, 'admin.user.updated', 'user', id, {
      changedFields: fields,
      role: user.role,
      isActive: user.is_active,
    });

    return { user };
  });

  app.delete('/users/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { sub: requesterId } = request.user as { sub: string };
    const sql = getDb();

    if (id === requesterId) {
      return reply.status(400).send({ error: 'You cannot delete your own account' });
    }

    const [target] = await sql`SELECT id, role FROM users WHERE id = ${id}`;
    if (!target) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (target.role === 'admin') {
      const [{ count }] = await sql`SELECT COUNT(*)::int FROM users WHERE role = 'admin'`;
      if (count <= 1) {
        return reply.status(400).send({ error: 'Cannot delete last admin account' });
      }
    }

    await sql`DELETE FROM users WHERE id = ${id}`;
    await logAdminAction(request, 'admin.user.deleted', 'user', id, {
      deletedRole: target.role,
    });
    return { success: true };
  });

  app.get('/channels', async (request) => {
    const query = z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().max(100).default(20),
    }).parse(request.query);

    const sql = getDb();
    const offset = (query.page - 1) * query.limit;

    const channels = await sql`
      SELECT c.*,
        u.display_name as owner_name,
        (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count
      FROM channels c
      LEFT JOIN users u ON u.id = c.owner_id
      ORDER BY c.created_at DESC
      LIMIT ${query.limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql`SELECT COUNT(*)::int FROM channels`;

    return { channels, total: count, page: query.page, limit: query.limit };
  });

  app.delete('/channels/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const sql = getDb();

    const [existing] = await sql`SELECT id, name, type FROM channels WHERE id = ${id}`;
    if (!existing) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    await sql`DELETE FROM channels WHERE id = ${id}`;
    await logAdminAction(request, 'admin.channel.deleted', 'channel', id, {
      name: existing.name,
      type: existing.type,
    });
    return { success: true };
  });

  app.patch('/channels/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      type: z.enum(['public', 'private']).optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body);

    const sql = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) { fields.push('name'); values.push(body.name); }
    if (body.description !== undefined) { fields.push('description'); values.push(body.description); }
    if (body.type !== undefined) { fields.push('type'); values.push(body.type); }
    if (body.isActive !== undefined) { fields.push('is_active'); values.push(body.isActive); }

    if (fields.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const [channel] = await sql.unsafe(
      `UPDATE channels SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id],
    );

    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    await logAdminAction(request, 'admin.channel.updated', 'channel', id, {
      changedFields: fields,
      name: channel.name,
      type: channel.type,
      isActive: channel.is_active,
    });

    return { channel };
  });

  app.get('/audit-logs', async (request) => {
    const query = z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().max(100).default(50),
      userId: z.string().uuid().optional(),
      action: z.string().optional(),
    }).parse(request.query);

    const sql = getDb();
    const offset = (query.page - 1) * query.limit;

    let conditions = sql`WHERE 1=1`;
    if (query.userId) conditions = sql`${conditions} AND user_id = ${query.userId}`;
    if (query.action) conditions = sql`${conditions} AND action = ${query.action}`;

    const logs = await sql`
      SELECT al.*, u.display_name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ${conditions}
      ORDER BY al.created_at DESC
      LIMIT ${query.limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql`SELECT COUNT(*)::int FROM audit_logs ${conditions}`;

    return { logs, total: count, page: query.page, limit: query.limit };
  });

  app.get('/deployment/tls', async () => {
    const deployBase = process.env.DEPLOY_NGINX_DIR || '/opt/ptt/deploy/nginx';
    const certPath = process.env.TLS_CERT_PATH || path.join(deployBase, 'certs', 'fullchain.pem');
    const keyPath = process.env.TLS_KEY_PATH || path.join(deployBase, 'certs', 'privkey.pem');
    const settingsPath = process.env.DEPLOY_SETTINGS_PATH || path.join(deployBase, 'deployment-settings.json');
    let domain = '';
    let certExists = false;
    let keyExists = false;
    let certUpdatedAt: string | null = null;
    let keyUpdatedAt: string | null = null;

    try {
      const raw = await readFile(settingsPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed.domain === 'string') {
        domain = parsed.domain;
      }
    } catch {
      // settings are optional on first run
    }

    try {
      const certInfo = await stat(certPath);
      certExists = true;
      certUpdatedAt = certInfo.mtime.toISOString();
    } catch {
      certExists = false;
    }

    try {
      const keyInfo = await stat(keyPath);
      keyExists = true;
      keyUpdatedAt = keyInfo.mtime.toISOString();
    } catch {
      keyExists = false;
    }

    return {
      domain,
      certExists,
      keyExists,
      certUpdatedAt,
      keyUpdatedAt,
      canApplyFromApi: process.env.ADMIN_TLS_APPLY_ENABLED === 'true',
    };
  });

  app.post('/deployment/tls', async (request, reply) => {
    const body = z.object({
      domain: z.string().min(3),
      certificatePem: z.string().min(64),
      privateKeyPem: z.string().min(64),
      caBundlePem: z.string().optional(),
      applyNow: z.boolean().default(true),
    }).parse(request.body);

    const domain = body.domain.trim().toLowerCase();
    if (!isValidDomain(domain)) {
      return reply.status(400).send({ error: 'Invalid domain format' });
    }
    if (!looksLikePem(body.certificatePem, 'CERTIFICATE')) {
      return reply.status(400).send({ error: 'certificatePem is not a valid PEM certificate' });
    }
    if (!looksLikePrivateKeyPem(body.privateKeyPem)) {
      return reply.status(400).send({ error: 'privateKeyPem is not a valid PEM private key' });
    }
    if (body.caBundlePem && !looksLikePem(body.caBundlePem, 'CERTIFICATE')) {
      return reply.status(400).send({ error: 'caBundlePem must contain CERTIFICATE PEM blocks' });
    }

    const deployBase = process.env.DEPLOY_NGINX_DIR || '/opt/ptt/deploy/nginx';
    const certPath = process.env.TLS_CERT_PATH || path.join(deployBase, 'certs', 'fullchain.pem');
    const keyPath = process.env.TLS_KEY_PATH || path.join(deployBase, 'certs', 'privkey.pem');
    const caPath = process.env.TLS_CA_PATH || path.join(deployBase, 'certs', 'ca_bundle.pem');
    const settingsPath = process.env.DEPLOY_SETTINGS_PATH || path.join(deployBase, 'deployment-settings.json');
    const composeCwd = process.env.COMPOSE_PROJECT_DIR || '/opt/ptt';

    await atomicWrite(certPath, normalizePem(body.certificatePem));
    await atomicWrite(keyPath, normalizePem(body.privateKeyPem), 0o600);
    if (body.caBundlePem) {
      await atomicWrite(caPath, normalizePem(body.caBundlePem));
    }
    await atomicWrite(settingsPath, `${JSON.stringify({ domain, updatedAt: new Date().toISOString() }, null, 2)}\n`);

    const sql = getDb();
    await sql`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, ip_address)
      VALUES (
        ${(request.user as any).sub},
        ${'deployment.tls.updated'},
        ${'deployment'},
        ${null},
        ${JSON.stringify({ domain: maskDomain(domain), certUpdated: true, keyUpdated: true })}::jsonb,
        ${(request.ip || null)}
      )
    `;

    let applied = false;
    let applyOutput = '';
    if (body.applyNow) {
      if (process.env.ADMIN_TLS_APPLY_ENABLED !== 'true') {
        applyOutput = 'Auto-apply disabled. Set ADMIN_TLS_APPLY_ENABLED=true to enable nginx reload from API.';
      } else {
        const applyCommand = process.env.ADMIN_TLS_APPLY_COMMAND
          || 'docker compose exec -T web-gateway sh -lc "nginx -t && nginx -s reload"';
        try {
          const { stdout, stderr } = await execAsync(applyCommand, { cwd: composeCwd });
          applied = true;
          applyOutput = `${stdout || ''}${stderr || ''}`.trim();
        } catch (err: any) {
          const stdout = err?.stdout || '';
          const stderr = err?.stderr || '';
          applyOutput = `${stdout}${stderr}`.trim() || err?.message || 'Apply failed';
          return {
            success: true,
            domain,
            certPath,
            keyPath,
            applied: false,
            applyOutput: `TLS saved, but apply failed: ${applyOutput}`,
          };
        }
      }
    }

    return {
      success: true,
      domain,
      certPath,
      keyPath,
      applied,
      applyOutput,
    };
  });
}
