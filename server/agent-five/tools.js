/**
 * Agent Five Tools Registry
 *
 * Aggregates all tools available to Agent Five.
 * Updated to use the Firecrawl-based BrowserTool instead of Puppeteer.
 */

const { BrowserTool } = require('../tools/browser');

// Shared browser tool instance
const browser = new BrowserTool();

/**
 * Execute a browser action via Firecrawl.
 *
 * @param {Object} params
 * @param {string} params.url - Target URL
 * @param {string} [params.action='scrape'] - 'scrape' | 'screenshot' | 'interact' | 'search'
 * @param {Array<Object>} [params.actions] - Required when action='interact'
 * @param {Object} [params.options] - Extra options passed to Firecrawl
 * @returns {Promise<Object>}
 */
async function browserTool(params) {
  const { url, action = 'scrape', actions = [], options = {} } = params;

  try {
    let result;

    switch (action) {
      case 'scrape':
        result = await browser.scrape(url, options);
        break;
      case 'screenshot':
        result = await browser.getScreenshot(url, options);
        break;
      case 'interact':
        result = await browser.interact(url, actions, options);
        break;
      case 'search':
        // search does not need a url param
        result = await browser.search(url || params.query, options);
        break;
      default:
        throw new Error(`Unknown browser action: ${action}`);
    }

    return {
      success: true,
      action,
      data: result,
      message: `Browser ${action} completed successfully.`,
    };
  } catch (error) {
    return {
      success: false,
      action,
      error: error.message,
      message: `Browser ${action} failed: ${error.message}`,
    };
  }
}

/**
 * Registry of all tools.
 */
const tools = {
  browser: browserTool,
};

/**
 * Execute a tool by name.
 *
 * @param {string} toolName
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function executeTool(toolName, params) {
  const tool = tools[toolName];
  if (!tool) {
    throw new Error(`Tool "${toolName}" not found. Available: ${Object.keys(tools).join(', ')}`);
  }
  return tool(params);
}

module.exports = {
  BrowserTool,
  browserTool,
  executeTool,
  tools,
};
