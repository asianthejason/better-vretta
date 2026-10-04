import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

test('blank input stays at its saved position at editor and split preview widths', async ({ page }) => {
  const result = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Field from './app/components/CanvasFillBlankField'; function App(){return <div id="canvas" style={{lineHeight:"24px",width:1000,height:562.5,containerType:"inline-size",position:"relative"}}><div id="bounds" style={{position:"absolute",left:"16%",top:"25%",width:"7%",height:"4%"}}><Field blank={{id:"blank",inputMode:"text"}} preview/></div></div>} createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle:true, write:false, format:'iife', jsx:'automatic' });
  await page.goto('/');
  const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  const css = await Promise.all(sheets.map(async url => (await page.request.get(url)).text()));
  await page.goto('about:blank');
  await page.setContent('<div id="root"></div>');
  for (const content of css) await page.addStyleTag({content});
  await page.addScriptTag({content:result.outputFiles[0].text});
  for (const width of [1000, 500, 400]) {
    await page.locator('#canvas').evaluate((node, width) => { Object.assign((node as HTMLElement).style, {width: `${width}px`, height: `${width * .5625}px`}); }, width);
    const bounds=(await page.locator('#bounds').boundingBox())!;
    const input=(await page.getByRole('textbox').boundingBox())!;
    expect(input.y).toBeCloseTo(bounds.y, 1);
    expect(input.height).toBeCloseTo(bounds.height, 1);
  }
});
