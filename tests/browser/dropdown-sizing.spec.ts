import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

test('dropdown fits its widest option and keeps its width when selecting shorter answers', async ({ page }) => {
  const result = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Field from './app/components/CanvasDropdownField'; function App(){const [value,setValue]=React.useState('');return <div id="canvas" style={{height:200,width:1000,containerType:"inline-size"}}><Field ariaLabel="Answer" options={['A','A considerably longer dropdown answer']} value={value} onChange={setValue}/></div>} createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle:true, write:false, format:'iife', jsx:'automatic' });
  await page.goto('/');
  const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  const css = await Promise.all(sheets.map(async url => (await page.request.get(url)).text()));
  await page.goto('about:blank');
  await page.setContent('<div id="root"></div>');
  for (const content of css) await page.addStyleTag({content});
  await page.addScriptTag({content:result.outputFiles[0].text});
  const select=page.getByRole('combobox');
  const width=(await select.boundingBox())!.width;
  expect(width).toBeGreaterThan(250);
  await select.selectOption('A');
  expect((await select.boundingBox())!.width).toBe(width);
  await select.selectOption('A considerably longer dropdown answer');
  expect((await select.boundingBox())!.width).toBe(width);
  await page.locator('#canvas').evaluate(node => { (node as HTMLElement).style.width = '750px'; });
  const smaller = (await select.boundingBox())!.width;
  expect(Math.abs(smaller - width * 0.75)).toBeLessThan(2);
});
