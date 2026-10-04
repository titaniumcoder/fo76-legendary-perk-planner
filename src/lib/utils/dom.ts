/** hide a broken <img> so the styled parent (fallback card) shows through */
export function hideImg(e: Event): void {
  const el = e.currentTarget as HTMLElement | null;
  if (el) el.style.display = 'none';
}
