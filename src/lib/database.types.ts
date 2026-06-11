export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          key: string
          value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      ltap_picking: {
        Row: {
          id: string
          batch_id: string | null
          warehouse_number: string | null
          tanum: string
          tapos: string
          material: string | null
          plant: string | null
          base_uom: string | null
          storage_unit_type: string | null
          confirmation_date: string | null
          confirmation_time: string | null
          picker_sap_id: string | null
          weight: number | null
          weight_unit: string | null
          source_storage_type: string | null
          source_storage_section: string | null
          source_storage_bin: string | null
          source_target_qty: number | null
          source_actual_qty: number | null
          source_bin_difference: number | null
          quant: string | null
          dest_storage_type: string | null
          dest_storage_bin: string | null
          dest_target_qty: number | null
          dest_actual_qty: number | null
          dest_difference_qty: number | null
          source_storage_unit: string | null
          removal_of_total_su: string | null
          volume: number | null
          volume_unit: string | null
          secondary_confirmation_date: string | null
          secondary_confirmation_time: string | null
          secondary_user: string | null
          handling_unit: string | null
          delivery: string | null
          confirmed_at: string | null
          secondary_confirmed_at: string | null
          created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
        Relationships: []
      }
      vekp_packing_headers: {
        Row: {
          id: string
          batch_id: string | null
          internal_hu_number: string
          handling_unit: string | null
          created_by: string | null
          created_at: string | null
          packer_sap_id: string | null
          packed_at: string | null
          packaging_material: string | null
          packaging_material_type: string | null
          total_weight: number | null
          weight_unit: string | null
          total_volume: number | null
          volume_unit: string | null
          delivery: string | null
          generated_item: string | null
          plant: string | null
          higher_level_hu: string | null
          external_tracking_id: string | null
          container_status: string | null
          movement_status: string | null
          row_created_at: string | null
        }
        Insert: { [key: string]: any }
        Update: { [key: string]: any }
        Relationships: []
      }
      import_batches: { Row: Record<string, any>, Insert: Record<string, any>, Update: Record<string, any>, Relationships: [] }
      vepo_packing_items: { Row: Record<string, any>, Insert: Record<string, any>, Update: Record<string, any>, Relationships: [] }
      likp_deliveries: { Row: Record<string, any>, Insert: Record<string, any>, Update: Record<string, any>, Relationships: [] }
      differences: { Row: Record<string, any>, Insert: Record<string, any>, Update: Record<string, any>, Relationships: [] }
      storage_inventory: { Row: Record<string, any>, Insert: Record<string, any>, Update: Record<string, any>, Relationships: [] }
      storage_history: { Row: Record<string, any>, Insert: Record<string, any>, Update: Record<string, any>, Relationships: [] }
      material_catalog: { Row: Record<string, any>, Insert: Record<string, any>, Update: Record<string, any>, Relationships: [] }
    }
    Functions: {
      get_delivery_detail: {
        Args: Record<string, any>
        Returns: any
      }
      get_pick_material_stats: {
        Args: Record<string, any>
        Returns: any
      }
      get_pack_material_stats: {
        Args: Record<string, any>
        Returns: any
      }
      get_daily_history: {
        Args: Record<string, any>
        Returns: any
      }
      get_daily_summary: {
        Args: Record<string, any>
        Returns: any
      }
      get_shift_summary: {
        Args: Record<string, any>
        Returns: any
      }
      get_operator_daily_summary: {
        Args: Record<string, any>
        Returns: any
      }
      get_shift_benchmarking_data: {
        Args: {
          p_start_date: string
          p_end_date: string
        }
        Returns: any
      }
      get_raw_picking: {
        Args: {
          p_start: string
          p_end: string
        }
        Returns: any
      }
      get_raw_packing: {
        Args: {
          p_start: string
          p_end: string
        }
        Returns: any
      }
    }
    Views: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
