import OpenAI from 'openai';
import { config } from './config.js';

const client = new OpenAI({ apiKey: config.translateKey, baseURL: config.translateBaseUrl, maxRetries: 6, timeout: 3 * 60_000 });
const models = [config.translateModel, ...config.translateFallbacks].filter((m, i, a) => a.indexOf(m) === i);
let active = 0; // index of the model that last worked

const modelMissing = (e: any) =>
  e?.status === 404 || e?.code === 'model_not_found' || /does not exist|not have access|model_not_found|decommissioned/i.test(String(e?.message ?? ''));

async function once(model: string, messages: OpenAI.Chat.ChatCompletionMessageParam[], json: boolean, temperature: number): Promise<string> {
  const body: any = { model, temperature, messages };
  if (json) body.response_format = { type: 'json_object' };
  if (config.translateReasoningEffort && /gpt-oss/.test(model)) body.reasoning_effort = config.translateReasoningEffort;
  const res = await client.chat.completions.create(body);
  return res.choices[0]?.message?.content ?? '';
}

/** Chat completion with automatic model fallback and a retry without JSON mode when the provider rejects it. */
export async function chat(messages: OpenAI.Chat.ChatCompletionMessageParam[], opts: { json?: boolean; temperature?: number } = {}): Promise<string> {
  const temperature = opts.temperature ?? 0.2;
  let lastErr: any;
  for (let i = active; i < models.length; i++) {
    try {
      let out: string;
      try {
        out = await once(models[i], messages, !!opts.json, temperature);
      } catch (e: any) {
        if (opts.json && (e?.status === 400 || e?.status === 422) && !modelMissing(e)) out = await once(models[i], messages, false, temperature);
        else throw e;
      }
      if (i !== active) console.warn(`[llm] switched to model ${models[i]}`);
      active = i;
      return out;
    } catch (e: any) {
      lastErr = e;
      if (modelMissing(e) && i < models.length - 1) { console.warn(`[llm] model ${models[i]} unavailable (${e?.status ?? ''} ${String(e?.message ?? '').slice(0, 120)}), trying ${models[i + 1]}`); continue; }
      throw e;
    }
  }
  throw lastErr;
}
