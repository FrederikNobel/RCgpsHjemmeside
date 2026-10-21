export interface Database {
  public: {
    Tables: {
      gps_samples: {
        Row: {
          id: string
          trip_id: string
          sample_index: number
          recorded_at: string
          latitude: number
          longitude: number
          speed_kmh: number
        }
        Insert: {
          id?: string
          trip_id: string
          sample_index: number
          recorded_at: string
          latitude: number
          longitude: number
          speed_kmh: number
        }
        Update: {
          id?: string
          trip_id?: string
          sample_index?: number
          recorded_at?: string
          latitude?: number
          longitude?: number
          speed_kmh?: number
        }
        Relationships: [
          {
            foreignKeyName: 'gps_samples_trip_id_fkey'
            columns: ['trip_id']
            isOneToOne: false
            referencedRelation: 'trips'
            referencedColumns: ['id']
          },
        ]
      }
      trips: {
        Row: {
          id: string
          user_id: string
          name: string
          started_at: string
          ended_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          name?: string
          started_at: string
          ended_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          started_at?: string
          ended_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
