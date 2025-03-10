import { assert } from 'chai';
import gplay from '../index.js';
import * as R from 'ramda';

describe('Categories method', () => {
  it('should fetch valid list of categories', () => {
    return gplay.categories().then(categories => {
      console.log(categories);
      assert.isArray(categories);
      assert.isTrue(categories.length > 1);
    });
  });

  it('should have all categories from constant list of categories', () => {
    return gplay.categories().then(categories => {
      const categoriesConst = Object.keys(gplay.category);
      assert.deepEqual(
        R.difference(categories, categoriesConst),
        [],
        'Google Play has categories that are not in "category" constant'
      );
    });
  });
});
