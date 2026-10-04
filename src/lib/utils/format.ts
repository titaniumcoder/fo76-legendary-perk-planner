const nf = new Intl.NumberFormat('en-US');

export const fmt = (n: number): string => nf.format(n);

export const stars = (rank: number, max = 4): string => '★'.repeat(rank) + '☆'.repeat(Math.max(0, max - rank));
