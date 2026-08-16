import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type PhoneStatus = 'in_stock' | 'sold' | 'removed';
type DepositTo = 'cash' | 'bank';

export type Database = {
  public: {
    Tables: {
      phones: {
        Row: {
          id: string;
          model_id: string;
          model_name: string;
          storage: string;
          imei: string;
          battery_percent: number;
          condition: string;
          note: string | null;
          purchase_price: number;
          listed_value: number;
          status: PhoneStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          model_id: string;
          model_name: string;
          storage: string;
          imei: string;
          battery_percent: number;
          condition: string;
          note?: string | null;
          purchase_price: number;
          listed_value: number;
          status?: PhoneStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          model_id?: string;
          model_name?: string;
          storage?: string;
          imei?: string;
          battery_percent?: number;
          condition?: string;
          note?: string | null;
          purchase_price?: number;
          listed_value?: number;
          status?: PhoneStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          phone_id: string;
          model_id: string;
          model_name: string;
          storage: string | null;
          imei: string | null;
          buyer_name: string;
          purchase_price: number;
          sale_price: number;
          profit: number;
          deposit_to: DepositTo;
          sold_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          phone_id: string;
          model_id: string;
          model_name: string;
          storage?: string | null;
          imei?: string | null;
          buyer_name: string;
          purchase_price: number;
          sale_price: number;
          profit: number;
          deposit_to?: DepositTo;
          sold_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          phone_id?: string;
          model_id?: string;
          model_name?: string;
          storage?: string | null;
          imei?: string | null;
          buyer_name?: string;
          purchase_price?: number;
          sale_price?: number;
          profit?: number;
          deposit_to?: DepositTo;
          sold_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sales_phone_id_fkey';
            columns: ['phone_id'];
            isOneToOne: false;
            referencedRelation: 'phones';
            referencedColumns: ['id'];
          },
        ];
      };
      finance: {
        Row: {
          id: number;
          cash: number;
          bank: number;
          updated_at: string;
        };
        Insert: {
          id?: number;
          cash?: number;
          bank?: number;
          updated_at?: string;
        };
        Update: {
          id?: number;
          cash?: number;
          bank?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      history: {
        Row: {
          id: string;
          type: string;
          date: string;
          model_name: string;
          purchase_price: number | null;
          sale_price: number | null;
          profit: number | null;
          storage: string | null;
          imei: string | null;
          buyer_name: string | null;
          note: string | null;
          phone_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          date?: string;
          model_name: string;
          purchase_price?: number | null;
          sale_price?: number | null;
          profit?: number | null;
          storage?: string | null;
          imei?: string | null;
          buyer_name?: string | null;
          note?: string | null;
          phone_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          date?: string;
          model_name?: string;
          purchase_price?: number | null;
          sale_price?: number | null;
          profit?: number | null;
          storage?: string | null;
          imei?: string | null;
          buyer_name?: string | null;
          note?: string | null;
          phone_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'history_phone_id_fkey';
            columns: ['phone_id'];
            isOneToOne: false;
            referencedRelation: 'phones';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/** Env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY only (no secrets in frontend). */
export function getSupabaseAnonKey(): string | undefined {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return typeof anon === 'string' && anon.trim() ? anon.trim() : undefined;
}

export function getSupabaseUrl(): string | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL;
  return typeof url === 'string' && url.trim() ? url.trim() : undefined;
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return Boolean(url && key && !url.includes('YOUR_PROJECT'));
}

let client: SupabaseClient<Database> | null = null;

export function createSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error(
      'Brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Ustaw zmienne środowiskowe.',
    );
  }

  client = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      // Exchange OAuth ?code= into a persisted session (PKCE).
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return client;
}

export function getSupabaseClient(): SupabaseClient<Database> {
  return createSupabaseClient();
}

/**
 * Require a logged-in GitHub OAuth session.
 * Never uses anonymous auth or service_role.
 */
export async function ensureSupabaseAuth(
  supabase: SupabaseClient<Database> = createSupabaseClient(),
): Promise<Session> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(`Supabase auth session: ${error.message}`);
  }
  if (!data.session) {
    throw new Error('Brak sesji. Zaloguj się przez GitHub.');
  }
  return data.session;
}

export async function signInWithGitHub(
  redirectPath = '/magazyn',
): Promise<void> {
  const supabase = createSupabaseClient();
  const redirectTo = new URL(
    redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`,
    window.location.origin,
  ).toString();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo },
  });
  if (error) {
    throw new Error(`GitHub OAuth: ${error.message}`);
  }
}

export async function signOut(): Promise<void> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(`Wylogowanie: ${error.message}`);
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await createSupabaseClient().auth.getUser();
  if (error) return null;
  return data.user;
}

/** Strip OAuth query/hash params from the URL after session is established. */
export function clearOAuthUrlParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const sensitive = [
    'code',
    'state',
    'error',
    'error_description',
    'error_code',
  ];
  let changed = false;
  for (const key of sensitive) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (url.hash && /access_token|refresh_token|error/.test(url.hash)) {
    url.hash = '';
    changed = true;
  }
  if (changed) {
    window.history.replaceState({}, document.title, url.pathname + url.search);
  }
}
