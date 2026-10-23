import { describe, expect, it } from 'vitest';
import { parseCommandLine, repoNameFromUrl, shortSha } from './commands';

describe('parseCommandLine', () => {
  it('splits simple commands on whitespace', () => {
    expect(parseCommandLine('add -A')).toEqual(['add', '-A']);
    expect(parseCommandLine('  status   --short ')).toEqual(['status', '--short']);
  });

  it('keeps quoted arguments as one token', () => {
    expect(parseCommandLine('commit -m "Hi all" ')).toEqual(['commit', '-m', 'Hi all']);
    expect(parseCommandLine("config user.name 'Josiah Laster'")).toEqual(['config', 'user.name', 'Josiah Laster']);
  });

  it('handles adjacent quotes and mixed content', () => {
    // Like a shell: an unquoted space splits words even right after a quoted span.
    expect(parseCommandLine('commit -m "fix: the"boss bug"')).toEqual(['commit', '-m', 'fix: theboss', 'bug']);
    expect(parseCommandLine('checkout  "origin/main" ')).toEqual(['checkout', 'origin/main']);
  });

  it('returns empty for blank input and flushes unclosed quotes leniently', () => {
    expect(parseCommandLine('   ')).toEqual([]);
    expect(parseCommandLine('git clone https://github.com/a/b.git')).toEqual(['git', 'clone', 'https://github.com/a/b.git']);
    expect(parseCommandLine('commit -m "unterminated')).toEqual(['commit', '-m', 'unterminated']);
  });
});

describe('repoNameFromUrl', () => {
  it('derives the name from common URL shapes', () => {
    expect(repoNameFromUrl('https://github.com/owner/OpenBOR-Workbench.git')).toBe('OpenBOR-Workbench');
    expect(repoNameFromUrl('https://github.com/owner/OpenBOR-Workbench')).toBe('OpenBOR-Workbench');
    expect(repoNameFromUrl('git@github.com:owner/OpenBOR-Workbench.git')).toBe('OpenBOR-Workbench');
    expect(repoNameFromUrl('https://gitlab.com/group/subgroup/project')).toBe('project');
  });

  it('rejects URLs without a usable name instead of inventing junk', () => {
    expect(() => repoNameFromUrl('https://')).toThrow();
    expect(() => repoNameFromUrl('   ')).toThrow();
  });
});

describe('shortSha', () => {
  it('abbreviates a commit SHA', () => {
    expect(shortSha('1234567890abcdef')).toBe('12345678');
  });
});
