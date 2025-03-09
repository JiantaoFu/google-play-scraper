import { assert } from 'chai';
import gplay from '../index.js';
import { assertValidApp } from './common.js';

describe('Similar method', () => {
  it('should fetch a valid application list', () => {
    return gplay.similar({ appId: 'com.waplog.social' })
      .then((apps) => apps.map(assertValidApp));
  });

  it('should fetch games from different developers', () => {
    return gplay.similar({ appId: 'com.instagram.android' })
      .then((apps) => assert.isTrue(apps.some(app => app.developer !== apps[0].developer)));
  });

  it('should print similar apps results', () => {
    return gplay.similar({ appId: 'com.waplog.social' })
      .then((apps) => {
        console.log('Similar apps found:', apps.length);
        console.log(JSON.stringify(apps, null, 2));
        assert.isArray(apps);
      });
  });
});
