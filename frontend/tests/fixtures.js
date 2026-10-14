/** Supply valid deterministic local records without seeding production data. */
export const user = {
  id: 'bdf27466-18c4-4b8d-9e83-10a44668c590',
  displayName: 'Jamie Writer',
  username: 'jamie',
  password: 'demo-only',
  role: 'user',
  createdAt: '2026-10-14T12:30:00.000Z',
};

export const session = {
  userId: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
};

export const post = {
  id: '8b1a849e-32e6-4d5a-87f1-3f99c5f0f135',
  title: 'A Small Beginning',
  content: 'First line\nSecond line',
  createdAt: '2026-10-14T12:30:00.000Z',
  authorId: user.id,
  authorName: user.displayName,
};

export const secondUser = {
  ...user,
  id: 'ef147466-18c4-4b8d-9e83-10a44668c590',
  username: 'robin',
  displayName: 'Robin Reader',
};

/** Return a post with a deterministic unique UUID and calendar date. */
export function makePost(number) {
  return {
    ...post,
    id: `8b1a849e-32e6-4d5a-87f1-${String(number).padStart(12, '0')}`,
    title: `Story ${number}`,
    createdAt: `2026-10-${String(number).padStart(2, '0')}T12:30:00.000Z`,
  };
}
