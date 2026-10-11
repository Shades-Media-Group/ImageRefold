import { describe, expect, it } from 'vitest'
import { fileName, formatBytes, saving, uniqueNames, zipName } from './naming'

const px = { width: 2880, height: 1800 }

describe('fileName', () => {
  it('leaves 1x plain and marks other sizes', () => {
    expect(
      fileName('{name}{@size}', { name: 'Hero' }, { kind: 'scale', value: 1 }, px, 'webp'),
    ).toBe('Hero.webp')
    expect(
      fileName('{name}{@size}', { name: 'Hero' }, { kind: 'scale', value: 2 }, px, 'jpeg'),
    ).toBe('Hero@2x.jpg')
    expect(
      fileName('{name}{@size}', { name: 'Hero' }, { kind: 'width', value: 1200 }, px, 'avif'),
    ).toBe('Hero@1200w.avif')
  })

  it('fills every token', () => {
    expect(
      fileName(
        '{name}-{size}-{width}x{height}',
        { name: 'Card' },
        { kind: 'scale', value: 0.5 },
        px,
        'png',
      ),
    ).toBe('Card-0.5x-2880x1800.png')
  })

  it('keeps slashes as folders and drops characters files cannot hold', () => {
    expect(
      fileName('{name}', { name: 'Icons / Arrow: left?' }, { kind: 'scale', value: 1 }, px, 'png'),
    ).toBe('Icons/Arrow- left-.png')
    expect(fileName('{name}', { name: ' / ' }, { kind: 'scale', value: 1 }, px, 'png')).toBe(
      'image.png',
    )
  })
})

describe('uniqueNames', () => {
  it('numbers repeats, ignoring case', () => {
    expect(uniqueNames(['a.webp', 'A.webp', 'b.webp', 'a.webp'])).toEqual([
      'a.webp',
      'A-2.webp',
      'b.webp',
      'a-3.webp',
    ])
  })
})

describe('sizes', () => {
  it('formats bytes and savings', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(4_321)).toBe('4.3 KB')
    expect(formatBytes(412_000)).toBe('412 KB')
    expect(formatBytes(3_100_000)).toBe('3.1 MB')
    expect(saving(1000, 360)).toBe('−64%')
    expect(saving(1000, 1030)).toBe('+3%')
  })
})

describe('zipName', () => {
  it('names the archive after what is in it', () => {
    expect(zipName(['Hero', 'Hero'])).toBe('Hero.zip')
    expect(zipName(['Icons/Arrow', 'Icons/Close'])).toBe('Icons.zip')
    expect(zipName(['Hero', 'Cards/Promo', 'Footer'])).toBe('Hero and 2 more.zip')
    expect(zipName(['a:b'])).toBe('a-b.zip')
    expect(zipName(['  '])).toBe('images.zip')
  })
})
