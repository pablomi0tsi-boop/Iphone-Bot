import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(url && key && !String(url).includes('YOUR_PROJECT'));
}

let client: SupabaseClient<Database> | null = null;

export function createSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Brak VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Skopiuj .env.example → .env.',
    );
  }

  client = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}

/** Alias used by the repository layer. */
export function getSupabaseClient(): SupabaseClient<Database> {
  return createSupabaseClient();
}
