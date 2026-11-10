import { describe, expect, it } from 'vitest';

import { parseCliArgs, runTrigger } from './cli.ts';
import { ConfigurationError } from './errors.ts';

describe('parseCliArgs', () => {
  it('shows help with no arguments or --help', () => {
    expect(parseCliArgs([])).toEqual({ command: 'help' });
    expect(parseCliArgs(['run', 'fixture', '--help'])).toEqual({ command: 'help' });
  });

  it.each([
    [['run', 'fixture'], 'full', null],
    [['run', 'fixture', '--mode', 'delta'], 'delta', null],
    [['run', 'fixture', '--mode', 'auto'], 'auto', null],
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

  it('parses export odbl', () => {
    expect(parseCliArgs(['export', 'odbl'])).toEqual({ command: 'export', target: 'odbl' });
  });

  it.each([
    [['export'], /Unknown export/],
    [['export', 'csv'], /Unknown export/],
    [['export', 'odbl', 'x'], /Unexpected arguments/],
    [['export', 'odbl', '--sample', '5'], /takes no options/],
    [['sync', 'fixture'], /Unknown command/],
    [['run'], /Missing the source key/],
    [['run', 'a', 'b'], /Unexpected arguments/],
    [['run', 'fixture', '--sample', '0'], /positive whole number/],
    [['run', 'fixture', '--sample', '2.5'], /positive whole number/],
    [['run', 'fixture', '--mode', 'sample'], /full, delta or auto/],
    [['run', 'fixture', '--mode', 'full', '--dry-run'], /cannot be combined/],
    [['run', 'fixture', '--mode', 'delta', '--sample', '5'], /cannot be combined/],
    [['run', 'fixture', '--mode', 'auto', '--sample', '5'], /cannot be combined/],
    [['run', 'fixture', '--verbose'], /Unknown option/],
  ])('%j is refused', (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(ConfigurationError);
    expect(() => parseCliArgs(argv)).toThrow(message);
  });
});

describe('runTrigger', () => {
  it.each([
    [{}, 'cli'],
    [{ GITHUB_EVENT_NAME: 'schedule' }, 'cli'],
    [{ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'schedule' }, 'schedule'],
    [{ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch' }, 'dispatch'],
    [{ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push' }, 'cli'],
  ] as const)('%j → %s', (env, trigger) => {
    expect(runTrigger({ ...env })).toBe(trigger);
  });
});
