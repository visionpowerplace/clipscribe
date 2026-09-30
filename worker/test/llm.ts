import http from 'node:http';
import assert from 'node:assert/strict';
const srv = http.createServer((req, res) => {
  let b = ''; req.on('data', d => b += d); req.on('end', () => {
    const { model } = JSON.parse(b);
    res.setHeader('content-type', 'application/json');
    if (model === 'bad-model') { res.statusCode = 404; return res.end(JSON.stringify({ error: { message: `The model \`${model}\` does not exist or you do not have access to it.`, code: 'model_not_found' } })); }
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok:' + model } }] }));
  });
});
await new Promise<void>(r => srv.listen(0, r));
const port = (srv.address() as any).port;
process.env.SUPABASE_URL ||= 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
process.env.OPENAI_API_KEY = 'x';
process.env.TRANSLATE_API_KEY = 'x';
process.env.TRANSLATE_BASE_URL = `http://127.0.0.1:${port}/v1`;
process.env.TRANSLATE_MODEL = 'bad-model';
process.env.TRANSLATE_MODEL_FALLBACKS = 'good-model';
const { chat } = await import('../src/llm.js');
assert.equal(await chat([{ role: 'user', content: 'hi' }]), 'ok:good-model');
assert.equal(await chat([{ role: 'user', content: 'hi' }], { json: true }), 'ok:good-model');
console.log('llm fallback OK');
srv.close();
