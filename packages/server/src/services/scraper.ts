// ============================================================================
// Web Scraper Service
// ============================================================================
//
// Features:
//   - node-fetch with 10s timeout, 1MB max response, text/html & text/plain only
//   - Cheerio HTML parsing (strips scripts, styles, nav, footer)
//   - SSRF protection (disallows private/localhost hosts in production)
//   - robots.txt compliance via robots-parser
//   - Keyword-scored BFS crawl up to maxPages=20, maxDepth=2

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { URL } from 'url';

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
  links: Array<{ url: string; text: string }>;
}

export interface CrawlResult {
  pages: ScrapedPage[];
  pagesUsed: string[];
}

const USER_AGENT = 'trao-interview-kit/1.0 (+https://github.com/trao-ai)';
const MAX_RESPONSE_BYTES = 1024 * 1024; // 1 MB
const FETCH_TIMEOUT_MS = 10000; // 10s

// Keywords for scoring relevance of links to interview preparation
const RELEVANCE_KEYWORDS = [
  'careers',
  'career',
  'jobs',
  'job',
  'hiring',
  'about',
  'about-us',
  'team',
  'culture',
  'values',
  'engineering',
  'tech',
  'blog',
  'interview',
  'process',
  'work-with-us',
];

/**
 * Check if a hostname resolves to a private / loopback IP or localhost.
 */
export function isPrivateIpOrHost(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    return true;
  }

  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);
  if (match) {
    const o1 = parseInt(match[1], 10);
    const o2 = parseInt(match[2], 10);
    if (o1 === 127) return true; // loopback
    if (o1 === 10) return true; // 10.0.0.0/8
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12
    if (o1 === 169 && o2 === 254) return true; // link-local
    if (o1 === 0) return true;
  }

  return false;
}

/**
 * Validates a target URL against SSRF rules.
 * Throws an error if URL targets private infrastructure in production.
 */
export function validateUrlForSsrf(targetUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch (err) {
    throw new Error(`Invalid URL: ${targetUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}. Only HTTP/HTTPS allowed.`);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && isPrivateIpOrHost(parsed.hostname)) {
    throw new Error(`SSRF blocked: host "${parsed.hostname}" is a private network address.`);
  }

  return parsed;
}

// In-memory cache for robots.txt instances per origin
const robotsCache = new Map<string, ReturnType<typeof robotsParser> | null>();

/**
 * Fetches and parses robots.txt for a given origin.
 */
export async function getRobotsChecker(originUrl: string): Promise<ReturnType<typeof robotsParser> | null> {
  const parsed = new URL(originUrl);
  const origin = parsed.origin;

  if (robotsCache.has(origin)) {
    return robotsCache.get(origin) || null;
  }

  const robotsUrl = `${origin}/robots.txt`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(robotsUrl, {
      signal: controller.signal as any,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const text = await res.text();
      const parser = robotsParser(robotsUrl, text);
      robotsCache.set(origin, parser);
      return parser;
    }
  } catch {
    // If robots.txt fetch fails (404, network error, timeout), assume no restrictions
  }

  robotsCache.set(origin, null);
  return null;
}

/**
 * Checks if crawling a specific URL is permitted by robots.txt.
 */
export async function isAllowedByRobots(targetUrl: string): Promise<boolean> {
  try {
    const checker = await getRobotsChecker(targetUrl);
    if (!checker) return true;
    const allowed = checker.isAllowed(targetUrl, USER_AGENT);
    return allowed !== false;
  } catch {
    return true;
  }
}

/**
 * Fetch and extract text and internal links from a single URL.
 */
