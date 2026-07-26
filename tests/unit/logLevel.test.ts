import { describe, it, expect } from 'vitest'
import { LogLevel, parseLogLevel, resolveConfiguredLevel } from '../../shared/logCore'

describe('parseLogLevel', () => {
  it('parses the named levels', () => {
    expect(parseLogLevel('trace')).toBe(LogLevel.TRACE)
    expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG)
    expect(parseLogLevel('warning')).toBe(LogLevel.WARNING)
    expect(parseLogLevel('warn')).toBe(LogLevel.WARNING)
    expect(parseLogLevel('error')).toBe(LogLevel.ERROR)
  })

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(parseLogLevel('TRACE')).toBe(LogLevel.TRACE)
    expect(parseLogLevel('  Error ')).toBe(LogLevel.ERROR)
    expect(parseLogLevel('Warn')).toBe(LogLevel.WARNING)
  })

  it('parses in-range numeric strings', () => {
    expect(parseLogLevel('0')).toBe(LogLevel.TRACE)
    expect(parseLogLevel('1')).toBe(LogLevel.DEBUG)
    expect(parseLogLevel('2')).toBe(LogLevel.WARNING)
    expect(parseLogLevel('3')).toBe(LogLevel.ERROR)
  })

  it('rejects out-of-range and non-integer numbers', () => {
    expect(parseLogLevel('4')).toBeNull()
    expect(parseLogLevel('-1')).toBeNull()
    expect(parseLogLevel('1.5')).toBeNull()
  })

  it('rejects unknown, empty, and undefined input', () => {
    expect(parseLogLevel('verbose')).toBeNull()
    expect(parseLogLevel('foo')).toBeNull()
    expect(parseLogLevel('')).toBeNull()
    expect(parseLogLevel('   ')).toBeNull()
    expect(parseLogLevel(undefined)).toBeNull()
  })
})

describe('resolveConfiguredLevel', () => {
  it('defaults to ERROR when nothing is configured', () => {
    expect(resolveConfiguredLevel()).toBe(LogLevel.ERROR)
    expect(resolveConfiguredLevel({})).toBe(LogLevel.ERROR)
    expect(resolveConfiguredLevel({ explicitLevels: [undefined, ''] })).toBe(LogLevel.ERROR)
  })

  it('honors an explicit level', () => {
    expect(resolveConfiguredLevel({ explicitLevels: ['debug'] })).toBe(LogLevel.DEBUG)
    expect(resolveConfiguredLevel({ explicitLevels: ['trace'] })).toBe(LogLevel.TRACE)
  })

  it('uses the first parseable explicit level in precedence order', () => {
    expect(resolveConfiguredLevel({ explicitLevels: [undefined, 'warn', 'debug'] })).toBe(LogLevel.WARNING)
    expect(resolveConfiguredLevel({ explicitLevels: ['nonsense', 'error'] })).toBe(LogLevel.ERROR)
  })

  it('falls back to DEBUG when a legacy boolean flag is truthy', () => {
    expect(resolveConfiguredLevel({ legacyFlags: ['true'] })).toBe(LogLevel.DEBUG)
    expect(resolveConfiguredLevel({ legacyFlags: ['0', 'on'] })).toBe(LogLevel.DEBUG)
  })

  it('prefers an explicit level over a legacy flag', () => {
    expect(resolveConfiguredLevel({ explicitLevels: ['warning'], legacyFlags: ['true'] })).toBe(LogLevel.WARNING)
  })

  it('ignores falsey legacy flags', () => {
    expect(resolveConfiguredLevel({ legacyFlags: ['false', '0', undefined] })).toBe(LogLevel.ERROR)
  })
})
