import { describe, expect, it } from 'vitest';

import { parseCliArgs } from './cli.ts';
import { ConfigurationError } from './errors.ts';

describe('parseCliArgs', () => {
  it('shows help with no arguments or --help', () => {
    expect(parseCliArgs([])).toEqual({ command: 'help' });
    expect(parseCliArgs(['run', 'fixture', '--help'])).toEqual({ command: 'help' });
  });

  it.each([
    [['run', 'fixture'], 'full', null],
    [['run', 'fixture', '--mode', 'delta'], 'delta', null],
    [['run', 'fixture', '--sample', '10'], 'sample', 10],
    [['run', 'fixture', '--dry-run'], 'dry_run', null],
    [['run', 'fixture', '--sample', '10', '--dry-run'], 'dry_run', 10],
  ] as const)('%j → %s', (argv, mode, sampleSize) => {
    expect(parseCliArgs([...argv])).toEqual({
      command: 'run',
      sourceKey: 'fixture',
      mode,
      sampleSize,
    });
  });

  it.each([
    [['sync', 'fixture'], /Unknown command/],
    [['run'], /Missing the source key/],
    [['run', 'a', 'b'], /Unexpected arguments/],
    [['run', 'fixture', '--sample', '0'], /positive whole number/],
    [['run', 'fixture', '--sample', '2.5'], /positive whole number/],
    [['run', 'fixture', '--mode', 'sample'], /full or delta/],
    [['run', 'fixture', '--mode', 'full', '--dry-run'], /cannot be combined/],
    [['run', 'fixture', '--mode', 'delta', '--sample', '5'], /cannot be combined/],
    [['run', 'fixture', '--verbose'], /Unknown option/],
  ])('%j is refused', (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(ConfigurationError);
    expect(() => parseCliArgs(argv)).toThrow(message);
  });
});
