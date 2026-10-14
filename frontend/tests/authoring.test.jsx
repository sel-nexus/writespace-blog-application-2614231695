/** Verify authoring services, accessible fields, and route outcomes against real localStorage. */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../src/App.jsx';
import { PostForm } from '../src/components/PostForm.jsx';
import { STORAGE_WARNING } from '../src/components/Notice.jsx';
import WriteBlog from '../src/pages/WriteBlog.jsx';
import EditBlog from '../src/pages/EditBlog.jsx';
import { sessionForUser } from '../src/utils/auth.js';
import { createPost, editPost, readPost, readPosts } from '../src/utils/posts.js';
import { DEMO_ADMIN, POSTS_KEY, SESSION_KEY, USERS_KEY } from '../src/utils/storage.js';
import { validatePost } from '../src/utils/validation.js';
import { makePost, post, secondUser, session, user } from './fixtures.js';

const input = { title: '  Revised title  ', content: ' \nFirst revised line\n\n  Second revised line  \n' };
const text = { title: 'Revised title', content: 'First revised line\n\n  Second revised line' };
const generatedId = 'ac147466-18c4-4b8d-9e83-10a44668c590';
const generatedTime = '2026-11-01T10:20:30.000Z';
const corruptPosts = [
  ['{broken', 'invalid-json'],
  ['{}', 'invalid-shape'],
  [JSON.stringify([{ ...post, content: '' }]), 'invalid-record'],
  [JSON.stringify([post, post]), 'invalid-record'],
];

/**
 * Seed valid records into actual browser storage.
 * Args:
 *   posts: Initial full post array.
 *   identity: Active identity or null.
 *   users: Registered identities.
 * Returns:
 *   Nothing; assertions read storage afresh after actions.
 */
function seed(posts = [post], identity = session, users = [user, secondUser]) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  if (identity) localStorage.setItem(SESSION_KEY, JSON.stringify(identity));
  else localStorage.removeItem(SESSION_KEY);
}

/** Render the real shell at one initial route, leaving subsequent navigation to controls. */
function renderApp(path) {
  window.history.replaceState({}, '', path);
  return render(<App />);
}

/** Inject a single-key storage read exception while keeping every other read real. */
function failRead(blockedKey) {
  const original = Storage.prototype.getItem;
  return vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
    if (key === blockedKey) throw new DOMException('Blocked', 'SecurityError');
    return original.call(this, key);
  });
}

/** Inject a browser write failure without replacing application persistence helpers. */
function failWrite(name) {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Blocked', name);
  });
}

/** Make generated identity/time deterministic without changing application behavior. */
function deterministicGeneration() {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(generatedId);
  vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(generatedTime);
}

