/**
 * Document outline (TOC) from rendered Markdown headings.
 */

export interface OutlineItem {
  level: number; // 1–6
  text: string;
  id: string;
}

/**
 * Collect h1–h6 from a rendered markdown root (uses id attrs set by the engine).
 */
export function extractOutlineFromDom(root: ParentNode): OutlineItem[] {
  const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const items: OutlineItem[] = [];
  for (const el of headings) {
    if (!(el instanceof HTMLElement)) {
      continue;
    }
    const level = Number(el.tagName.slice(1));
    if (level < 1 || level > 6) {
      continue;
    }
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) {
      continue;
    }
    let id = el.id;
    if (!id) {
      id = `heading-${items.length}`;
      el.id = id;
    }
    items.push({ level, text, id });
  }
  return items;
}

export interface OutlineRenderOptions {
  activeId?: string;
  onNavigate: (id: string) => void;
  emptyText?: string;
}

import { t } from '../shared/i18n/index';

/**
 * Render a flat indented outline list into container.
 */
export function renderOutline(
  container: HTMLElement,
  items: OutlineItem[],
  options: OutlineRenderOptions,
): void {
  container.replaceChildren();
  container.classList.add('md-outline');

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'md-outline-empty';
    empty.textContent = options.emptyText ?? t('outline.empty');
    container.appendChild(empty);
    return;
  }

  const minLevel = Math.min(...items.map((i) => i.level));
  const ul = document.createElement('ul');
  ul.className = 'md-outline-list';
  ul.setAttribute('role', 'tree');

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'md-outline-item';
    li.dataset.id = item.id;
    li.dataset.level = String(item.level);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-outline-link';
    // Compact indent: 8px per level past min
    btn.style.paddingLeft = `${6 + (item.level - minLevel) * 8}px`;
    btn.title = item.text;
    btn.textContent = item.text;
    if (options.activeId && options.activeId === item.id) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => options.onNavigate(item.id));

    li.appendChild(btn);
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

export function setOutlineActive(container: HTMLElement, activeId: string | undefined): void {
  for (const btn of container.querySelectorAll('.md-outline-link')) {
    btn.classList.toggle(
      'active',
      (btn.parentElement as HTMLElement | null)?.dataset.id === activeId,
    );
  }
}

/**
 * Observe which heading is currently in view; calls onChange with its id.
 */
export function createOutlineScrollSpy(
  scrollRoot: Element,
  headingIds: string[],
  onChange: (id: string | undefined) => void,
): () => void {
  if (!headingIds.length) {
    onChange(undefined);
    return () => undefined;
  }

  const elements = headingIds
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => !!el);

  if (!elements.length) {
    return () => undefined;
  }

  let current: string | undefined;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target instanceof HTMLElement && visible[0].target.id) {
        const id = visible[0].target.id;
        if (id !== current) {
          current = id;
          onChange(id);
        }
        return;
      }
      const rootRect = scrollRoot.getBoundingClientRect();
      let best: { id: string; top: number } | undefined;
      for (const el of elements) {
        const top = el.getBoundingClientRect().top - rootRect.top;
        if (top <= 48) {
          if (!best || top > best.top) {
            best = { id: el.id, top };
          }
        }
      }
      const next = best?.id;
      if (next !== current) {
        current = next;
        onChange(next);
      }
    },
    {
      root: scrollRoot === document.documentElement ? null : scrollRoot,
      rootMargin: '-10% 0px -70% 0px',
      threshold: [0, 0.1, 1],
    },
  );

  for (const el of elements) {
    observer.observe(el);
  }

  return () => observer.disconnect();
}
