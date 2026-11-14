import { describe, it, expect } from 'vitest';
import { sameName, toggleInList, type SavedName } from '../lib/saved';

const item = (name: string, savedAt = 1): SavedName => ({ name, short_meaning: 'm', savedAt });

describe('sameName', () => {
  it('matches case-insensitively and ignores surrounding space', () => {
    expect(sameName('chidiebere', ' Chidiebere ')).toBe(true);
    expect(sameName('Ada', 'Adaeze')).toBe(false);
  });
});

describe('toggleInList', () => {
  it('adds a name that is not saved', () => {
    expect(toggleInList([], { name: 'Ada', short_meaning: 'x' }, 5)).toEqual([{ name: 'Ada', short_meaning: 'x', savedAt: 5 }]);
  });
  it('removes a saved name regardless of case', () => {
    expect(toggleInList([item('chidiebere'), item('Ada')], { name: 'Chidiebere', short_meaning: '' }, 9)).toEqual([item('Ada')]);
  });
});
