// ============================================================================
// Tests: Web Scraper Service, Cheerio Parser & SSRF Protection
// ============================================================================

import {
  isPrivateIpOrHost,
  validateUrlForSsrf,
  scoreUrlRelevance,
  fetchPage,
  crawlSite,
} from '../services/scraper';

// Mock node-fetch
jest.mock('node-fetch');
import fetch from 'node-fetch';
const { Response } = jest.requireActual('node-fetch');

describe('Scraper Service', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.clearAllMocks();
  });

  describe('SSRF Protection', () => {
    it('correctly identifies private and loopback IPs/hosts', () => {
      expect(isPrivateIpOrHost('localhost')).toBe(true);
      expect(isPrivateIpOrHost('127.0.0.1')).toBe(true);
      expect(isPrivateIpOrHost('127.1.2.3')).toBe(true);
      expect(isPrivateIpOrHost('10.0.0.1')).toBe(true);
      expect(isPrivateIpOrHost('10.255.255.255')).toBe(true);
      expect(isPrivateIpOrHost('192.168.1.1')).toBe(true);
      expect(isPrivateIpOrHost('172.16.0.1')).toBe(true);
      expect(isPrivateIpOrHost('172.31.255.255')).toBe(true);
      expect(isPrivateIpOrHost('169.254.169.254')).toBe(true);

      // Public hosts
      expect(isPrivateIpOrHost('example.com')).toBe(false);
      expect(isPrivateIpOrHost('google.com')).toBe(false);
      expect(isPrivateIpOrHost('8.8.8.8')).toBe(false);
      expect(isPrivateIpOrHost('172.32.0.1')).toBe(false);
    });

    it('blocks private hosts in production mode', () => {
      process.env.NODE_ENV = 'production';
      expect(() => validateUrlForSsrf('http://127.0.0.1:8080/secret')).toThrow(
        /SSRF blocked/
      );
      expect(() => validateUrlForSsrf('http://localhost:3000')).toThrow(
        /SSRF blocked/
      );
      expect(() => validateUrlForSsrf('http://10.0.0.5/admin')).toThrow(
        /SSRF blocked/
      );
    });

    it('permits valid public URLs in production', () => {
      process.env.NODE_ENV = 'production';
      const url = validateUrlForSsrf('https://acme-corp.com/careers');
      expect(url.hostname).toBe('acme-corp.com');
    });

    it('permits localhost in development/test mode', () => {
      process.env.NODE_ENV = 'development';
      const url = validateUrlForSsrf('http://localhost:3000/test');
      expect(url.hostname).toBe('localhost');
    });

    it('rejects non-http(s) protocols', () => {
      expect(() => validateUrlForSsrf('file:///etc/passwd')).toThrow(/Unsupported protocol/);
      expect(() => validateUrlForSsrf('ftp://example.com')).toThrow(/Unsupported protocol/);
    });
  });

  describe('Keyword Relevance Scoring', () => {
    it('scores career, job, and engineering paths higher', () => {
      const careerScore = scoreUrlRelevance('https://example.com/careers/lead-engineer', 'Careers');
      const privacyScore = scoreUrlRelevance('https://example.com/legal/privacy-policy', 'Privacy Policy');
      expect(careerScore).toBeGreaterThan(privacyScore);
      expect(careerScore).toBeGreaterThanOrEqual(10);
    });

    it('scores interview and hiring paths positively', () => {
      const hiringScore = scoreUrlRelevance('https://example.com/hiring-process', 'Our Hiring Process');
      expect(hiringScore).toBeGreaterThan(5);
    });
  });

  describe('Page Fetching & Cheerio Parsing', () => {
    it('strips scripts, nav, footer and extracts clean text and internal links', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Acme Corp — Engineering & Careers</title>
            <style>body { color: red; }</style>
            <script>console.log('secret tracking');</script>
          </head>
          <body>
            <nav><a href="/home">Home</a></nav>
            <main>
              <h1>About Acme Engineering</h1>
              <p>We build distributed cloud infrastructure using TypeScript and Go.</p>
              <a href="/careers/jobs">View Open Roles</a>
              <a href="https://external.com/partner">External Partner</a>
            </main>
            <footer>Copyright 2026 Acme Corp</footer>
          </body>
        </html>
      `;

      const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
      mockedFetch.mockImplementation(async (url: any) => {
        if (String(url).includes('robots.txt')) {
          return new Response('User-agent: *\nAllow: /', { status: 200 }) as any;
        }
        return new Response(mockHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }) as any;
      });

      const page = await fetchPage('https://acme.example.com/about');
      expect(page).not.toBeNull();
      expect(page!.title).toBe('Acme Corp — Engineering & Careers');
      expect(page!.text).toContain('We build distributed cloud infrastructure');
      // Stripped tags should not be in body text
      expect(page!.text).not.toContain('secret tracking');
      expect(page!.text).not.toContain('color: red');
      expect(page!.text).not.toContain('Copyright 2026 Acme Corp');

      // Internal links only
      expect(page!.links).toEqual([
        { url: 'https://acme.example.com/careers/jobs', text: 'View Open Roles' },
      ]);
    });

    it('skips non-HTML / non-text content types (e.g. PDF / binaries)', async () => {
      const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
      mockedFetch.mockImplementation(async (url: any) => {
        if (String(url).includes('robots.txt')) {
          return new Response('User-agent: *\nAllow: /', { status: 200 }) as any;
        }
        return new Response('binary data', {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }) as any;
      });

      const page = await fetchPage('https://example.com/whitepaper.pdf');
      expect(page).toBeNull();
    });

    it('returns null on HTTP 404 or 500 error', async () => {
      const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
      mockedFetch.mockImplementation(async (url: any) => {
        if (String(url).includes('robots.txt')) {
          return new Response('User-agent: *\nAllow: /', { status: 200 }) as any;
        }
        return new Response('Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        }) as any;
      });

      const page = await fetchPage('https://example.com/missing');
      expect(page).toBeNull();
    });
  });

  describe('crawlSite', () => {
    it('crawls homepage and traverses top-scored internal links up to maxPages', async () => {
      const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

      mockedFetch.mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('robots.txt')) {
          return new Response('User-agent: *\nAllow: /', { status: 200 }) as any;
        }
        if (urlStr === 'https://acme.example.com/' || urlStr === 'https://acme.example.com') {
          return new Response(
            `<html><head><title>Acme Home</title></head><body>
              <h1>Acme Home</h1>
              <a href="/careers">Join Us</a>
             </body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
          ) as any;
        }
        if (urlStr.includes('/careers')) {
          return new Response(
            `<html><head><title>Acme Careers</title></head><body>
              <h1>Careers</h1>
              <p>Our interview process consists of coding, system design, and culture fit.</p>
             </body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
          ) as any;
        }
        return new Response('Not Found', { status: 404 }) as any;
      });

      const result = await crawlSite('https://acme.example.com', 2, 1);
      expect(result.pages.length).toBe(2);
      expect(result.pagesUsed).toContain('https://acme.example.com/');
      expect(result.pagesUsed).toContain('https://acme.example.com/careers');
    });
  });
});
