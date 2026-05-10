/**
 * Firecrawl-based Browser Tool
 *
 * Replaces Puppeteer with Firecrawl for cloud-native browser automation.
 * Compatible with serverless environments (Vercel, etc.).
 *
 * Usage:
 *   const { BrowserTool } = require('./browser');
 *   const browser = new BrowserTool();
 *   const result = await browser.scrape('https://example.com');
 */

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
const FIRECRAWL_BASE_URL = process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev';

class BrowserTool {
  constructor(apiKey = FIRECRAWL_API_KEY, baseUrl = FIRECRAWL_BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Internal: perform a fetch with standard headers and error handling.
   */
  async _request(endpoint, body = {}, method = 'POST') {
    if (!this.apiKey) {
      throw new Error('Firecrawl API key is missing. Set FIRECRAWL_API_KEY.');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
    };

    let response;
    try {
      response = await fetch(url, options);
    } catch (networkErr) {
      throw new Error(`Firecrawl network error: ${networkErr.message}`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      const text = await response.text();
      throw new Error(
        `Firecrawl HTTP ${response.status}: ${text || response.statusText}`
      );
    }

    if (!response.ok || data.success === false) {
      const msg = data.message || data.error || JSON.stringify(data);
      throw new Error(`Firecrawl error (${response.status}): ${msg}`);
    }

    return data;
  }

  /**
   * Scrape a single URL.
   *
   * @param {string} url - Target URL
   * @param {Object} [options]
   * @param {boolean} [options.onlyMainContent=true] - Strip nav/ads/footer
   * @param {string} [options.formats='markdown'] - Comma-separated: markdown,html,text,screenshot,links
   * @param {boolean} [options.waitFor=0] - Milliseconds to wait before extraction
   * @returns {Promise<Object>} - { success, data, ... }
   */
  async scrape(url, options = {}) {
    if (!url || typeof url !== 'string') {
      throw new Error('URL is required and must be a string.');
    }

    const body = {
      url,
      onlyMainContent: options.onlyMainContent !== false,
      formats: options.formats || 'markdown',
      ...(options.waitFor ? { waitFor: options.waitFor } : {}),
    };

    return this._request('/v1/scrape', body);
  }

  /**
   * Interact with a page (click, type, scroll, screenshot) via Firecrawl.
   *
   * @param {string} url - Starting URL
   * @param {Array<Object>} actions - Ordered list of actions
   *   e.g. [{ type: 'click', selector: '#btn' }, { type: 'type', selector: '#q', text: 'hello' }]
   * @param {Object} [options]
   * @param {string} [options.formats='markdown'] - Desired output formats
   * @returns {Promise<Object>}
   */
  async interact(url, actions = [], options = {}) {
    if (!url || typeof url !== 'string') {
      throw new Error('URL is required and must be a string.');
    }
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new Error('At least one action is required for interact.');
    }

    const body = {
      url,
      actions,
      formats: options.formats || 'markdown',
    };

    return this._request('/v1/interact', body);
  }

  /**
   * Convenience: scrape and return markdown content only.
   */
  async getMarkdown(url, options = {}) {
    const res = await this.scrape(url, { ...options, formats: 'markdown' });
    return res.data?.markdown || '';
  }

  /**
   * Convenience: scrape and return screenshot URL (if available).
   */
  async getScreenshot(url, options = {}) {
    const res = await this.scrape(url, { ...options, formats: 'screenshot' });
    return res.data?.screenshot || null;
  }

  /**
   * Search the web using Firecrawl (if supported by your plan).
   *
   * @param {string} query - Search query
   * @param {Object} [options]
   * @param {number} [options.limit=5] - Max results
   * @returns {Promise<Object>}
   */
  async search(query, options = {}) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query is required and must be a string.');
    }

    const body = {
      query,
      limit: options.limit || 5,
    };

    return this._request('/v1/search', body);
  }
}

module.exports = { BrowserTool };
