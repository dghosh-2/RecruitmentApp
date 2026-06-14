import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { HttpError } from '../utils/httpError.js';
import { signToken } from '../middleware/auth.js';

export type Preference = 'internship' | 'full_time' | 'both';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  preference: Preference;
  notify_email: number;
  created_at: string;
}

export interface PublicUser {
  id: number;
  email: string;
  preference: Preference;
  notifyEmail: boolean;
  createdAt: string;
}

function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    preference: row.preference,
    notifyEmail: row.notify_email === 1,
    createdAt: row.created_at,
  };
}

export function getUserById(id: number): PublicUser {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row) throw HttpError.notFound('User not found');
  return toPublic(row);
}

export function getUserRowById(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function register(email: string, password: string, preference: Preference) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) throw HttpError.conflict('An account with this email already exists');

  const hash = bcrypt.hashSync(password, 12);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, preference) VALUES (?, ?, ?)')
    .run(email.toLowerCase(), hash, preference);

  const user = getUserById(Number(info.lastInsertRowid));
  return { user, token: signToken({ id: user.id, email: user.email }) };
}

export function login(email: string, password: string) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as
    | UserRow
    | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw HttpError.unauthorized('Invalid email or password', 'BAD_CREDENTIALS');
  }
  return { user: toPublic(row), token: signToken({ id: row.id, email: row.email }) };
}

export function updateProfile(
  userId: number,
  updates: { preference?: Preference; notifyEmail?: boolean }
): PublicUser {
  if (updates.preference !== undefined) {
    db.prepare('UPDATE users SET preference = ? WHERE id = ?').run(updates.preference, userId);
  }
  if (updates.notifyEmail !== undefined) {
    db.prepare('UPDATE users SET notify_email = ? WHERE id = ?').run(
      updates.notifyEmail ? 1 : 0,
      userId
    );
  }
  return getUserById(userId);
}
