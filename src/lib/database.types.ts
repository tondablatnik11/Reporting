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
        Insert: Partial<Database['public']['Tables']['app_settings']['Row']>
        Update: Partial<Database['public']['Tables']['app_settings']['Row']>
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
        Insert: Partial<Database['public']['Tables']['ltap_picking']['Row']>
        Update: Partial<Database['public']['Tables']['ltap_picking']['Row']>
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
        Insert: Partial<Database['public']['Tables']['vekp_packing_headers']['Row']>
        Update: Partial<Database['public']['Tables']['vekp_packing_headers']['Row']>
      }
    }
    Functions: {
      get_delivery_detail: {
        Args: {
          p_search_term: string
        }
        Returns: any
      }
      get_pick_material_stats: {
        Args: {
          p_start_date: string
          p_end_date: string
          p_shift: string | null
        }
        Returns: any
      }
      get_pack_material_stats: {
        Args: {
          p_start_date: string
          p_end_date: string
          p_shift: string | null
        }
        Returns: any
      }
      get_daily_history: {
        Args: Record<string, never>
        Returns: any
      }
    }
  }
}
