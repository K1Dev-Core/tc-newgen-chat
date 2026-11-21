export type ProfileChoice = { id: string; name: string; description: string; imageUrl: string; alt: string };

const CACHE_KEY = 'tc-profile-catalog-cache-v1';

export function readProfileCatalogCache(): ProfileChoice[] | null {
  try {
    const value = window.localStorage.getItem(CACHE_KEY);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is ProfileChoice => Boolean(
      item && typeof item.id === 'string' && typeof item.name === 'string'
      && typeof item.description === 'string' && typeof item.imageUrl === 'string',
    ));
  } catch {
    return null;
  }
}

export function writeProfileCatalogCache(choices: ProfileChoice[]) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(choices));
  } catch {
    // Storage may be disabled or full; the live catalog still works without it.
  }
}