/** Render an editor in isolation to inspect read failures not swallowed by the existing route guard. */
function renderEditor(kind) {
  const path = kind === 'create' ? '/write' : `/edit/${post.id}`;
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/write" element={<WriteBlog />} />
        <Route path="/edit/:id" element={<EditBlog />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Replace text through user-visible controls. */
async function fillForm(actor, title = input.title, content = input.content) {
  await actor.clear(screen.getByRole('textbox', { name: 'Title' }));
  await actor.type(screen.getByRole('textbox', { name: 'Title' }), title);
  await actor.clear(screen.getByRole('textbox', { name: 'Content' }));
  await actor.type(screen.getByRole('textbox', { name: 'Content' }), content);
}

for (const kind of ['create', 'edit']) {
  describe(`${kind} post service`, () => {
    const mutate = (form = input, identity = session) => kind === 'create'
      ? createPost(form, identity) : editPost(post.id, form, identity);

    it.each([undefined, null, 3, false, [], {}, { title: ' ', content: '\n' }].map((value) => [value]))(
      'validates invalid whole input %j before any storage access', (form) => {
        seed();
        const raw = localStorage.getItem(POSTS_KEY);
        const blocked = failRead(POSTS_KEY);
        const expectedErrors = { title: 'Title is required.', content: 'Content is required.' };
        expect(validatePost(form)).toEqual(expectedErrors);
        // Pass undefined directly rather than using the helper's default argument.
        const result = kind === 'create' ? createPost(form, session) : editPost(post.id, form, session);
        expect(result).toEqual({ ok: false, code: 'validation', errors: expectedErrors });
        blocked.mockRestore();
        expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
        expect(readPosts().value).toEqual([post]);
      },
    );

    it.each(['title', 'content'].flatMap((field) => [undefined, null, 1, false, {}, [], '', ' \n '].map((value) => [field, value])))(
      'rejects required %s value %j without changing stored records', (field, value) => {
        seed();
        const form = { ...input, [field]: value };
        const errors = { [field]: `${field === 'title' ? 'Title' : 'Content'} is required.` };
        expect(validatePost(form)).toEqual(errors);
        expect(mutate(form)).toEqual({ ok: false, code: 'validation', errors });
        expect(readPosts().value).toEqual([post]);
      },
    );

    it.each(['owner', 'fixed admin', 'registered admin'])(
      'persists full fresh collection for %s and ignores forged immutable fields', (role) => {
        const admin = { ...secondUser, role: 'admin' };
        const identity = role === 'owner' ? session : role === 'fixed admin' ? DEMO_ADMIN : sessionForUser(admin);
        seed([post], identity, [user, admin]);
        deterministicGeneration();
        const fresh = makePost(20);
        localStorage.setItem(POSTS_KEY, JSON.stringify([post, fresh]));
        const result = mutate({ ...input, id: 'forged', createdAt: 'bad', authorId: 'forged', authorName: 'Forged' }, identity);
        const expected = kind === 'create'
          ? { id: generatedId, createdAt: generatedTime, authorId: identity.userId, authorName: identity.displayName, ...text }
          : { ...post, ...text };
        expect(result).toEqual({ ok: true, value: expected });
        expect(readPost(expected.id).value).toEqual(expected);
        expect(JSON.parse(localStorage.getItem(POSTS_KEY))).toEqual(kind === 'create' ? [expected, post, fresh] : [expected, fresh]);
        expect(JSON.parse(localStorage.getItem(USERS_KEY))).toEqual([user, admin]);
        expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(identity);
      },
    );

    it('stores a large plain-text payload and preserves interior line breaks without interpreting markup', () => {
      seed();
      const form = { title: '<script>not executable</script>', content: `\n${'x'.repeat(10000)}\n  middle\nend\n` };
      const result = mutate(form);
      expect(result.ok).toBe(true);
      expect(readPost(result.value.id).value.content).toBe(form.content.trim());
      expect(readPost(result.value.id).value.title).toBe(form.title);
    });

    it.each(corruptPosts)('preserves corrupt post source %s with %s', (raw, code) => {
      seed();
      localStorage.setItem(POSTS_KEY, raw);
      expect(mutate()).toEqual({ ok: false, code, readFailed: true });
      expect(readPosts()).toEqual({ ok: false, value: [], code });
      expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
    });

    it.each([POSTS_KEY, USERS_KEY, SESSION_KEY])('fails closed when fresh %s read throws', (key) => {
      seed();
      const blocked = failRead(key);
      expect(mutate()).toEqual({ ok: false, code: 'storage-unavailable', readFailed: true });
      blocked.mockRestore();
      expect(readPosts().value).toEqual([post]);
      expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(session);
      expect(JSON.parse(localStorage.getItem(USERS_KEY))).toEqual([user, secondUser]);
    });

    it.each(['{broken', '{}', JSON.stringify([{ ...user, role: 'unknown' }])])(
      'refuses unreadable registered collection %s even for fixed admin', (raw) => {
        seed([post], DEMO_ADMIN);
        localStorage.setItem(USERS_KEY, raw);
        expect(mutate(input, DEMO_ADMIN)).toMatchObject({ ok: false, readFailed: true });
        expect(readPosts().value).toEqual([post]);
        expect(localStorage.getItem(USERS_KEY)).toBe(raw);
      },
    );

    it.each(['userId', 'username', 'displayName', 'role'])(
      'rejects supplied identity whose %s no longer matches', (field) => {
        seed();
        expect(mutate(input, { ...session, [field]: 'changed' })).toEqual({ ok: false, code: 'unauthorized' });
        expect(readPosts().value).toEqual([post]);
      },
    );

    it.each(['missing active', 'missing supplied', 'changed active'])(
      'rejects %s session without saving', (state) => {
        const other = sessionForUser(secondUser);
        seed([post], state === 'missing active' ? null : state === 'changed active' ? other : session);
        expect(mutate(input, state === 'missing supplied' ? null : session)).toEqual({ ok: false, code: 'unauthorized' });
        expect(readPosts().value).toEqual([post]);
      },
    );

    it.each([['{broken', 'invalid-json'], ['{}', 'invalid-shape']])(
      'rejects malformed active session %s and never mutates posts', (raw, code) => {
        seed();
        localStorage.setItem(SESSION_KEY, raw);
        expect(mutate()).toEqual({ ok: false, code, readFailed: true });
        expect(readPosts().value).toEqual([post]);
        expect(localStorage.getItem(SESSION_KEY)).toBeNull();
      },
    );

    it.each(['deleted', 'username', 'displayName', 'role'])(
      'fails closed when current account is stale: %s', (change) => {
        const users = change === 'deleted' ? [] : [{ ...user, [change]: change === 'role' ? 'admin' : 'changed' }];
        seed([post], session, users);
        expect(mutate()).toEqual({ ok: false, code: 'invalid-shape', readFailed: true });
        expect(readPosts().value).toEqual([post]);
        expect(localStorage.getItem(SESSION_KEY)).toBeNull();
      },
    );

    it('rejects deleted identity even when best-effort session clearing throws', () => {
      seed([post], session, []);
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('', 'SecurityError'); });
      expect(mutate()).toEqual({ ok: false, code: 'invalid-shape', readFailed: true });
      expect(readPosts().value).toEqual([post]);
      expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(session);
    });

    it.each([['QuotaExceededError', 'quota-exceeded'], ['SecurityError', 'storage-unavailable']])(
      'returns %s failed write without exposing an unsaved post', (name, code) => {
        seed();
        failWrite(name);
        expect(mutate()).toEqual({ ok: false, code });
        expect(readPost(post.id).value).toEqual(post);
        expect(readPosts().value).toEqual([post]);
      },
    );

    it('reports serialization failure and leaves the complete collection unchanged', () => {
      seed();
      vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new TypeError('Serialization failed'); });
      expect(mutate()).toEqual({ ok: false, code: 'serialization-failed' });
      expect(readPosts().value).toEqual([post]);
    });
  });
}

