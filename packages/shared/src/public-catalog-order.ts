/** Both inputs are in merchant order. A missing public category goes at the end of All. */
export function indexPublicCatalog<T extends { category?: { slug?: string } | null; categorySlug?: string }>(
  products: readonly T[], categories: readonly { slug: string }[]
) {
  const categorySlugs = new Set(categories.map(category => category.slug));
  categorySlugs.delete("all");
  const byCategory = new Map<string | undefined, T[]>();
  const uncategorized: T[] = [];
  for (const product of products) {
    const slug = product.category?.slug ?? product.categorySlug;
    const group = byCategory.get(slug);
    if (group) group.push(product);
    else byCategory.set(slug, [product]);
    if (slug === undefined || !categorySlugs.has(slug)) uncategorized.push(product);
  }
  const ordered = Array.from(categorySlugs).flatMap(slug => byCategory.get(slug) ?? []).concat(uncategorized);
  return { byCategory, uncategorized, ordered };
}
