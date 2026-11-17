import { describe, expect, it, vi } from 'vitest';

// A render-local cache test double; real request dedup is also measured against next start.
vi.mock('react', () => ({ cache: (fn: (slug: string) => unknown) => {
  const render = new Map();
  return (slug: string) => { if (!render.has(slug)) render.set(slug, fn(slug)); return render.get(slug); };
} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/lib/api', () => ({ getPublicMenu: vi.fn(async (slug: string) => ({ restaurant: { slug } })), isPublicMenuNotFoundError: () => false }));
import { getPublicMenu } from '@/lib/api';
import { getPublicMenuOrNotFound } from '@/lib/public-menu-page';

describe('public page/metadata canonical read', () => {
  it('shares one promise between page/metadata; partitions restaurants', async () => {
    const page = getPublicMenuOrNotFound('a');
    const metadata = getPublicMenuOrNotFound('a');
    expect(page).toBe(metadata);
    expect((await getPublicMenuOrNotFound('b')).restaurant.slug).toBe('b');
    expect(getPublicMenu).toHaveBeenCalledTimes(2);
    expect(getPublicMenu).toHaveBeenCalledWith('a');
  });
});
