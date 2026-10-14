/** Keep unregistered routes safe and navigable without any data mutations. */
import { Link } from 'react-router-dom';

/** Return an unknown-route view with an explicit public home link. */
export default function NotFound() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 text-center" aria-labelledby="not-found-title">
      <p className="text-sm font-bold uppercase tracking-widest text-primary-800">
        404
      </p>
      <h1 id="not-found-title" className="mt-4 font-display text-4xl">
        Page not found
      </h1>
      <p className="mt-4 text-foreground-muted">
        This page is not available. There is still space for you at home.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex rounded-full bg-primary-700 px-6 py-3 font-bold text-white hover:bg-primary-800"
      >
        Back to Home
      </Link>
    </section>
  );
}
