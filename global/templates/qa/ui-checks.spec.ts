// Mechanical UI floor for every UI slice. Copy to e2e/ui-checks.spec.ts.
// BASE_URL=http://127.0.0.1:3000 UI_ROUTES=/,/_kit npx playwright test e2e/ui-checks.spec.ts
// Fails on: horizontal overflow, touch targets under 44px on touch viewports.
// Screenshots land in qa/evidence/ui/ for comparison with design/layout.md and
// design/mocks/core.html; judging them is QA's job, not this script's.
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const ROUTES = (process.env.UI_ROUTES ?? '/,/_kit').split(',').map((r) => r.trim()).filter(Boolean);
const VIEWPORTS = [
  { width: 390, height: 844, touch: true },
  { width: 768, height: 1024, touch: true },
  { width: 1440, height: 900, touch: false },
  { width: 1920, height: 1080, touch: false },
];
const MIN_TARGET = 44;

async function overflowCulprits(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= limit + 1) return [];
    return [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.right > limit + 1 && getComputedStyle(el).position !== 'fixed';
      })
      .slice(0, 10)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${[...el.classList].slice(0, 3).map((c) => '.' + c).join('')} right=${Math.round(el.getBoundingClientRect().right)}`);
  });
}

async function smallTargets(page: Page, min: number) {
  return page.evaluate((min) => {
    const selector = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch]';
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .map((el) => {
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return null;
        // Inline links inside running text are exempt (WCAG 2.5.8 inline exception).
        if (el.tagName === 'A' && style.display === 'inline' && el.parentElement && /^(P|LI|SPAN|TD)$/.test(el.parentElement.tagName)) return null;
        let box = el.getBoundingClientRect();
        const input = el as HTMLInputElement;
        if ((input.type === 'checkbox' || input.type === 'radio') && input.labels?.length) {
          box = input.labels[0].getBoundingClientRect();
        }
        if (box.width <= 1 || box.height <= 1) return null; // visually hidden
        if (box.width >= min && box.height >= min) return null;
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30);
        return `${el.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`;
      })
      .filter(Boolean);
  }, min);
}

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`${route} @ ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(new URL(route, BASE_URL).toString(), { waitUntil: 'networkidle' });
      expect(response?.ok(), `HTTP status for ${route}`).toBeTruthy();
      const slug = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
      await page.screenshot({ path: `qa/evidence/ui/${slug}-${viewport.width}.png`, fullPage: true });
      expect(await overflowCulprits(page), 'horizontal overflow (elements past the right edge)').toEqual([]);
      if (viewport.touch) {
        expect(await smallTargets(page, MIN_TARGET), `touch targets under ${MIN_TARGET}px`).toEqual([]);
      }
    });
  }
}
