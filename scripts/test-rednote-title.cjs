const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function load(file, mocks = {}, extra = '') {
  const source = fs.readFileSync(file, 'utf8') + extra;
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { exports: module.exports, module, require: id => id in mocks ? mocks[id] : require(id), console, process, Buffer, Response, structuredClone }, { filename: file });
  return module.exports;
}
const variants = load('lib/content-variants.ts');
const slides = load('lib/rednote-slides.ts');
const editor = load('components/editor-view.tsx', {
  '@/lib/linkedin-url': {}, '@/lib/content-variants': variants,
  './clipboard': {}, './icons': {}, './mock-data': {},
}, '\nexport { withSelectedRedNoteTitle };');
const spec = { role: 'cover', kind: 'text', text: { title: 'Old title' }, background: { type: 'solid' } };
const original = { recommended: true, titleOptions: ['Old title', 'Chosen title'], selectedTitleIndex: 0, carouselSlides: [ { slideNumber: 1, spec }, { slideNumber: 2, spec: { ...spec, role: 'body', text: { title: 'Body headline' } } } ] };
const chosen = editor.withSelectedRedNoteTitle(original, 1);
assert.equal(chosen.selectedTitleIndex, 1);
assert.equal(chosen.carouselSlides[0].spec.text.title, 'Chosen title');
assert.equal(chosen.carouselSlides[1].spec.text.title, 'Body headline');
assert.equal(original.carouselSlides[0].spec.text.title, 'Old title');
assert.equal(editor.withSelectedRedNoteTitle(original, 99).selectedTitleIndex, 1);
assert.equal(editor.withSelectedRedNoteTitle({ ...original, titleOptions: undefined, title: 'Legacy title' }, 0).carouselSlides[0].spec.text.title, 'Legacy title');

let stored = { ...chosen, selectedVariantId: 'v1', variants: [{ id: 'v1', content: original }], slideImages: [] };
const prompts = [];
const mocks = {
  '@/lib/content-variants': variants,
  '@/lib/rednote-slides': slides,
  '@/lib/supabase-admin': { supabaseAdmin: { from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { content: structuredClone(stored) } }) }) }),
    update: value => ({ eq: async () => { stored = value.content; return {}; } }),
  }) } },
  '@/lib/post-images': { uploadPostImage: async (_, key) => `https://example.test/${key}.png` },
  '@/lib/openrouter': {
    createOpenRouterImage: async ({ prompt }) => { prompts.push(prompt); return { buffer: Buffer.from('fake'), cost: 0 }; },
    createOpenRouterChatCompletion: async () => ({ ...spec, text: { title: 'Old title' } }),
    extractTextContent: value => value,
    parseJsonFromOpenRouterContent: value => value,
  },
};
const render = load('app/api/rednote/render/route.ts', mocks);
const feedback = load('app/api/rednote/slide-feedback/route.ts', mocks);
const request = body => ({ json: async () => body });
(async () => {
  let response = await render.POST(request({ generationId: 'test', slides: chosen.carouselSlides }));
  assert.equal(response.status, 200);
  assert.match(prompts[0], /Headline .*"Chosen title"/);
  assert.equal(stored.selectedTitleIndex, 1);
  assert.equal(stored.variants[0].content.selectedTitleIndex, 1);
  assert.equal(stored.variants[0].content.slideImages.length, 2);
  for (const slide of chosen.carouselSlides) {
    response = await feedback.POST(request({ generationId: 'test', slideNumber: slide.slideNumber, spec: slide.spec, comment: 'Make the font larger', selectedTitle: 'Chosen title', isCover: slide.slideNumber === 1 }));
    assert.equal(response.status, 200);
  }
  assert.equal(stored.selectedTitleIndex, 1);
  assert.equal(stored.carouselSlides[0].spec.text.title, 'Chosen title');
  assert.equal(stored.variants[0].content.carouselSlides[0].spec.text.title, 'Chosen title');
  assert.equal(stored.slideImages.length, 2);
  assert.match(prompts[2], /Headline .*"Chosen title"/);
  console.log('PASS: selected title drives rendering, survives feedback and variant persistence; other slide headlines and legacy titles are handled.');
})().catch(error => { console.error(error); process.exitCode = 1; });