describe('create-specific contracts', () => {
  it.each(['missing', 'empty'])('creates in a valid %s collection with fresh attribution', (state) => {
    seed([]);
    if (state === 'missing') localStorage.removeItem(POSTS_KEY);
    deterministicGeneration();
    const expected = { id: generatedId, createdAt: generatedTime, authorId: user.id, authorName: user.displayName, ...text };
    expect(createPost(input, session)).toEqual({ ok: true, value: expected });
    expect(readPosts().value).toEqual([expected]);
  });

  it('accepts a different current writer and derives their attribution, not the existing author', () => {
    const other = sessionForUser(secondUser);
    seed([post], other);
    const result = createPost(input, other);
    expect(result.ok).toBe(true);
    expect(readPost(result.value.id).value).toMatchObject({ authorId: secondUser.id, authorName: secondUser.displayName });
    expect(readPost(post.id).value).toEqual(post);
  });

  it.each(['UUID', 'timestamp'])('catches %s generation exception without persisting', (boundary) => {
    seed();
    const fail = () => { throw new Error('Unavailable'); };
    if (boundary === 'UUID') vi.spyOn(crypto, 'randomUUID').mockImplementation(fail);
    else vi.spyOn(Date.prototype, 'toISOString').mockImplementation(fail);
    expect(createPost(input, session)).toEqual({ ok: false, code: 'identity-unavailable' });
    expect(readPosts().value).toEqual([post]);
  });

  it.each([['duplicate', post.id], ['invalid UUID', 'bad']])('rejects generated %s at the storage boundary', (_, id) => {
    seed();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(id);
    expect(createPost(input, session)).toEqual({ ok: false, code: 'invalid-shape' });
    expect(readPosts().value).toEqual([post]);
  });
});

