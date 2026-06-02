import { z } from 'zod';

export const emailSchema = z.string().email().max(255);
export const passwordSchema = z.string().min(8).max(128);
export const displayNameSchema = z.string().min(2).max(100);
export const uuidSchema = z.string().uuid();
export const channelNameSchema = z.string().min(1).max(100);
export const channelDescriptionSchema = z.string().max(500).default('');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string(),
});

export const createChannelSchema = z.object({
  name: channelNameSchema,
  description: channelDescriptionSchema,
  type: z.enum(['public', 'private']).default('public'),
});

export const updateUserSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const adminUpdateUserSchema = z.object({
  displayName: displayNameSchema.optional(),
  role: z.enum(['admin', 'dispatcher', 'user', 'listener']).optional(),
  isActive: z.boolean().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(100).default(20),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: passwordSchema,
});

// ----- Instant Messaging -----

export const createConversationSchema = z.object({
  type: z.enum(['direct', 'group']),
  name: z.string().min(1).max(100).optional(),
  memberIds: z.array(z.string().uuid()).min(1).max(100),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  type: z.enum(['text', 'image', 'location', 'file']).default('text'),
  metadata: z.record(z.any()).optional().nullable(),
});

export const addConversationMemberSchema = z.object({
  userId: z.string().uuid(),
  isAdmin: z.boolean().default(false),
});
