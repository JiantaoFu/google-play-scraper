import request from './utils/request.js';
import * as cheerio from 'cheerio';
import { BASE_URL } from './constants.js';
import debug from 'debug';

const log = debug('google-play-scraper:categories');

const PLAYSTORE_URL = `${BASE_URL}/store/apps`;

function categories (opts) {
  opts = Object.assign({}, opts);

  return new Promise(function (resolve, reject) {
    const options = Object.assign(
      {
        url: PLAYSTORE_URL
      },
      opts.requestOptions
    );

    // log('Request options:', options);

    request(options, opts.throttle)
      .then(response => {
        // log('Response:', response);
        if (typeof response !== 'string') {
          throw new Error('Response is not a string');
        }
        return cheerio.load(response);
      })
      .then($ => {
        // log('Loaded cheerio instance:', {
        //   type: typeof $,
        //   properties: Object.keys($)
        // });
        return extractCategories($);
      })
      .then(resolve)
      .catch(error => {
        log('Request failed:', error);
        reject(error);
      });
  });
}

function extractCategories ($) {
  log('Extracting categories from the page');

  const categories = new Set();

  // Get all script content
  const pageContent = $('script').map((i, el) => $(el).html()).get().join(' ');

  // Find all category patterns in the entire page content
  const categoryPattern = /\/store\/apps\/category\/([^/?"\s]+)/g;
  let match;

  while ((match = categoryPattern.exec(pageContent)) !== null) {
    if (match[1]) {
      categories.add(match[1].toUpperCase());
    }
  }

  const categoryIds = Array.from(categories);
  if (categoryIds.length === 0) {
    log('No categories found in page content');
    return ['APPLICATION'];
  }

  if (!categoryIds.includes('APPLICATION')) {
    categoryIds.push('APPLICATION');
  }

  log(`Found ${categoryIds.length} categories:`, categoryIds);
  return categoryIds;
}

export default categories;