export async function fetchPage(targetUrl: string): Promise<ScrapedPage | null> {
  const parsedUrl = validateUrlForSsrf(targetUrl);

  const allowed = await isAllowedByRobots(targetUrl);
  if (!allowed) {
    console.warn(`[Scraper] Blocked by robots.txt: ${targetUrl}`);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal as any,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,text/plain;q=0.9',
      },
    });

    if (!response.ok) {
      console.warn(`[Scraper] HTTP ${response.status} for ${targetUrl}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      console.warn(`[Scraper] Skipped non-text content-type "${contentType}" for ${targetUrl}`);
      return null;
    }

    // Read body enforcing 1MB max
    const buffer = await response.buffer();
    if (buffer.length > MAX_RESPONSE_BYTES) {
      console.warn(`[Scraper] Content exceeded 1MB (${buffer.length} bytes) for ${targetUrl}`);
    }
    const html = buffer.slice(0, MAX_RESPONSE_BYTES).toString('utf-8');

    // Parse HTML with Cheerio
    const $ = cheerio.load(html);

    // Strip non-content tags
    $('script, style, nav, footer, noscript, iframe, svg, form, select, button').remove();

    const title = $('title').text().trim() || $('h1').first().text().trim() || '';

    // Extract visible text
    const text = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    // Extract all internal links
    const links: Array<{ url: string; text: string }> = [];
    $('a[href]').each((_, el) => {
      const rawHref = $(el).attr('href');
      const linkText = $(el).text().replace(/\s+/g, ' ').trim();
      if (!rawHref) return;

      try {
        const resolved = new URL(rawHref, targetUrl);
        // Only internal links (same origin or subdomains of main host)
        if (
          resolved.origin === parsedUrl.origin &&
          (resolved.protocol === 'http:' || resolved.protocol === 'https:')
        ) {
          // Remove hash
          resolved.hash = '';
          links.push({
            url: resolved.toString(),
            text: linkText,
          });
        }
      } catch {
        // Ignore malformed hrefs
      }
    });

    return {
      url: targetUrl,
      title,
      text,
      links,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Score a URL based on keyword relevance in its path and anchor text.
 */
export function scoreUrlRelevance(urlStr: string, anchorText = ''): number {
  let score = 0;
  const lowerUrl = urlStr.toLowerCase();
  const lowerAnchor = anchorText.toLowerCase();

  for (const kw of RELEVANCE_KEYWORDS) {
    if (lowerUrl.includes(kw)) {
      score += 5;
    }
    if (lowerAnchor.includes(kw)) {
      score += 3;
    }
  }

  // Penalize long query strings or deeply nested pagination
  if (lowerUrl.includes('?')) score -= 2;
  if (lowerUrl.includes('/tag/') || lowerUrl.includes('/category/')) score -= 1;

  return score;
}

/**
 * Crawl a website starting from the given root URL up to maxPages and maxDepth.
 * Returns the scraped pages and the list of URLs actually fetched.
 */
export async function crawlSite(
  rootUrl: string,
  maxPages = 20,
  maxDepth = 2
): Promise<CrawlResult> {
  const pages: ScrapedPage[] = [];
  const pagesUsed: string[] = [];
  const visited = new Set<string>();

  // Normalize root URL
  let parsedRoot: URL;
  try {
    parsedRoot = new URL(rootUrl);
    parsedRoot.hash = '';
  } catch {
    return { pages: [], pagesUsed: [] };
  }

  const queue: Array<{ url: string; depth: number; score: number }> = [
    { url: parsedRoot.toString(), depth: 0, score: 100 },
  ];

  while (queue.length > 0 && pages.length < maxPages) {
    // Sort queue by score descending to crawl highest relevance pages first
    queue.sort((a, b) => b.score - a.score);
    const current = queue.shift()!;

    if (visited.has(current.url)) continue;
    visited.add(current.url);

    try {
      const page = await fetchPage(current.url);
      if (page) {
        pages.push(page);
        pagesUsed.push(page.url);

        // If not at maxDepth, enqueue candidate internal links
        if (current.depth < maxDepth) {
          for (const link of page.links) {
            if (!visited.has(link.url)) {
              const score = scoreUrlRelevance(link.url, link.text);
              queue.push({
                url: link.url,
                depth: current.depth + 1,
                score,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[Scraper] Failed to scrape ${current.url}:`, err instanceof Error ? err.message : err);
    }
  }

  return {
    pages,
    pagesUsed,
  };
}
