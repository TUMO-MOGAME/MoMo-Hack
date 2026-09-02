/**
 * A6-04. `/robots.txt` returned 404.
 *
 * `/api/` is disallowed not because those routes are secret — they are not, and
 * A5 grades them on the assumption an attacker has read every migration — but
 * because a crawler following `/api/agent` spends a Gemini call per request, and
 * the free tier is the whole budget (A5-03 is the same concern from the CORS
 * side). robots.txt is a request, not a control; the origin check is the control.
 */
import type { MetadataRoute } from 'next';

const SITE = 'https://momo.tumoolo.tech';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
