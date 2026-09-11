import type { MetadataRoute } from 'next'

// Private internal CRM: block all crawlers from every path.
// Emitted as a static /robots.txt during `next build` (output: 'export').
export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  }
}
