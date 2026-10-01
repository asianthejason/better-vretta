import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

for (const sameSize of [false, true]) test(`nested powers stay inside option boxes (same size: ${sameSize})`, async ({page}) => {
  const result = await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Editor from './app/teacher/assessments/[id]/LocationCanvasEditor';import Canvas from './app/components/QuestionCanvas';import{buildMathExpressionHtml,createMathText}from'./lib/mathExpressionTree';
  const power=(base,exponent)=>({type:'superscript',id:Math.random().toString(),base,exponent:createMathText(exponent)});const brackets=(body,style)=>({type:'brackets',id:Math.random().toString(),body,style});
  const html=buildMathExpressionHtml(power(brackets(power(brackets(power(createMathText('3'),'10'),'parentheses'),'0'),'brackets'),'2'));
  const items=[{id:'a',content:'power',contentHtml:html},{id:'b',content:'Other'}];
  const data={preset:'locations',items,zones:[],settings:{},choiceBankGrouped:true,choiceBankX:8,choiceBankY:20,choiceSameSize:${sameSize},canvasHeight:76,canvasElements:[]};
  createRoot(document.getElementById('root')).render(<><section id="editor" style={{width:900}}><Editor choiceOnly choiceSelectionMode="multiple" data={data} onChange={()=>{}} uploadedImages={[]} itemPreviewUrls={{}} onItemImageFileChange={()=>{}} onChooseItemImage={()=>{}} onRemoveItemImage={()=>{}} onUploadBackground={async()=>({url:'',path:''})} onDeleteUploadedImage={()=>{}}/></section><section id="preview" style={{width:450}}><Canvas selectionMode="multiple" canvas={{version:2,canvasHeight:76,elements:[],choiceLayout:{grouped:true,sameSize:${sameSize},direction:'horizontal',presentation:'content',x:8,y:20,positions:[]}}} choices={items.map(item=>({text:item.content,html:item.contentHtml}))}/></section></>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',outfile:'/tmp/math-choice-fit.js'});
  await page.goto('/');
  const sheets=await page.locator('link[rel="stylesheet"]').evaluateAll(links=>links.map(link=>(link as HTMLLinkElement).href));
  await page.goto('about:blank');await page.setContent('<div id="root"></div>');
  for(const url of sheets) await page.addStyleTag({content:await(await page.request.get(url)).text()});
  await page.addScriptTag({type:'module',content:result.outputFiles.find(f=>f.path.endsWith('.js'))!.text});
  await expect(page.locator('#preview [data-preview-checkbox]')).toHaveCount(2);
  await expect(page.locator('#preview [data-preview-checkbox]').first()).toBeVisible();
  for(const selector of ['#editor [data-choice-item-id="a"]','#preview [aria-label="power"]']) {
    const box=page.locator(selector); await expect(box).toBeVisible();
    const bounds=(await box.boundingBox())!;
    const mathBounds=(await box.locator('math').boundingBox())!;
    const scale=await box.evaluate(node=>parseFloat(getComputedStyle(node).fontSize)/17);
    const markerSpace=28;
    expect(bounds.width-mathBounds.width).toBeLessThan((markerSpace+44)*scale);
    expect(bounds.height-mathBounds.height).toBeLessThan(40*scale);

    for(const node of await box.locator('math, math mtext, math mo').all()) {
      const content=(await node.boundingBox())!;
      expect(content.x).toBeGreaterThanOrEqual(bounds.x);
      expect(content.y).toBeGreaterThanOrEqual(bounds.y);
      expect(content.x+content.width).toBeLessThanOrEqual(bounds.x+bounds.width);
      expect(content.y+content.height).toBeLessThanOrEqual(bounds.y+bounds.height);
    }
  }
});
