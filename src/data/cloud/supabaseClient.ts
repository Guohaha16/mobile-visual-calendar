import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export interface SupabaseEnvironment {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export interface SupabaseBrowserClientOptions {
  auth: {
    autoRefreshToken: true;
    detectSessionInUrl: true;
    persistSession: true;
  };
}

export type SupabaseClientFactory = (
  url: string,
  anonKey: string,
  options: SupabaseBrowserClientOptions,
) => SupabaseClient;

export interface CreateSupabaseClientOptions {
  env?: SupabaseEnvironment;
  factory?: SupabaseClientFactory;
}

const browserClientOptions: SupabaseBrowserClientOptions = {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
};

const defaultFactory: SupabaseClientFactory = (url, anonKey, options) =>
  createClient(url, anonKey, options);

export const createSupabaseClient = ({
  env,
  factory = defaultFactory,
}: CreateSupabaseClientOptions = {}): SupabaseClient | undefined => {
  const effectiveEnv = env ?? {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
  const url = effectiveEnv.VITE_SUPABASE_URL?.trim();
  const anonKey = effectiveEnv.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return undefined;
  }

  return factory(url, anonKey, browserClientOptions);
};