describe('edit-specific contracts', () => {
  it.each([undefined, null, 8, {}, [], '', 'missing', post.id.toUpperCase()].map((id) => [id]))(
    'uses exact lookup and refuses unknown ID %j', (id) => {
      seed();
      expect(editPost(id, input, session)).toEqual({ ok: false, code: 'not-found' });
      expect(readPosts().value).toEqual([post]);
    },
  );

  it('reports not-found for missing collection without creating one', () => {
    seed([]);
    localStorage.removeItem(POSTS_KEY);
    expect(editPost(post.id, input, session)).toEqual({ ok: false, code: 'not-found' });
    expect(readPosts()).toEqual({ ok: true, value: [], source: 'missing' });
  });

  it('validates fields first even when the target is missing', () => {
    seed();
    expect(editPost('missing', {}, session)).toEqual({
      ok: false, code: 'validation', errors: { title: 'Title is required.', content: 'Content is required.' },
    });
    expect(readPosts().value).toEqual([post]);
  });

  it('rejects another current writer without changing authorship or text', () => {
    const other = sessionForUser(secondUser);
    seed([post], other);
    expect(editPost(post.id, input, other)).toEqual({ ok: false, code: 'unauthorized' });
    expect(readPosts().value).toEqual([post]);
  });

  it('preserves fresh immutable fields even if they changed after the caller loaded the editor', () => {
    seed();
    const current = { ...post, createdAt: secondUser.createdAt, authorName: 'Historical author', extra: 'keep' };
    localStorage.setItem(POSTS_KEY, JSON.stringify([current, makePost(12)]));
    expect(editPost(post.id, input, session)).toEqual({ ok: true, value: { ...current, ...text } });
    expect(readPost(post.id).value).toEqual({ ...current, ...text });
    expect(readPost(makePost(12).id).value).toEqual(makePost(12));
  });
});

