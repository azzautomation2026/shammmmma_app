
import { createClient } from '@supabase/supabase-js';

// بيانات الاعتماد المزودة من قبل المستخدم
const supabaseUrl = 'https://rcqlfhdgiyhreonjfdxo.supabase.co';
const supabaseAnonKey = 'sb_publishable_CHE6U2TlPCn54c3cn4Nd2g_FnI4wHQo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
