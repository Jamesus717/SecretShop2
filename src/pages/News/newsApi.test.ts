import { describe, expect, it } from 'vitest';
import { youtubeId } from './newsApi';

describe('youtubeId', () => {
  it('accepts bare ids and the common link forms', () => {
    expect(youtubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('null for empty, undefined for non-YouTube', () => {
    expect(youtubeId('  ')).toBeNull();
    expect(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined();
    expect(youtubeId('nonsense')).toBeUndefined();
  });
});
