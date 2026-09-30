import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const sb = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
