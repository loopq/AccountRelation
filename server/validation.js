import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const uuid = z.uuid();
const category = z.enum(['email', 'apple', 'ai']);
const text = (max) => z.string().max(max).nullable().optional();
const ref = uuid.nullable().optional();
const base64 = (s) => /^[A-Za-z0-9+/]+={0,2}$/.test(s) && Buffer.from(s, 'base64').toString('base64') === s;
export const salt = z.string().refine(s => base64(s) && Buffer.from(s, 'base64').length === 16);
export const cipher = z.string().max(24000).refine(s => {
  const parts = s.split(':');
  return parts.length === 3 && parts[0] === 'v2' && base64(parts[1]) && base64(parts[2])
    && Buffer.from(parts[1], 'base64').length === 12 && Buffer.from(parts[2], 'base64').length >= 16;
});
export const account = z.strictObject({
  category, platform_id: uuid, name: z.string().trim().min(1).max(300),
  encrypted_password: cipher.nullable().optional(), encrypted_2fa: cipher.nullable().optional(),
  phone: text(100), twofa_enabled: z.boolean().optional(), passkey_enabled: z.boolean().optional(), country_id: ref,
  register_email_id: ref, subscribe_apple_id: ref, note: text(10000), recovery_email: text(320),
  claude_status: z.enum(['fresh', 'registered', 'active', 'banned']).nullable().optional(),
  claude_registered_at: z.iso.date().nullable().optional(), claude_active_at: z.iso.date().nullable().optional(),
  claude_banned_at: z.iso.date().nullable().optional(),
  device_ids: z.array(uuid).max(100).optional(),
});
export const platform = z.strictObject({ category, name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), sort: z.number().int().min(0).max(100000).optional() });
export const country = z.strictObject({ name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), sort: z.number().int().min(0).max(100000).optional() });
export const device = z.strictObject({ name: z.string().trim().min(1).max(100),
  sort: z.number().int().min(0).max(100000).optional() });
export const change = z.strictObject({ expectedRevision: z.number().int().nonnegative(), expectedSalt: salt.nullable() });
export const initVault = z.strictObject({ salt, canary: cipher });
export const rotation = z.strictObject({ salt, canary: cipher,
  updates: z.array(z.strictObject({ id: uuid, ct: cipher.optional(), fa: cipher.optional() })).max(10000) });
export const login = z.strictObject({ email: z.email().max(320).transform(s => s.toLowerCase()), password: z.string().min(1).max(1024) });
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, '请求字段或格式不正确');
  return result.data;
}
