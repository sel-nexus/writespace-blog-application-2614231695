/** Verify pure role, ownership and protected-account predicates. */
import { describe, expect, it } from 'vitest';
import { canDeleteUser, canManagePost, homeRoute, isAdmin } from '../src/utils/permissions.js';
import { DEMO_ADMIN } from '../src/utils/storage.js';
import { post, secondUser, session, user } from './fixtures.js';

const invalidSessions = [undefined, null, {}, { userId: user.id }, { ...session, role: 'owner' },
  { ...session, role: '' }, { ...session, role: null }, { ...session, userId: '' }, { role: 'admin' },
  { ...session, userId: 7 }, { ...session, userId: ' ' }];

describe('permissions', () => {
  it('identifies both fixed and registered admins and ordinary user role homes', () => {
    const admin = { ...session, role: 'admin' };
    expect(isAdmin(DEMO_ADMIN)).toBe(true);
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(session)).toBe(false);
    expect(homeRoute(DEMO_ADMIN)).toBe('/admin');
    expect(homeRoute(admin)).toBe('/admin');
    expect(homeRoute(session)).toBe('/blogs');
  });
  it.each(invalidSessions)('fails closed across every predicate for invalid session %j', (identity) => {
    expect(isAdmin(identity)).toBe(false);
    expect(canManagePost(identity, post)).toBe(false);
    expect(canDeleteUser(identity, secondUser)).toBe(false);
    expect(homeRoute(identity)).toBe('/login');
  });
  it('permits owner or admin post management but not another ordinary writer', () => {
    expect(canManagePost(session, post)).toBe(true);
    expect(canManagePost(DEMO_ADMIN, post)).toBe(true);
    expect(canManagePost({ ...session, userId: secondUser.id }, post)).toBe(false);
    expect(canManagePost(session, { ...post, authorId: session.userId.toUpperCase() })).toBe(false);
  });
  it.each([undefined, null, {}, { authorId: '' }, { authorId: ' ' }, { authorId: 4 }])(
    'rejects absent or invalid post %j even for admin', (target) => {
      expect(canManagePost(DEMO_ADMIN, target)).toBe(false);
      expect(canManagePost(session, target)).toBe(false);
    },
  );
  it('permits admin deletion of another row but protects demo admin and self', () => {
    const admin = { ...session, role: 'admin' };
    expect(canDeleteUser(admin, secondUser)).toBe(true);
    expect(canDeleteUser(DEMO_ADMIN, user)).toBe(true);
    expect(canDeleteUser(admin, user)).toBe(false);
    expect(canDeleteUser(admin, { id: DEMO_ADMIN.userId })).toBe(false);
    expect(canDeleteUser(DEMO_ADMIN, { id: DEMO_ADMIN.userId })).toBe(false);
    expect(canDeleteUser(session, secondUser)).toBe(false);
  });
  it.each([undefined, null, {}, { id: '' }, { id: ' ' }, { id: 8 }])(
    'rejects invalid delete target %j', (target) => {
      expect(canDeleteUser(DEMO_ADMIN, target)).toBe(false);
    },
  );
});
