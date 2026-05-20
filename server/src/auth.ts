import crypto from 'node:crypto';

const secret = process.env.AUTH_SECRET ?? process.env.SESSION_SECRET ?? 'dev-session-secret-change-me';
const ttlSeconds = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 30);

type SessionPayload = { userId: string; email: string; exp: number };

function b64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

function sign(value: string) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function createToken(user: { id: string; email: string }) {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function readBearerToken(req: any) {
  const header = String(req.header('authorization') ?? '');
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return '';
}

export function verifyToken(token: string): SessionPayload | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  const got = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  if (!payload.userId || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => err ? reject(err) : resolve(derivedKey));
  });
  return `scrypt$${salt}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => err ? reject(err) : resolve(derivedKey));
  });
  const expected = Buffer.from(hash, 'base64url');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}
