// src/lib/url.ts
//
// withBase(path) prepends import.meta.env.BASE_URL to a path,
// guaranteeing exactly one slash between base and path and exactly one
// trailing slash on the result (matching trailingSlash: 'always').
//
// CONTRACT (D-05:): never hand-concatenate URLs. This is the single chokepoint
// for internal URL construction. It works for:
//   - Anchor hrefs:    <a href={withBase('/quizzes/ch1')}>
//   - Image srcs:      <img src={withBase('/favicon.svg')}>
//   - <link rel> hrefs: <link rel="icon" href={withBase('/favicon.svg')}>
//
// import.meta.env.BASE_URL is replaced by Vite at build time with the
// literal string value, so this helper has zero runtime cost in the bundle.

const BASE = import.meta.env.BASE_URL; // e.g. "/real-world-cryptography/"

/**
 * Construct an internal URL by prepending the configured base path.
 *
 * @param path - Site-relative path. Leading slash optional. Examples:
 *               "/", "about", "/quizzes/ch1", "favicon.svg"
 * @returns Joined URL with exactly one slash between base and path.
 *
 * Behaviors:
 *   withBase('/')              -> "/real-world-cryptography/"
 *   withBase('')               -> "/real-world-cryptography/"
 *   withBase('about')          -> "/real-world-cryptography/about/"
 *   withBase('/about')         -> "/real-world-cryptography/about/"
 *   withBase('/about/')        -> "/real-world-cryptography/about/"
 *   withBase('favicon.svg')    -> "/real-world-cryptography/favicon.svg"
 *   withBase('/favicon.svg')   -> "/real-world-cryptography/favicon.svg"
 *
 * Trailing-slash policy: matches trailingSlash: 'always' for routes
 * (paths without an extension get a trailing slash). Asset paths
 * (with an extension like .svg, .css, .js, .woff2) keep their
 * extension and are NOT given a trailing slash.
 */
export function withBase(path: string): string {
  // Normalize: strip leading slash from path, strip trailing slash from base.
  const base = BASE.replace(/\/+$/, '');           // "/real-world-cryptography"
  const rest = path.replace(/^\/+/, '');           // "about" or "favicon.svg"

  if (rest === '') {
    return base + '/';
  }

  // Asset detection: simple extension check. Anything ending in `.<2-5 chars>`
  // is treated as a file and gets no trailing slash.
  const isAsset = /\.[a-zA-Z0-9]{2,5}$/.test(rest);

  if (isAsset) {
    return `${base}/${rest}`;
  }

  // Route — enforce trailing slash (D-03 trailingSlash: 'always').
  const trimmed = rest.replace(/\/+$/, '');
  return `${base}/${trimmed}/`;
}
