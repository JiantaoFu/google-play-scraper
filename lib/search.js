import * as R from 'ramda';
import url from 'url';
import request from './utils/request.js';
import { BASE_URL } from './constants.js';
import { processFullDetailApps, checkFinished } from './utils/processPages.js';
import scriptData from './utils/scriptData.js';

/*
 * Make the first search request as in the browser and call `checkfinished` to
 * process the next pages.
 *
 * 2026-10-01: Google changed search to JS-rendered results. The static HTML
 * now only contains a few app cards. Use a mobile UA which returns more
 * server-rendered results, and parse the HTML cards directly.
 */
function initialRequest (opts) {
  const url = `${BASE_URL}/store/search?q=${opts.term}&c=apps&hl=${opts.lang}&gl=${opts.country}`;
  const requestOptions = Object.assign({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36'
    }
  }, opts.requestOptions);
  return request(
    Object.assign({ url }, requestOptions),
    opts.throttle
  ).then((html) => parseMobileSearchResults(html, opts));
}

/**
 * Parse app cards from mobile search HTML.
 * Structure: <a href="/store/apps/details?id=PKG" aria-label="Title"> + <img src="icon">
 */
function parseMobileSearchResults (html, opts) {
  const apps = [];
  const seen = new Set();
  const maxResults = opts.num || 20;
  // Match app links with aria-label titles
  const cardRe = /<a href="\/store\/apps\/details\?id=([a-zA-Z0-9._]+)"[^>]*aria-label="([^"]+)"[^>]*>.*?<img src="([^"]+)"[^>]*alt="Icon image"/gs;
  let m;
  while ((m = cardRe.exec(html)) !== null && apps.length < maxResults) {
    const [, appId, title, icon] = m;
    if (seen.has(appId)) continue;
    seen.add(appId);
    apps.push({
      title: title.trim(),
      appId,
      url: `${BASE_URL}/store/apps/details?id=${appId}&hl=${opts.lang}&gl=${opts.country}`,
      icon: icon.replace(/=s\d+-rw$/, '=s512-rw'),
      developer: '',
      score: 0,
      free: true
    });
  }
  // Fallback: plain app links (title from nearby text or package suffix, icon from nearby img)
  const idRe = /href="\/store\/apps\/details\?id=([a-zA-Z0-9._]+)"/g;
  while ((m = idRe.exec(html)) !== null && apps.length < maxResults) {
    const appId = m[1];
    if (seen.has(appId)) continue;
    seen.add(appId);
    // Try to find title in surrounding context
    const ctx = html.substring(Math.max(0, m.index - 1500), m.index);
    const titleM = ctx.match(/"([A-Z][^"]{2,40})"\s*\]\s*,\s*null\s*\]\s*$/);
    // Try to find icon in forward context
    const fwd = html.substring(m.index, m.index + 3000);
    const iconM = fwd.match(/<img[^>]+src="(https:\/\/play-lh\.googleusercontent\.com[^"]+)"/);
    const icon = iconM ? iconM[1].replace(/=s\d+(-rw)?$/, '=s128-rw') : '';
    apps.push({
      title: titleM ? titleM[1] : appId.split('.').pop(),
      appId,
      url: `${BASE_URL}/store/apps/details?id=${appId}&hl=${opts.lang}&gl=${opts.country}`,
      icon,
      developer: '',
      score: 0,
      free: true
    });
  }
  return apps;
}

function extaractDeveloperId (link) {
  return link.split('?id=')[1];
}

async function processFirstPage (html, opts, savedApps, mappings) {
  if (R.is(String, html)) {
    html = scriptData.parse(html);
  }

  const appsMapping = {
    title: [2],
    appId: [12, 0],
    url: {
      path: [9, 4, 2],
      fun: (path) => new url.URL(path, BASE_URL).toString()
    },
    icon: [1, 1, 0, 3, 2],
    developer: [4, 0, 0, 0],
    developerId: {
      path: [4, 0, 0, 1, 4, 2],
      fun: extaractDeveloperId
    },
    currency: [7, 0, 3, 2, 1, 0, 1],
    price: {
      path: [7, 0, 3, 2, 1, 0, 0],
      fun: (price) => price / 1000000
    },
    free: {
      path: [7, 0, 3, 2, 1, 0, 0],
      fun: (price) => price === 0
    },
    summary: [4, 1, 1, 1, 1],
    scoreText: [6, 0, 2, 1, 0],
    score: [6, 0, 2, 1, 1]
  };

  const sections = R.path(mappings.sections, html) || [];
  if (noResultsFound(sections)) return [];

  const tokenSection = sections.filter((section) => isTokenSection(section))[0];
  const appsSection = R.path(mappings.apps, html);

  // parse each item in appsSection array
  const processedApps = R.map(scriptData.extractor(appsMapping), appsSection);

  const apps = opts.fullDetail
    ? await processFullDetailApps(processedApps, opts)
    : processedApps;
  const token = R.path(SECTIONS_MAPPING.token, tokenSection);

  return checkFinished(opts, [...savedApps, ...apps], token);
}

function isTokenSection (section) {
  const sectionToken =
    R.is(Array, section) && R.path(SECTIONS_MAPPING.token, section);
  return R.is(String, sectionToken);
}

function noResultsFound (sections) {
  if (sections.length === 0) {
    return true;
  }
}

const INITIAL_MAPPINGS = {
  apps: ['ds:1', 0, 1, 0, 0, 0],
  sections: ['ds:1', 0, 1, 0, 0]
};

const SECTIONS_MAPPING = {
  token: [1]
};

function getPriceGoogleValue (value) {
  switch (value.toLowerCase()) {
    case 'free':
      return 1;
    case 'paid':
      return 2;
    case 'all':
    default:
      return 0;
  }
}

function search (appData, opts) {
  return new Promise(function (resolve, reject) {
    if (!opts || !opts.term) {
      throw Error('Search term missing');
    }

    if (opts.num && opts.num > 250) {
      throw Error("The number of results can't exceed 250");
    }

    opts = {
      term: encodeURIComponent(opts.term),
      lang: opts.lang || 'en',
      country: opts.country || 'us',
      num: opts.num || 20,
      fullDetail: opts.fullDetail,
      price: opts.price ? getPriceGoogleValue(opts.price) : 0,
      throttle: opts.throttle,
      cache: opts.cache,
      requestOptions: opts.requestOptions
    };

    initialRequest(opts).then(resolve).catch(reject);
  }).then((results) => {
    if (opts.fullDetail) {
      // if full detail is wanted get it from the app module
      return Promise.all(
        results.map((app) => appData({ ...opts, appId: app.appId }))
      );
    }
    return results;
  });
}

export default search;
