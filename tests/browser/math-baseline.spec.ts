import { expect, test } from '@playwright/test';
import { buildMathExpressionHtml, createMathText } from '../../lib/mathExpressionTree';

test('inline powers keep the base on the surrounding text baseline', async ({ page }) => {
  await page.goto('/');
  const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  const css = await Promise.all(sheets.map(async url => (await page.request.get(url)).text()));
  await page.goto('about:blank');
  const power = buildMathExpressionHtml({type:'superscript',id:'power',base:createMathText('3'),exponent:createMathText('7')});
  await page.setContent(`<div class="rich-text-content" style="font:22px Arial">Greater than <span id="plain">${buildMathExpressionHtml(createMathText('3'))}</span><span id="power">${power}</span>.<span id="baseline" style="display:inline-block;width:0;height:0"></span></div>`);
  for (const content of css) await page.addStyleTag({content});
  const math=page.locator('#power math');
  await expect(math).toHaveCSS('vertical-align','baseline');
  const base=(await page.locator('#power msup > mtext').first().boundingBox())!;
  const plain=(await page.locator('#plain mtext').boundingBox())!;
  const exponent=(await page.locator('#power msup > mtext').last().boundingBox())!;
  expect(base.y+base.height).toBeCloseTo(plain.y+plain.height,0);
  expect(exponent.y).toBeLessThan(base.y);
  const marker=(await page.locator('#baseline').boundingBox())!;
  const mathBounds=(await math.boundingBox())!;
  expect(Math.abs(mathBounds.y+mathBounds.height-marker.y)).toBeLessThan(10);
});
