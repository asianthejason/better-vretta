import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

test('fraction control adds a whole number and preserves the fraction when toggled off', async ({ page }) => {
  const result = await build({ stdin: { contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Composer from './app/teacher/assessments/[id]/MathExpressionComposer';import{createEmptyMathExpression}from'./lib/mathExpressionTree';function App(){const[value,setValue]=useState(createEmptyMathExpression());return <Composer value={value} onChange={setValue} onCommit={()=>{}}/>}createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader:'tsx' }, bundle:true, write:false, platform:'browser',format:'esm',outfile:'/tmp/mixed-fraction.js' });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ type:'module', content:result.outputFiles.find(file=>file.path.endsWith('.js'))!.text });
  await page.getByRole('button', { name:'a⁄b', exact:true }).click();
  await page.getByRole('checkbox', { name:'Mixed fraction' }).check();
  await expect(page.getByRole('button', { name:'Insert notation' })).toBeDisabled();
  await page.getByRole('textbox').fill('3');
  await page.getByRole('button', { name:'numerator', exact:true }).click();
  await page.getByRole('textbox').fill('1');
  await page.getByRole('button', { name:'denominator', exact:true }).click();
  await page.getByRole('textbox').fill('2');
  await expect(page.getByRole('button', { name:'Insert notation' })).toBeEnabled();
  const preview=page.getByLabel('Math notation preview');
  await expect(preview.locator('mtext')).toHaveText(['3','1','2']);
  await page.getByRole('checkbox', { name:'Mixed fraction' }).uncheck();
  await expect(preview.locator('mtext')).toHaveText(['1','2']);
});
