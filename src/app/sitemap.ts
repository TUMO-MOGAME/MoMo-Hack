/**
 * A6-04. `/sitemap.xml` returned 404.
 *
 * Three routes, because there are three. A sitemap listing pages that do not
 * exist is worse than none — and this project has an explicit rule about not
 * writing down things it has not verified.
 */
import type { MetadataRoute } from 'next';

const SITE = 'https://momo.tumoolo.tech';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/chat`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/ledger`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
  ];
}
