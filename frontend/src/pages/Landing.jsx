/** Introduce WriteSpace and preview only the newest locally validated posts. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Feather, LockSimple, Lightning } from '@phosphor-icons/react';
import { Notice } from '../components/Notice.jsx';
import { PostCard } from '../components/PostCard.jsx';
import { POSTS_KEY, readCollection } from '../utils/storage.js';
import { sortPosts } from '../utils/postPresentation.js';

const features = [
  { title: 'Write Freely', text: 'A blank page, a clear mind. Make room for your own words.', Icon: Feather },
  { title: 'Private & Local', text: 'Your posts stay in this browser. No server, no synchronization.', Icon: LockSimple },
  { title: 'Instant & Fast', text: 'Less setup. More writing. A simple space to begin.', Icon: Lightning },
];
const actionStyle = 'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-bold '
  + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring '
  + 'transition-transform duration-gentle ease-gentle motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none';

/**
 * Render discovery with a fresh guarded collection read on each mount.
 * Returns:
 *   Exact landing copy, links, zero-to-three previews, and non-destructive warning state.
 */
export default function Landing() {
  const [postsRead, setPostsRead] = useState(null);
  useEffect(() => {
    setPostsRead(readCollection(POSTS_KEY));
  }, []);
  const posts = postsRead?.ok ? sortPosts(postsRead.value).slice(0, 3) : [];

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16">
      <section aria-labelledby="landing-title" className="grid items-center gap-12 py-16 lg:grid-cols-5 lg:py-24">
        <div className="lg:col-span-3">
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-primary-800">
            A little room for your words
          </p>
          <h1 id="landing-title" className="max-w-xl font-display text-hero">
            Your thoughts. Your space. Beautifully simple.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-foreground-muted">
            Begin with a thought. Give it a page. WriteSpace keeps writing simple, right here in your browser.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/register" className={`${actionStyle} bg-primary-700 text-white hover:bg-primary-800`}>
              Get Started Free
              <ArrowRight size={20} aria-hidden="true" />
            </Link>
            <Link to="/blogs" className={`${actionStyle} border border-border bg-surface hover:bg-surface-raised`}>
              Start Reading
            </Link>
          </div>
        </div>
        <div className="px-3 py-6 lg:col-span-2" aria-hidden="true">
          <div
            className="rounded-card bg-gradient-to-br from-primary-300 via-secondary-300 to-focal-pink p-2 shadow-focal"
          >
            <div className="motion-safe:animate-float rounded-card bg-surface px-7 py-9 motion-reduce:transform-none">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary-800">
                <Feather size={20} weight="duotone" />
                A page of your own
              </div>
              <p className="mt-8 font-display text-3xl leading-snug">
                Every story starts with a single thought.
              </p>
              <p className="mt-5 font-display italic leading-relaxed text-foreground-muted">
                Today, I found a little space to write…
              </p>
              <div className="mt-8 h-px bg-border" />
              <div className="mt-4 h-px w-4/5 bg-border" />
              <div className="mt-4 h-px w-3/5 bg-border" />
            </div>
          </div>
        </div>
      </section>
      <section aria-label="Why WriteSpace" className="grid gap-6 border-y border-border py-8 md:grid-cols-3">
        {features.map(({ title, text, Icon }) => (
          <article key={title} className="rounded-card bg-surface p-6">
            <Icon size={24} weight="duotone" className="text-primary-700" aria-hidden="true" />
            <h2 className="mt-4 font-display text-2xl">
              {title}
            </h2>
            <p className="mt-2 leading-relaxed text-foreground-muted">
              {text}
            </p>
          </article>
        ))}
      </section>
      <section aria-labelledby="recent-title" className="py-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary-800">
              From this browser
            </p>
            <h2 id="recent-title" className="mt-2 font-display text-3xl">
              Latest stories
            </h2>
          </div>
          <Link
            to="/blogs"
            className="rounded-sm font-bold text-primary-800 hover:underline focus-visible:outline focus-visible:outline-2"
          >
            View all blogs
          </Link>
        </div>
        {postsRead && !postsRead.ok && <Notice kind="storage" />}
        {!postsRead ? (
          <p role="status" className="py-10 text-foreground-muted">
            Reading local posts…
          </p>
        ) : postsRead.ok && posts.length === 0 ? (
          <p className="rounded-card border border-dashed border-border bg-surface py-12 text-center text-foreground-muted">
            No posts yet — check back soon!
          </p>
        ) : postsRead.ok ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : null}
      </section>
      <Notice />
    </div>
  );
}
