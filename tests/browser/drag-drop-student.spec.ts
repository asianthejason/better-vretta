import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

for (const grouped of [true, false]) test(`student drag choices move between targets and return to ${grouped ? 'grouped' : 'ungrouped'} lineup`, async ({ page }) => {
  const result = await build({ stdin: { contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Student from './app/student/[id]/DragDropQuestion';
  const data={preset:'locations',choiceBankGrouped:${grouped},items:[{id:'a',content:'Alpha'},{id:'b',content:'Beta'}],zones:[{id:'one',capacity:1,label:'One',correctItemIds:['a']},{id:'two',capacity:1,label:'Two',correctItemIds:['b']}],settings:{shuffleItems:false,allowReuse:false,showZoneOutlines:true}};
  function App(){const[p,setP]=useState({});return <><Student data={data} placements={p} onChange={setP}/><output>{JSON.stringify(p)}</output></>}createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader:'tsx' }, bundle:true, write:false, platform:'browser',format:'esm',outfile:'/tmp/student-drag.js' });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({type:'module',content:result.outputFiles.find(f=>f.path.endsWith('.js'))!.text});
  const drop = async (id: string, selector: string) => {
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await transfer.evaluate((value, item) => value.setData('text/plain', item), id);
    await page.locator(selector).dispatchEvent('drop', {dataTransfer:transfer});
  };
  await drop('a','[aria-label="Target 1"]');
  await expect(page.locator('output')).toHaveText('{"one":["a"]}');
  await expect(page.getByRole('button',{name:'×',exact:true})).toHaveCount(0);
  if (grouped) await expect(page.locator('[data-choice-slot="a"]')).toHaveCount(0);
  else await expect(page.locator('[data-choice-slot="a"] button')).toHaveAccessibleName(/Return selected choice/);
  await drop('a','[aria-label="Target 2"]');
  await expect(page.locator('output')).toHaveText('{"one":[],"two":["a"]}');
  await drop('b','[aria-label="Target 2"]');
  await expect(page.locator('output')).toHaveText('{"one":[],"two":["b"]}');
  await expect(page.locator('[data-choice-slot="a"] button')).toHaveAccessibleName('Alpha');
  const placed = page.getByRole('button', {name:'Beta',exact:true});
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await placed.dispatchEvent('dragstart', {dataTransfer:transfer});
  await placed.dispatchEvent('dragend', {dataTransfer:transfer});
  await expect(page.locator('output')).toHaveText('{"one":[],"two":[]}');
  await expect(page.locator('[data-choice-slot="b"] button')).toHaveAccessibleName('Beta');
});
