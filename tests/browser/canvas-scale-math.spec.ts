import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

for (const height of [56.25, 76, 120]) test(`${height} percent canvases scale boxed text and nested root fractions consistently`, async ({ page }) => {
  const result = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Canvas from './app/components/QuestionCanvas';import Editor from './app/teacher/assessments/[id]/LocationCanvasEditor';import{buildMathExpressionHtml,createMathText}from'./lib/mathExpressionTree';
  const tree={type:'root',id:'root',index:createMathText('2'),radicand:{type:'fraction',id:'frac',numerator:createMathText('p + q'),denominator:createMathText('2')}};
  const encoded=encodeURIComponent(JSON.stringify(tree));
  const old='<math data-math-expression="tree" data-math-tree="'+encoded+'"><mstyle><mrow><mo>√</mo><mrow data-radical-overline="true"><mfrac><mtext>p + q</mtext><mtext>2</mtext></mfrac></mrow></mrow></mstyle></math>';
  const canvas={version:2,canvasHeight:${height},elements:[{id:'prompt',type:'text',x:6,y:8,width:88,height:16,fontSize:22,textHtml:'<div data-text-box="true">The letters p and q in the expression '+old+' represent consecutive perfect square numbers.</div>'},{id:'instruction',type:'text',x:6,y:${Math.max(32,32*76/height)},width:88,height:12,fontSize:22,textHtml:'Identify the point that represents '+buildMathExpressionHtml(tree)}]};
  createRoot(document.getElementById('root')).render(<><section id="builder" style={{width:1000}}><Editor compositionOnly data={{preset:"locations",settings:{},items:[],zones:[],canvasHeight:canvas.canvasHeight,canvasElements:canvas.elements}} onChange={()=>{}} uploadedImages={[]} itemPreviewUrls={{}} onItemImageFileChange={()=>{}} onChooseItemImage={()=>{}} onRemoveItemImage={()=>{}} onUploadBackground={async()=>({url:"",path:""})} onDeleteUploadedImage={()=>{}}/></section><section id="large" style={{width:1000}}><Canvas canvas={canvas} className="border-0"/></section><section id="small" style={{width:450}}><Canvas canvas={canvas} className="border-0"/></section></>);`, resolveDir:process.cwd(), loader:'tsx' }, bundle:true,write:false,platform:'browser',format:'esm',outfile:'/tmp/canvas-scale-math.js' });
  await page.goto('/');
  const sheets=await page.locator('link[rel="stylesheet"]').evaluateAll(links=>links.map(link=>(link as HTMLLinkElement).href));
  await page.goto('about:blank');
  await page.setContent('<div id="root"></div>');
  for(const url of sheets) await page.addStyleTag({content:await(await page.request.get(url)).text()});
  await page.addScriptTag({type:'module',content:result.outputFiles.find(f=>f.path.endsWith('.js'))!.text});
  const sizes=[];
  for(const id of ['builder','large','small']) {
    const canvas=id === "builder" ? page.locator('#builder [aria-label^="Canvas editor"]') : page.locator(`#${id} > div`);
    const bounds=(await canvas.boundingBox())!;
    expect(bounds.height/bounds.width).toBeCloseTo(height/100,2);
    const box=(await canvas.locator('[data-text-box]').boundingBox())!;
    const instruction=(await canvas.locator('.rich-text-content').last().boundingBox())!;
    expect(instruction.y).toBeGreaterThan(box.y+box.height);
    sizes.push({boxHeight:box.height/bounds.width, instructionY:(instruction.y-bounds.y)/bounds.width});
    const fraction=canvas.locator('msqrt mfrac').first();
    await expect(fraction).toBeVisible();
    const numerator=(await fraction.locator('mtext').nth(0).boundingBox())!;
    const denominator=(await fraction.locator('mtext').nth(1).boundingBox())!;
    expect(denominator.y).toBeGreaterThan(numerator.y+numerator.height/2);
  }
  for (const size of sizes.slice(1)) {
    expect(sizes[0].boxHeight).toBeCloseTo(size.boxHeight,2);
    expect(sizes[0].instructionY).toBeCloseTo(size.instructionY,2);
  }
  if (height === 76) await page.locator('#large').screenshot({path:'/tmp/canvas-math-corrected.png'});
});
