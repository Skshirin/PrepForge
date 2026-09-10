// ============================================================================
// Public Discussion Search Service
// ============================================================================
//
// Searches for interview experiences for a company:
//   1. Primary: Google Custom Search API (targeting reddit.com / glassdoor.com)
//   2. Fallback: Reddit JSON API (no key needed, user-agent: trao-interview-kit/1.0)
//   3. Fetches top 2 result URLs and extracts visible text via scraper

import fetch from 'node-fetch';
import { fetchPage } from './scraper';

export interface DiscussionResult {
  url: string;
  title: string;
  content: string;
  source: 'google_cse' | 'reddit_json' | 'direct';
}

const USER_AGENT = 'trao-interview-kit/1.0';

/**
 * Search Google Custom Search API for interview experiences.
 */
async function searchGoogleCse(company: string): Promise<Array<{ url: string; title: string; snippet: string }>> {
  const apiKey = process.env.GOOGLE_CSE_KEY || process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID || process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !cx) {
    throw new Error('Google CSE credentials not configured');
  }

  const query = `"${company}" interview experience site:reddit.com OR site:glassdoor.com`;
  const endpoint = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=5`;

  const response = await fetch(endpoint, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Google CSE returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  const items = data.items || [];

  return items.map((item: any) => ({
    url: item.link,
    title: item.title || '',
    snippet: item.snippet || '',
  }));
}

/**
 * Fallback search using Reddit's public JSON API.
 * Does not require an API key.
 */
async function searchRedditJson(company: string): Promise<Array<{ url: string; title: string; snippet: string }>> {
  const query = `${company} interview`;
  const endpoint = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=5&sort=relevance`;

  const response = await fetch(endpoint, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit search returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  const posts = data?.data?.children || [];

  const results: Array<{ url: string; title: string; snippet: string }> = [];
  for (const post of posts) {
    const p = post.data;
    if (p && p.permalink) {
      const fullUrl = `https://www.reddit.com${p.permalink}`;
      const title = p.title || '';
      const selftext = p.selftext ? p.selftext.slice(0, 500) : '';
      results.push({
        url: fullUrl,
        title,
        snippet: selftext,
      });
    }
  }

  return results;
}

/**
 * Search for public discussion about a company's interview process.
 * Tries Google CSE first, then falls back to Reddit JSON.
 * Fetches the top 2 result URLs and returns their extracted text.
 */
export async function searchPublicDiscussion(company: string): Promise<DiscussionResult[]> {
  if (!company || company.trim().length === 0) {
    return [];
  }

  let candidates: Array<{ url: string; title: string; snippet: string }> = [];
  let sourceUsed: 'google_cse' | 'reddit_json' = 'google_cse';

  // 1. Try Google Custom Search
  try {
    candidates = await searchGoogleCse(company);
    if (candidates.length === 0) {
      throw new Error('Google CSE returned 0 results');
    }
  } catch (cseErr: any) {
    console.warn(`[DiscussionSearch] Google CSE unavailable (${cseErr.message}), falling back to Reddit JSON API...`);
    sourceUsed = 'reddit_json';
    try {
      candidates = await searchRedditJson(company);
    } catch (redditErr: any) {
      console.warn(`[DiscussionSearch] Reddit search also failed: ${redditErr.message}`);
      return [];
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  // Take top 2 candidates and extract full page text
  const top2 = candidates.slice(0, 2);
  const results: DiscussionResult[] = [];

  for (const candidate of top2) {
    try {
      const page = await fetchPage(candidate.url);
      if (page && page.text) {
        results.push({
          url: candidate.url,
          title: page.title || candidate.title,
          content: page.text.slice(0, 3000), // Cap at 3000 chars to avoid LLM context bloat
          source: sourceUsed,
        });
      } else if (candidate.snippet) {
        // Use snippet if full page fetch was blocked or empty
        results.push({
          url: candidate.url,
          title: candidate.title,
          content: candidate.snippet,
          source: sourceUsed,
        });
      }
    } catch {
      if (candidate.snippet) {
        results.push({
          url: candidate.url,
          title: candidate.title,
          content: candidate.snippet,
          source: sourceUsed,
        });
      }
    }
  }

  return results;
}
