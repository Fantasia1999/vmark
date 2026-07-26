/*---------------------------------------------------------------------------------------------
 *  Derived from VS Code extensions/markdown-language-features/src/slugify.ts
 *  Copyright (c) Microsoft Corporation. MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface ISlug {
  readonly value: string;
  equals(other: ISlug): boolean;
}

export class GithubSlug implements ISlug {
  public constructor(public readonly value: string) {}

  public equals(other: ISlug): boolean {
    return other instanceof GithubSlug && this.value.toLowerCase() === other.value.toLowerCase();
  }
}

export interface SlugBuilder {
  add(headingText: string): ISlug;
}

export interface ISlugifier {
  fromHeading(headingText: string): ISlug;
  fromFragment(fragmentText: string): ISlug;
  createBuilder(): SlugBuilder;
}

/**
 * Approximates GitHub heading slug generation.
 * Full VS Code regex is very large; this covers common Latin / CJK cases.
 */
export const githubSlugifier: ISlugifier = {
  fromHeading(heading: string): ISlug {
    const slugifiedHeading = heading
      .trim()
      .toLowerCase()
      // Remove punctuation-ish characters (keep letters, numbers, spaces, hyphens, CJK)
      .replace(/[^\p{L}\p{N}\p{M}\s\-_]/gu, '')
      .replace(/\s+/g, '-');
    return new GithubSlug(slugifiedHeading);
  },

  fromFragment(fragmentText: string): ISlug {
    return new GithubSlug(fragmentText.toLowerCase());
  },

  createBuilder() {
    const entries = new Map<string, { count: number }>();
    return {
      add: (heading: string): ISlug => {
        const slug = this.fromHeading(heading);
        const existing = entries.get(slug.value);
        if (existing) {
          let candidate: string;
          do {
            candidate = `${slug.value}-${++existing.count}`;
          } while (entries.has(candidate));
          entries.set(candidate, { count: 0 });
          return new GithubSlug(candidate);
        }
        entries.set(slug.value, { count: 0 });
        return slug;
      },
    };
  },
};