describe('PostForm presentation', () => {
  it('shows initial values, required associations, count, min-height and responsive actions without render callbacks', async () => {
    const actor = userEvent.setup();
    const submit = vi.fn(() => ({ ok: true }));
    const cancel = vi.fn();
    render(<PostForm initial={post} onSubmit={submit} onCancel={cancel} />);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(post.title);
    const content = screen.getByRole('textbox', { name: 'Content' });
    expect(content).toHaveValue(post.content);
    expect(content).toHaveClass('min-h-64');
    expect(content).toHaveAttribute('aria-required', 'true');
    expect(content).toHaveAttribute('aria-invalid', 'false');
    expect(content).toHaveAccessibleDescription(`${post.content.length} characters`);
    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass('flex-col', 'md:flex-row');
    expect(submit).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    await actor.type(content, '\nmore');
    expect(screen.getByRole('status')).toHaveTextContent(`${post.content.length + 5} characters`);
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).toHaveBeenCalledWith({ title: post.title, content: `${post.content}\nmore` });
    await actor.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
  });

  it('blocks blank fields with associated errors and submits only after both are corrected', async () => {
    const actor = userEvent.setup();
    const submit = vi.fn(() => ({ ok: true }));
    render(<PostForm onSubmit={submit} onCancel={() => {}} />);
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    for (const label of ['Title', 'Content']) {
      expect(screen.getByRole('textbox', { name: label })).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('textbox', { name: label })).toHaveAccessibleDescription(new RegExp(`${label} is required.`));
    }
    expect(submit).not.toHaveBeenCalled();
    await actor.type(screen.getByRole('textbox', { name: 'Title' }), 'title');
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByText('Title is required.')).not.toBeInTheDocument();
    expect(screen.getByText('Content is required.')).toBeInTheDocument();
    await actor.type(screen.getByRole('textbox', { name: 'Content' }), 'body');
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).toHaveBeenCalledWith({ title: 'title', content: 'body' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders callback field errors while keeping initial and entered values', async () => {
    const actor = userEvent.setup();
    render(
      <PostForm
        initial={post}
        onSubmit={() => ({ ok: false, code: 'validation', errors: { title: 'Please revise title.' } })}
        onCancel={() => {}}
      />,
    );
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAccessibleDescription('Please revise title.');
    expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue(post.content);
  });

  it('disabled form rejects even forced submission but leaves cancel available without validation', async () => {
    const actor = userEvent.setup();
    const submit = vi.fn();
    const cancel = vi.fn();
    render(<PostForm initial={post} onSubmit={submit} onCancel={cancel} disabled />);
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Content' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form'));
    expect(submit).not.toHaveBeenCalled();
    await actor.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });

  it('cancels a blank enabled form without submitting or producing field errors', async () => {
    const actor = userEvent.setup();
    const submit = vi.fn();
    const cancel = vi.fn();
    render(<PostForm onSubmit={submit} onCancel={cancel} />);
    await actor.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('authoring pages and real route map', () => {
  it('creates on Save then navigates to persisted detail with session attribution', async () => {
    seed([]);
    deterministicGeneration();
    const actor = userEvent.setup();
    renderApp('/write');
    expect(screen.getByRole('heading', { name: 'Write a post' })).toBeInTheDocument();
    expect(readPosts().value).toEqual([]);
    expect(window.location.pathname).toBe('/write');
    await fillForm(actor);
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    expect(window.location.pathname).toBe(`/blog/${generatedId}`);
    expect(screen.getByRole('heading', { name: text.title })).toBeInTheDocument();
    expect(readPost(generatedId).value).toEqual({
      id: generatedId, createdAt: generatedTime, authorId: user.id, authorName: user.displayName, ...text,
    });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(session);
  });

  it.each(['owner', 'fixed admin', 'registered admin'])('prefills and edits as %s with immutable attribution/time', async (role) => {
    const admin = { ...secondUser, role: 'admin' };
    const identity = role === 'owner' ? session : role === 'fixed admin' ? DEMO_ADMIN : sessionForUser(admin);
    seed([post], identity, [user, admin]);
    const actor = userEvent.setup();
    renderApp(`/edit/${post.id}`);
    expect(screen.getByRole('heading', { name: 'Edit post' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(post.title);
    expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue(post.content);
    expect(readPost(post.id).value).toEqual(post);
    await fillForm(actor);
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    expect(window.location.pathname).toBe(`/blog/${post.id}`);
    expect(screen.getByRole('heading', { name: text.title })).toBeInTheDocument();
    expect(readPost(post.id).value).toEqual({ ...post, ...text });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual(identity);
  });

  it.each(['create', 'edit'])('cancel %s discards entered text with no storage write and the correct route', async (kind) => {
    seed();
    const before = localStorage.getItem(POSTS_KEY);
    const actor = userEvent.setup();
    renderApp(kind === 'create' ? '/write' : `/edit/${post.id}`);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    await fillForm(actor);
    await actor.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(window.location.pathname).toBe(kind === 'create' ? '/blogs' : `/blog/${post.id}`);
    expect(localStorage.getItem(POSTS_KEY)).toBe(before);
    expect(readPost(post.id).value).toEqual(post);
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(['/write', `/edit/${post.id}`])('guest direct entry %s uses the existing login guard without saving', (path) => {
    seed([post], null);
    renderApp(path);
    expect(window.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(readPosts().value).toEqual([post]);
  });

  it('redirects another writer entering an exact edit route to blogs without saving', () => {
    seed([post], sessionForUser(secondUser));
    renderApp(`/edit/${post.id}`);
    expect(window.location.pathname).toBe('/blogs');
    expect(screen.getByRole('heading', { name: 'All Blogs' })).toBeInTheDocument();
    expect(readPosts().value).toEqual([post]);
  });

  it('renders exact missing-post heading and safe back link, not an editable empty form', async () => {
    seed();
    const actor = userEvent.setup();
    renderApp('/edit/missing');
    expect(screen.getByRole('heading', { name: 'Post not found', exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    await actor.click(screen.getByRole('link', { name: 'Back to All Blogs' }));
    expect(window.location.pathname).toBe('/blogs');
    expect(readPosts().value).toEqual([post]);
  });

  it.each(['create', 'edit'].flatMap((kind) => ['QuotaExceededError', 'SecurityError', 'serialization'].map((failure) => [kind, failure])))(
    'keeps %s unsaved values and route after %s failure', async (kind, failure) => {
      seed();
      const actor = userEvent.setup();
      const path = kind === 'create' ? '/write' : `/edit/${post.id}`;
      renderApp(path);
      await fillForm(actor);
      if (failure === 'serialization') {
        const original = JSON.stringify;
        vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
          if (Array.isArray(value) && value.some((record) => record?.authorId)) throw new TypeError('Blocked');
          return original(value, ...args);
        });
      } else failWrite(failure);
      await actor.click(screen.getByRole('button', { name: 'Save' }));
      expect(window.location.pathname).toBe(path);
      expect(screen.getByRole('alert')).toHaveTextContent('Post could not be saved. Nothing was saved.');
      expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(input.title);
      expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue(input.content);
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
      expect(readPosts().value).toEqual([post]);
    },
  );

  it.each(['create', 'edit'].flatMap((kind) => [POSTS_KEY, USERS_KEY, SESSION_KEY].map((key) => [kind, key])))(
    'shows Notice and disables %s editor on mount when %s cannot be read', (kind, key) => {
      seed();
      const blocked = failRead(key);
      renderEditor(kind);
      expect(screen.getByRole('alert')).toHaveTextContent(STORAGE_WARNING);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      blocked.mockRestore();
      expect(readPosts().value).toEqual([post]);
    },
  );

  it.each(['create', 'edit'].flatMap((kind) => corruptPosts.map(([raw]) => [kind, raw])))(
    'preserves corrupt collection %s %s and disables mutation', (kind, raw) => {
      seed();
      localStorage.setItem(POSTS_KEY, raw);
      renderApp(kind === 'create' ? '/write' : `/edit/${post.id}`);
      expect(screen.getByRole('alert')).toHaveTextContent(STORAGE_WARNING);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(screen.queryByRole('heading', { name: 'Post not found' })).not.toBeInTheDocument();
      expect(localStorage.getItem(POSTS_KEY)).toBe(raw);
    },
  );

  it.each(['create', 'edit'])('preserves corrupt users and disables %s even for fixed admin', (kind) => {
    seed([post], DEMO_ADMIN);
    localStorage.setItem(USERS_KEY, '{broken');
    renderApp(kind === 'create' ? '/write' : `/edit/${post.id}`);
    expect(screen.getByRole('alert')).toHaveTextContent(STORAGE_WARNING);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(localStorage.getItem(USERS_KEY)).toBe('{broken');
    expect(readPosts().value).toEqual([post]);
  });

  it.each(['create', 'edit'])('retains entered %s text but disables saving if fresh read fails after mount', async (kind) => {
    seed();
    const actor = userEvent.setup();
    const path = kind === 'create' ? '/write' : `/edit/${post.id}`;
    renderApp(path);
    await fillForm(actor);
    const blocked = failRead(POSTS_KEY);
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    expect(window.location.pathname).toBe(path);
    expect(screen.getByRole('alert')).toHaveTextContent(STORAGE_WARNING);
    expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue(input.content);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    blocked.mockRestore();
    expect(readPosts().value).toEqual([post]);
  });

  it.each(['create', 'edit'])('rejects changed active identity on %s submit and returns to blogs', async (kind) => {
    seed();
    const actor = userEvent.setup();
    renderApp(kind === 'create' ? '/write' : `/edit/${post.id}`);
    await fillForm(actor);
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionForUser(secondUser)));
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    expect(window.location.pathname).toBe('/blogs');
    expect(readPosts().value).toEqual([post]);
  });

  it.each(['create', 'edit'])('redirects %s to login when the active session disappears before submission', async (kind) => {
    seed();
    const actor = userEvent.setup();
    renderApp(kind === 'create' ? '/write' : `/edit/${post.id}`);
    await fillForm(actor);
    localStorage.removeItem(SESSION_KEY);
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    expect(window.location.pathname).toBe('/login');
    expect(readPosts().value).toEqual([post]);
  });

  it('reports not-found when a loaded edit target disappears before Save without overwriting newer posts', async () => {
    seed();
    const actor = userEvent.setup();
    renderApp(`/edit/${post.id}`);
    await fillForm(actor);
    const fresh = makePost(20);
    localStorage.setItem(POSTS_KEY, JSON.stringify([fresh]));
    await actor.click(screen.getByRole('button', { name: 'Save' }));
    expect(window.location.pathname).toBe(`/edit/${post.id}`);
    expect(screen.getByRole('heading', { name: 'Post not found', exact: true })).toBeInTheDocument();
    expect(readPosts().value).toEqual([fresh]);
  });

  it('reloads fresh edit values after a route-ID transition', async () => {
    const fresh = makePost(20);
    seed([post, fresh]);
    const actor = userEvent.setup();
    renderApp(`/edit/${post.id}`);
    await actor.click(screen.getByRole('button', { name: 'Cancel' }));
    await actor.click(screen.getByRole('link', { name: 'Back to All Blogs' }));
    const card = screen.getByRole('heading', { name: fresh.title }).closest('article');
    await actor.click(within(card).getByRole('link', { name: 'Edit', exact: true }));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(fresh.title);
    expect(readPosts().value).toHaveLength(2);
  });
});
