import { LinkValue, ListValue, NullValue, NumberValue, StringValue } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { convertValue } from '../src/bases';
import { FakeErrorValue } from './bases-helpers';

const s = (text: string) => new StringValue(text);

describe('convertValue', () => {
  it('gives one value per list element', () => {
    expect(convertValue(new ListValue([s('network'), s('quantitative')]))).toEqual({
      kind: 'values',
      values: ['network', 'quantitative'],
    });
  });

  it('gives one value for a text value, trimmed and with collapsed whitespace', () => {
    expect(convertValue(s('  node   link\tdiagram '))).toEqual({ kind: 'values', values: ['node link diagram'] });
  });

  it('uses toString for other values', () => {
    expect(convertValue(new NumberValue(3))).toEqual({ kind: 'values', values: ['3'] });
  });

  it('makes null, NullValue, empty text and empty list unannotated', () => {
    for (const value of [null, NullValue.value, s(''), s('   '), new ListValue([])]) {
      expect(convertValue(value)).toEqual({ kind: 'unannotated' });
    }
  });

  it('drops null and empty list elements; a list with only such elements is unannotated', () => {
    expect(convertValue(new ListValue([s(''), NullValue.value, s('tree')]))).toEqual({ kind: 'values', values: ['tree'] });
    expect(convertValue(new ListValue([s(' '), NullValue.value, new ListValue([])]))).toEqual({ kind: 'unannotated' });
  });

  it('flattens nested lists', () => {
    const nested = new ListValue([s('tree'), new ListValue([s('dag'), new ListValue([s('graph')])])]);
    expect(convertValue(nested)).toEqual({ kind: 'values', values: ['tree', 'dag', 'graph'] });
  });

  it('gives an error for an error value, also inside a list', () => {
    expect(convertValue(new FakeErrorValue('Unknown function'))).toEqual({ kind: 'error', message: 'Unknown function' });
    expect(convertValue(new ListValue([s('tree'), new FakeErrorValue('Bad')]))).toEqual({ kind: 'error', message: 'Bad' });
  });

  it('uses the display text of a link, else the target, without brackets', () => {
    expect(convertValue(new LinkValue('[[Graph theory|graph]]'))).toEqual({ kind: 'values', values: ['graph'] });
    expect(convertValue(new LinkValue('[[Graph theory]]'))).toEqual({ kind: 'values', values: ['Graph theory'] });
    expect(convertValue(new ListValue([new LinkValue('[[Matrix]]')]))).toEqual({ kind: 'values', values: ['Matrix'] });
  });
});
