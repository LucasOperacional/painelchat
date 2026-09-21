export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_connections: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          project_id: string | null
          whatsapp_config_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          project_id?: string | null
          whatsapp_config_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          project_id?: string | null
          whatsapp_config_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_connections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_connections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_connections_whatsapp_config_id_fkey"
            columns: ["whatsapp_config_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_config: {
        Row: {
          auto_reply: boolean
          created_at: string
          id: string
          is_enabled: boolean
          manus_agent_profile: string
          model: string
          provider: string
          system_prompt: string
          updated_at: string
        }
        Insert: {
          auto_reply?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          manus_agent_profile?: string
          model?: string
          provider?: string
          system_prompt?: string
          updated_at?: string
        }
        Update: {
          auto_reply?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          manus_agent_profile?: string
          model?: string
          provider?: string
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_secrets: {
        Row: {
          api_key: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key: string
          provider: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      altispay_secrets: {
        Row: {
          api_key: string | null
          base_url: string | null
          created_at: string
          default_payer_document: string | null
          default_payer_email: string | null
          default_payer_name: string | null
          environment: string
          provider: string
          updated_at: string
          webhook_token: string | null
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          default_payer_document?: string | null
          default_payer_email?: string | null
          default_payer_name?: string | null
          environment?: string
          provider: string
          updated_at?: string
          webhook_token?: string | null
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          default_payer_document?: string | null
          default_payer_email?: string | null
          default_payer_name?: string | null
          environment?: string
          provider?: string
          updated_at?: string
          webhook_token?: string | null
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          description: string
          direction: string
          end_to_end_id: string | null
          error_message: string | null
          id: string
          paid_at: string | null
          pix_key: string
          pix_key_type: string
          project_id: string | null
          provider: string
          receiver_document: string
          receiver_name: string
          requested_by: string | null
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string
          direction?: string
          end_to_end_id?: string | null
          error_message?: string | null
          id?: string
          paid_at?: string | null
          pix_key?: string
          pix_key_type?: string
          project_id?: string | null
          provider?: string
          receiver_document?: string
          receiver_name?: string
          requested_by?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string
          direction?: string
          end_to_end_id?: string | null
          error_message?: string | null
          id?: string
          paid_at?: string | null
          pix_key?: string
          pix_key_type?: string
          project_id?: string | null
          provider?: string
          receiver_document?: string
          receiver_name?: string
          requested_by?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_campaigns: {
        Row: {
          channel: string
          created_at: string
          device_id: string | null
          id: string
          image_url: string
          is_active: boolean
          last_run_at: string | null
          last_status: string
          message: string
          name: string
          next_run_at: string | null
          project_id: string | null
          repeat_minutes: number
          scheduled_at: string | null
          targets: string[]
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          device_id?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string
          message?: string
          name?: string
          next_run_at?: string | null
          project_id?: string | null
          repeat_minutes?: number
          scheduled_at?: string | null
          targets?: string[]
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          device_id?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string
          message?: string
          name?: string
          next_run_at?: string | null
          project_id?: string | null
          repeat_minutes?: number
          scheduled_at?: string | null
          targets?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_campaigns_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_runs: {
        Row: {
          campaign_id: string
          created_at: string
          detail: string
          id: string
          ok: boolean
          project_id: string | null
          target: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          detail?: string
          id?: string
          ok?: boolean
          project_id?: string | null
          target: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          detail?: string
          id?: string
          ok?: boolean
          project_id?: string | null
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "broadcast_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_settings: {
        Row: {
          created_at: string
          cron_token: string
          id: boolean
        }
        Insert: {
          created_at?: string
          cron_token?: string
          id?: boolean
        }
        Update: {
          created_at?: string
          cron_token?: string
          id?: boolean
        }
        Relationships: []
      }
      button_menus: {
        Row: {
          button_text: string
          created_at: string
          footer: string
          id: string
          image_url: string
          kind: string
          message: string
          option_routes: Json
          options: string[]
          project_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          button_text?: string
          created_at?: string
          footer?: string
          id?: string
          image_url?: string
          kind?: string
          message?: string
          option_routes?: Json
          options?: string[]
          project_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          button_text?: string
          created_at?: string
          footer?: string
          id?: string
          image_url?: string
          kind?: string
          message?: string
          option_routes?: Json
          options?: string[]
          project_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "button_menus_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_options: {
        Row: {
          action: Database["public"]["Enums"]["chatbot_action"]
          chatbot_id: string
          created_at: string
          department_id: string | null
          id: string
          is_active: boolean
          label: string
          option_key: string
          project_id: string | null
          queue_id: string | null
          response: string
          sort_order: number
        }
        Insert: {
          action?: Database["public"]["Enums"]["chatbot_action"]
          chatbot_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          label: string
          option_key: string
          project_id?: string | null
          queue_id?: string | null
          response?: string
          sort_order?: number
        }
        Update: {
          action?: Database["public"]["Enums"]["chatbot_action"]
          chatbot_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          label?: string
          option_key?: string
          project_id?: string | null
          queue_id?: string | null
          response?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_options_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_options_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_options_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_options_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_sessions: {
        Row: {
          attempts: number
          chatbot_id: string | null
          conversation_id: string
          created_at: string
          id: string
          project_id: string | null
          state: Database["public"]["Enums"]["chatbot_state"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          chatbot_id?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          project_id?: string | null
          state?: Database["public"]["Enums"]["chatbot_state"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          chatbot_id?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          project_id?: string | null
          state?: Database["public"]["Enums"]["chatbot_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_sessions_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbots: {
        Row: {
          ai_enabled: boolean
          ai_instructions: string
          ai_transfer_on_unknown: boolean
          attempt_limit: number
          business_hours: Json
          created_at: string
          fallback_message: string
          hours_enabled: boolean
          id: string
          invalid_option_message: string
          is_active: boolean
          menu_footer: string
          name: string
          outside_hours_message: string
          project_id: string | null
          timezone: string
          transfer_keywords: string[]
          updated_at: string
          welcome_message: string
        }
        Insert: {
          ai_enabled?: boolean
          ai_instructions?: string
          ai_transfer_on_unknown?: boolean
          attempt_limit?: number
          business_hours?: Json
          created_at?: string
          fallback_message?: string
          hours_enabled?: boolean
          id?: string
          invalid_option_message?: string
          is_active?: boolean
          menu_footer?: string
          name?: string
          outside_hours_message?: string
          project_id?: string | null
          timezone?: string
          transfer_keywords?: string[]
          updated_at?: string
          welcome_message?: string
        }
        Update: {
          ai_enabled?: boolean
          ai_instructions?: string
          ai_transfer_on_unknown?: boolean
          attempt_limit?: number
          business_hours?: Json
          created_at?: string
          fallback_message?: string
          hours_enabled?: boolean
          id?: string
          invalid_option_message?: string
          is_active?: boolean
          menu_footer?: string
          name?: string
          outside_hours_message?: string
          project_id?: string | null
          timezone?: string
          transfer_keywords?: string[]
          updated_at?: string
          welcome_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cloudflare_secrets: {
        Row: {
          account_id: string
          api_token: string | null
          auth_mode: string
          created_at: string
          email: string
          global_api_key: string
          provider: string
          proxied: boolean
          target_ip: string
          updated_at: string
          verified_at: string | null
          zone_id: string
          zone_name: string
        }
        Insert: {
          account_id?: string
          api_token?: string | null
          auth_mode?: string
          created_at?: string
          email?: string
          global_api_key?: string
          provider?: string
          proxied?: boolean
          target_ip?: string
          updated_at?: string
          verified_at?: string | null
          zone_id?: string
          zone_name?: string
        }
        Update: {
          account_id?: string
          api_token?: string | null
          auth_mode?: string
          created_at?: string
          email?: string
          global_api_key?: string
          provider?: string
          proxied?: boolean
          target_ip?: string
          updated_at?: string
          verified_at?: string | null
          zone_id?: string
          zone_name?: string
        }
        Relationships: []
      }
      cobranca_acessos: {
        Row: {
          categoria: string
          cliente: string
          created_at: string
          id: string
          lembrete_dias: number
          login: string
          observacoes: string
          project_id: string | null
          senha: string
          titulo: string
          updated_at: string
          url: string
          vencimento: string | null
        }
        Insert: {
          categoria?: string
          cliente?: string
          created_at?: string
          id?: string
          lembrete_dias?: number
          login?: string
          observacoes?: string
          project_id?: string | null
          senha?: string
          titulo?: string
          updated_at?: string
          url?: string
          vencimento?: string | null
        }
        Update: {
          categoria?: string
          cliente?: string
          created_at?: string
          id?: string
          lembrete_dias?: number
          login?: string
          observacoes?: string
          project_id?: string | null
          senha?: string
          titulo?: string
          updated_at?: string
          url?: string
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_acessos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_envios: {
        Row: {
          cobranca_id: string
          created_at: string
          detalhe: string
          id: string
          ok: boolean
          project_id: string | null
          tipo: string
        }
        Insert: {
          cobranca_id: string
          created_at?: string
          detalhe?: string
          id?: string
          ok?: boolean
          project_id?: string | null
          tipo?: string
        }
        Update: {
          cobranca_id?: string
          created_at?: string
          detalhe?: string
          id?: string
          ok?: boolean
          project_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_envios_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_envios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_settings: {
        Row: {
          created_at: string
          cron_token: string
          id: boolean
        }
        Insert: {
          created_at?: string
          cron_token?: string
          id?: boolean
        }
        Update: {
          created_at?: string
          cron_token?: string
          id?: boolean
        }
        Relationships: []
      }
      cobrancas: {
        Row: {
          ativo: boolean
          boleto_url: string
          cliente_nome: string
          created_at: string
          descricao: string
          device_id: string | null
          dias_antes: number
          hora_envio: string
          id: string
          linha_digitavel: string
          mensagem: string
          project_id: string | null
          proximo_envio: string | null
          recorrencia: string
          status: string
          telefone: string
          ultimo_envio: string | null
          updated_at: string
          valor: number
          vencimento: string
        }
        Insert: {
          ativo?: boolean
          boleto_url?: string
          cliente_nome?: string
          created_at?: string
          descricao?: string
          device_id?: string | null
          dias_antes?: number
          hora_envio?: string
          id?: string
          linha_digitavel?: string
          mensagem?: string
          project_id?: string | null
          proximo_envio?: string | null
          recorrencia?: string
          status?: string
          telefone?: string
          ultimo_envio?: string | null
          updated_at?: string
          valor?: number
          vencimento?: string
        }
        Update: {
          ativo?: boolean
          boleto_url?: string
          cliente_nome?: string
          created_at?: string
          descricao?: string
          device_id?: string | null
          dias_antes?: number
          hora_envio?: string
          id?: string
          linha_digitavel?: string
          mensagem?: string
          project_id?: string | null
          proximo_envio?: string | null
          recorrencia?: string
          status?: string
          telefone?: string
          ultimo_envio?: string | null
          updated_at?: string
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas_historico: {
        Row: {
          categoria: string
          created_at: string
          custo: number
          entrada: string
          erro: string
          id: string
          produto: string
          produto_nome: string
          project_id: string | null
          resultado: Json
          status: string
          user_id: string | null
        }
        Insert: {
          categoria?: string
          created_at?: string
          custo?: number
          entrada?: string
          erro?: string
          id?: string
          produto: string
          produto_nome?: string
          project_id?: string | null
          resultado?: Json
          status?: string
          user_id?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string
          custo?: number
          entrada?: string
          erro?: string
          id?: string
          produto?: string
          produto_nome?: string
          project_id?: string | null
          resultado?: Json
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultas_historico_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas_secrets: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key?: string
          base_url?: string
          created_at?: string
          provider?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          lid: string | null
          name: string
          notes: string
          phone: string
          project_id: string | null
          wa_jid: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          lid?: string | null
          name: string
          notes?: string
          phone: string
          project_id?: string | null
          wa_jid?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          lid?: string | null
          name?: string
          notes?: string
          phone?: string
          project_id?: string | null
          wa_jid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string
          closed_at: string | null
          contact_id: string
          created_at: string
          department_id: string | null
          first_response_at: string | null
          id: string
          last_message_at: string
          project_id: string | null
          queue_id: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          whatsapp_config_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          closed_at?: string | null
          contact_id: string
          created_at?: string
          department_id?: string | null
          first_response_at?: string | null
          id?: string
          last_message_at?: string
          project_id?: string | null
          queue_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          whatsapp_config_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          closed_at?: string | null
          contact_id?: string
          created_at?: string
          department_id?: string | null
          first_response_at?: string | null
          id?: string
          last_message_at?: string
          project_id?: string | null
          queue_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          whatsapp_config_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_config_id_fkey"
            columns: ["whatsapp_config_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
        ]
      }
      das_mei_documentos: {
        Row: {
          atualizado_em: string
          competencia: string
          criado_em: string
          data_vencimento: string | null
          id: string
          nome_original: string
          status: string
          storage_path: string
          tamanho_bytes: number
          user_id: string
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          competencia?: string
          criado_em?: string
          data_vencimento?: string | null
          id?: string
          nome_original: string
          status?: string
          storage_path: string
          tamanho_bytes?: number
          user_id: string
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          competencia?: string
          criado_em?: string
          data_vencimento?: string | null
          id?: string
          nome_original?: string
          status?: string
          storage_path?: string
          tamanho_bytes?: number
          user_id?: string
          valor?: number | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          color: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          project_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name: string
          project_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      divulgazap_secrets: {
        Row: {
          api_key: string
          created_at: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          provider: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      efi_secrets: {
        Row: {
          certificate_name: string | null
          certificate_p12: string | null
          certificate_password: string | null
          client_id: string
          client_secret: string
          created_at: string
          environment: string
          expiration_seconds: number
          pix_key: string | null
          provider: string
          relay_token: string | null
          relay_url: string | null
          updated_at: string
        }
        Insert: {
          certificate_name?: string | null
          certificate_p12?: string | null
          certificate_password?: string | null
          client_id: string
          client_secret: string
          created_at?: string
          environment?: string
          expiration_seconds?: number
          pix_key?: string | null
          provider?: string
          relay_token?: string | null
          relay_url?: string | null
          updated_at?: string
        }
        Update: {
          certificate_name?: string | null
          certificate_p12?: string | null
          certificate_password?: string | null
          client_id?: string
          client_secret?: string
          created_at?: string
          environment?: string
          expiration_seconds?: number
          pix_key?: string | null
          provider?: string
          relay_token?: string | null
          relay_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      estoque_categorias: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string
          entrega_mensagem: string
          id: string
          nome: string
          preco: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          entrega_mensagem?: string
          id?: string
          nome: string
          preco?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          entrega_mensagem?: string
          id?: string
          nome?: string
          preco?: number
          updated_at?: string
        }
        Relationships: []
      }
      estoque_itens: {
        Row: {
          categoria_id: string
          conversation_id: string | null
          created_at: string
          entregue_para: string
          extras: string
          id: string
          login: string
          pix_charge_id: string | null
          senha: string
          status: string
          titulo: string
          updated_at: string
          url: string
          validade: string | null
          vendido_em: string | null
        }
        Insert: {
          categoria_id: string
          conversation_id?: string | null
          created_at?: string
          entregue_para?: string
          extras?: string
          id?: string
          login: string
          pix_charge_id?: string | null
          senha?: string
          status?: string
          titulo?: string
          updated_at?: string
          url?: string
          validade?: string | null
          vendido_em?: string | null
        }
        Update: {
          categoria_id?: string
          conversation_id?: string | null
          created_at?: string
          entregue_para?: string
          extras?: string
          id?: string
          login?: string
          pix_charge_id?: string | null
          senha?: string
          status?: string
          titulo?: string
          updated_at?: string
          url?: string
          validade?: string | null
          vendido_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_itens_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "estoque_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_itens_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_itens_pix_charge_id_fkey"
            columns: ["pix_charge_id"]
            isOneToOne: false
            referencedRelation: "pix_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_settings: {
        Row: {
          base_domain: string
          id: boolean
          updated_at: string
        }
        Insert: {
          base_domain?: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          base_domain?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      inbound_settings: {
        Row: {
          id: boolean
          ignore_groups: boolean
          sync_history: boolean
          updated_at: string
        }
        Insert: {
          id?: boolean
          ignore_groups?: boolean
          sync_history?: boolean
          updated_at?: string
        }
        Update: {
          id?: boolean
          ignore_groups?: boolean
          sync_history?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      loja_settings: {
        Row: {
          auto_pix: boolean
          bot_ativo: boolean
          bot_modo: string
          bot_palavras: string
          bot_primeiro_contato: boolean
          bot_saudacao: string
          bot_titulo: string
          id: boolean
          mensagem_cobranca: string
          pix_key: string
          pix_key_type: string
          provider: string
          recebedor_cidade: string
          recebedor_nome: string
          updated_at: string
        }
        Insert: {
          auto_pix?: boolean
          bot_ativo?: boolean
          bot_modo?: string
          bot_palavras?: string
          bot_primeiro_contato?: boolean
          bot_saudacao?: string
          bot_titulo?: string
          id?: boolean
          mensagem_cobranca?: string
          pix_key?: string
          pix_key_type?: string
          provider?: string
          recebedor_cidade?: string
          recebedor_nome?: string
          updated_at?: string
        }
        Update: {
          auto_pix?: boolean
          bot_ativo?: boolean
          bot_modo?: string
          bot_palavras?: string
          bot_primeiro_contato?: boolean
          bot_saudacao?: string
          bot_titulo?: string
          id?: boolean
          mensagem_cobranca?: string
          pix_key?: string
          pix_key_type?: string
          provider?: string
          recebedor_cidade?: string
          recebedor_nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      mei_clients: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          project_id: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          project_id?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mei_clients_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mei_das: {
        Row: {
          client_id: string
          competencia: string
          created_at: string
          file_name: string | null
          file_path: string | null
          id: string
          paid_at: string | null
          project_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          competencia: string
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          paid_at?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          competencia?: string
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          paid_at?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mei_das_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "mei_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mei_das_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          edited_at: string | null
          external_id: string | null
          id: string
          mentions_me: boolean
          project_id: string | null
          reply_body: string | null
          reply_to_external_id: string | null
          sender_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          edited_at?: string | null
          external_id?: string | null
          id?: string
          mentions_me?: boolean
          project_id?: string | null
          reply_body?: string | null
          reply_to_external_id?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          edited_at?: string | null
          external_id?: string | null
          id?: string
          mentions_me?: boolean
          project_id?: string | null
          reply_body?: string | null
          reply_to_external_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      misticpay_secrets: {
        Row: {
          auth_mode: string
          base_url: string | null
          client_id: string
          client_secret: string
          created_at: string
          default_payer_document: string | null
          default_payer_name: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          auth_mode?: string
          base_url?: string | null
          client_id: string
          client_secret: string
          created_at?: string
          default_payer_document?: string | null
          default_payer_name?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          auth_mode?: string
          base_url?: string | null
          client_id?: string
          client_secret?: string
          created_at?: string
          default_payer_document?: string | null
          default_payer_name?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      monitor_eventos: {
        Row: {
          alerta_detalhe: string | null
          alerta_enviado: boolean
          created_at: string
          device_id: string | null
          device_label: string
          id: string
          mensagem: string
          provider: string
          severidade: string
          tipo: string
        }
        Insert: {
          alerta_detalhe?: string | null
          alerta_enviado?: boolean
          created_at?: string
          device_id?: string | null
          device_label?: string
          id?: string
          mensagem?: string
          provider?: string
          severidade?: string
          tipo: string
        }
        Update: {
          alerta_detalhe?: string | null
          alerta_enviado?: boolean
          created_at?: string
          device_id?: string | null
          device_label?: string
          id?: string
          mensagem?: string
          provider?: string
          severidade?: string
          tipo?: string
        }
        Relationships: []
      }
      monitor_settings: {
        Row: {
          ativo: boolean
          auto_reconectar: boolean
          created_at: string
          cron_token: string
          id: string
          intervalo_minutos: number
          numero_alerta: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          auto_reconectar?: boolean
          created_at?: string
          cron_token?: string
          id?: string
          intervalo_minutos?: number
          numero_alerta?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          auto_reconectar?: boolean
          created_at?: string
          cron_token?: string
          id?: string
          intervalo_minutos?: number
          numero_alerta?: string
          updated_at?: string
        }
        Relationships: []
      }
      nfse_config: {
        Row: {
          ambiente: string
          cnpj: string
          codigo_municipio: string
          endpoint_url: string
          id: boolean
          incentivador_cultural: boolean
          inscricao_municipal: string
          nome_fantasia: string
          optante_simples: boolean
          padrao: string
          proximo_rps: number
          razao_social: string
          regime_tributario: number
          serie_rps: string
          updated_at: string
        }
        Insert: {
          ambiente?: string
          cnpj?: string
          codigo_municipio?: string
          endpoint_url?: string
          id?: boolean
          incentivador_cultural?: boolean
          inscricao_municipal?: string
          nome_fantasia?: string
          optante_simples?: boolean
          padrao?: string
          proximo_rps?: number
          razao_social?: string
          regime_tributario?: number
          serie_rps?: string
          updated_at?: string
        }
        Update: {
          ambiente?: string
          cnpj?: string
          codigo_municipio?: string
          endpoint_url?: string
          id?: boolean
          incentivador_cultural?: boolean
          inscricao_municipal?: string
          nome_fantasia?: string
          optante_simples?: boolean
          padrao?: string
          proximo_rps?: number
          razao_social?: string
          regime_tributario?: number
          serie_rps?: string
          updated_at?: string
        }
        Relationships: []
      }
      nfse_eventos: {
        Row: {
          created_at: string
          id: string
          nfse_id: string | null
          project_id: string | null
          request: string | null
          response: string | null
          status_http: number | null
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          nfse_id?: string | null
          project_id?: string | null
          request?: string | null
          response?: string | null
          status_http?: number | null
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          nfse_id?: string | null
          project_id?: string | null
          request?: string | null
          response?: string | null
          status_http?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfse_eventos_nfse_id_fkey"
            columns: ["nfse_id"]
            isOneToOne: false
            referencedRelation: "nfse_notas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_eventos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_notas: {
        Row: {
          aliquota: number
          base_calculo: number
          cnae: string
          codigo_servico: string
          codigo_verificacao: string | null
          competencia: string | null
          created_at: string
          descricao: string
          empresa_id: string | null
          erro_codigo: string | null
          erro_mensagem: string | null
          id: string
          iss_retido: boolean
          numero_nfse: string | null
          payload: Json
          project_id: string | null
          rps_numero: number
          rps_serie: string
          status: string
          tomador_cpf_cnpj: string
          tomador_email: string
          tomador_nome: string
          updated_at: string
          url_nfse: string | null
          user_id: string | null
          valor_iss: number
          valor_servico: number
          xml_envio: string | null
          xml_resposta: string | null
        }
        Insert: {
          aliquota?: number
          base_calculo?: number
          cnae?: string
          codigo_servico?: string
          codigo_verificacao?: string | null
          competencia?: string | null
          created_at?: string
          descricao?: string
          empresa_id?: string | null
          erro_codigo?: string | null
          erro_mensagem?: string | null
          id?: string
          iss_retido?: boolean
          numero_nfse?: string | null
          payload?: Json
          project_id?: string | null
          rps_numero: number
          rps_serie?: string
          status?: string
          tomador_cpf_cnpj?: string
          tomador_email?: string
          tomador_nome?: string
          updated_at?: string
          url_nfse?: string | null
          user_id?: string | null
          valor_iss?: number
          valor_servico?: number
          xml_envio?: string | null
          xml_resposta?: string | null
        }
        Update: {
          aliquota?: number
          base_calculo?: number
          cnae?: string
          codigo_servico?: string
          codigo_verificacao?: string | null
          competencia?: string | null
          created_at?: string
          descricao?: string
          empresa_id?: string | null
          erro_codigo?: string | null
          erro_mensagem?: string | null
          id?: string
          iss_retido?: boolean
          numero_nfse?: string | null
          payload?: Json
          project_id?: string | null
          rps_numero?: number
          rps_serie?: string
          status?: string
          tomador_cpf_cnpj?: string
          tomador_email?: string
          tomador_nome?: string
          updated_at?: string
          url_nfse?: string | null
          user_id?: string | null
          valor_iss?: number
          valor_servico?: number
          xml_envio?: string | null
          xml_resposta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfse_notas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_secrets: {
        Row: {
          api_token: string
          base_url: string | null
          created_at: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_token: string
          base_url?: string | null
          created_at?: string
          provider: string
          updated_at?: string
        }
        Update: {
          api_token?: string
          base_url?: string | null
          created_at?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      pix_charges: {
        Row: {
          amount: number
          confirmed_at: string | null
          conversation_id: string
          created_at: string
          description: string
          estoque_categoria_id: string | null
          id: string
          paid_at: string | null
          project_id: string | null
          provider: string
          status: string
          transaction_id: string
          whatsapp_config_id: string | null
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          conversation_id: string
          created_at?: string
          description?: string
          estoque_categoria_id?: string | null
          id?: string
          paid_at?: string | null
          project_id?: string | null
          provider?: string
          status?: string
          transaction_id: string
          whatsapp_config_id?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          conversation_id?: string
          created_at?: string
          description?: string
          estoque_categoria_id?: string | null
          id?: string
          paid_at?: string | null
          project_id?: string | null
          provider?: string
          status?: string
          transaction_id?: string
          whatsapp_config_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pix_charges_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_estoque_categoria_id_fkey"
            columns: ["estoque_categoria_id"]
            isOneToOne: false
            referencedRelation: "estoque_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_whatsapp_config_id_fkey"
            columns: ["whatsapp_config_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string
          project_id: string | null
          signature_enabled: boolean
          status: Database["public"]["Enums"]["agent_status"]
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string
          project_id?: string | null
          signature_enabled?: boolean
          status?: Database["public"]["Enums"]["agent_status"]
          username?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string
          project_id?: string | null
          signature_enabled?: boolean
          status?: Database["public"]["Enums"]["agent_status"]
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_domains: {
        Row: {
          access_key: string
          created_at: string
          domain: string
          id: string
          is_primary: boolean
          project_id: string
        }
        Insert: {
          access_key?: string
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
          project_id: string
        }
        Update: {
          access_key?: string
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_domains_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          accent_color: string
          access_key: string
          admin_email: string | null
          admin_password: string | null
          chat_background_color: string
          chat_background_url: string | null
          created_at: string
          dashboard_logo_url: string | null
          favicon_url: string | null
          headline: string
          id: string
          is_active: boolean
          is_central: boolean
          login_logo_url: string | null
          logo_url: string | null
          name: string
          primary_color: string
          slug: string
          tagline: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          access_key?: string
          admin_email?: string | null
          admin_password?: string | null
          chat_background_color?: string
          chat_background_url?: string | null
          created_at?: string
          dashboard_logo_url?: string | null
          favicon_url?: string | null
          headline?: string
          id?: string
          is_active?: boolean
          is_central?: boolean
          login_logo_url?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string
          slug: string
          tagline?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          access_key?: string
          admin_email?: string | null
          admin_password?: string | null
          chat_background_color?: string
          chat_background_url?: string | null
          created_at?: string
          dashboard_logo_url?: string | null
          favicon_url?: string | null
          headline?: string
          id?: string
          is_active?: boolean
          is_central?: boolean
          login_logo_url?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string
          slug?: string
          tagline?: string
          updated_at?: string
        }
        Relationships: []
      }
      queue_agents: {
        Row: {
          agent_id: string
          id: string
          project_id: string | null
          queue_id: string
        }
        Insert: {
          agent_id: string
          id?: string
          project_id?: string | null
          queue_id: string
        }
        Update: {
          agent_id?: string
          id?: string
          project_id?: string | null
          queue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_agents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_agents_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      queues: {
        Row: {
          color: string
          created_at: string
          department_id: string | null
          greeting: string
          id: string
          is_active: boolean
          name: string
          priority: number
          project_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          department_id?: string | null
          greeting?: string
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          project_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          department_id?: string | null
          greeting?: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queues_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sentinela_achados: {
        Row: {
          acao: string
          alvo: string
          ciclo_id: string | null
          created_at: string
          detalhe: string
          id: string
          severidade: string
          status: string
          tipo: string
          titulo: string
        }
        Insert: {
          acao?: string
          alvo?: string
          ciclo_id?: string | null
          created_at?: string
          detalhe?: string
          id?: string
          severidade?: string
          status?: string
          tipo: string
          titulo?: string
        }
        Update: {
          acao?: string
          alvo?: string
          ciclo_id?: string | null
          created_at?: string
          detalhe?: string
          id?: string
          severidade?: string
          status?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentinela_achados_ciclo_id_fkey"
            columns: ["ciclo_id"]
            isOneToOne: false
            referencedRelation: "sentinela_ciclos"
            referencedColumns: ["id"]
          },
        ]
      }
      sentinela_ciclos: {
        Row: {
          corrigidos: number
          detalhes: Json
          duracao_ms: number
          id: string
          iniciado_em: string
          problemas: number
          resumo: string
          severidade: string
          verificacoes: number
        }
        Insert: {
          corrigidos?: number
          detalhes?: Json
          duracao_ms?: number
          id?: string
          iniciado_em?: string
          problemas?: number
          resumo?: string
          severidade?: string
          verificacoes?: number
        }
        Update: {
          corrigidos?: number
          detalhes?: Json
          duracao_ms?: number
          id?: string
          iniciado_em?: string
          problemas?: number
          resumo?: string
          severidade?: string
          verificacoes?: number
        }
        Relationships: []
      }
      sentinela_settings: {
        Row: {
          ativo: boolean
          auto_limpar_duplicadas: boolean
          auto_reconectar: boolean
          auto_recuperar_midia: boolean
          auto_reenviar: boolean
          avisar_painel: boolean
          avisar_whatsapp: boolean
          bloqueio_minutos: number
          created_at: string
          cron_token: string
          id: string
          intervalo_minutos: number
          limite_req_minuto: number
          numero_alerta: string
          resumo_ia: string
          resumo_ia_em: string | null
          seguranca_modo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          auto_limpar_duplicadas?: boolean
          auto_reconectar?: boolean
          auto_recuperar_midia?: boolean
          auto_reenviar?: boolean
          avisar_painel?: boolean
          avisar_whatsapp?: boolean
          bloqueio_minutos?: number
          created_at?: string
          cron_token?: string
          id?: string
          intervalo_minutos?: number
          limite_req_minuto?: number
          numero_alerta?: string
          resumo_ia?: string
          resumo_ia_em?: string | null
          seguranca_modo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          auto_limpar_duplicadas?: boolean
          auto_reconectar?: boolean
          auto_recuperar_midia?: boolean
          auto_reenviar?: boolean
          avisar_painel?: boolean
          avisar_whatsapp?: boolean
          bloqueio_minutos?: number
          created_at?: string
          cron_token?: string
          id?: string
          intervalo_minutos?: number
          limite_req_minuto?: number
          numero_alerta?: string
          resumo_ia?: string
          resumo_ia_em?: string | null
          seguranca_modo?: string
          updated_at?: string
        }
        Relationships: []
      }
      sentinela_trafego: {
        Row: {
          bloqueado_ate: string | null
          id: string
          ip: string
          janela_inicio: string
          motivo: string
          requisicoes: number
          rota: string
          total_bloqueios: number
          ultimo_em: string
        }
        Insert: {
          bloqueado_ate?: string | null
          id?: string
          ip: string
          janela_inicio?: string
          motivo?: string
          requisicoes?: number
          rota?: string
          total_bloqueios?: number
          ultimo_em?: string
        }
        Update: {
          bloqueado_ate?: string | null
          id?: string
          ip?: string
          janela_inicio?: string
          motivo?: string
          requisicoes?: number
          rota?: string
          total_bloqueios?: number
          ultimo_em?: string
        }
        Relationships: []
      }
      stickers: {
        Row: {
          created_at: string
          id: string
          name: string
          pack: string
          project_id: string | null
          sort_order: number
          storage_path: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          pack?: string
          project_id?: string | null
          sort_order?: number
          storage_path: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pack?: string
          project_id?: string | null
          sort_order?: number
          storage_path?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stickers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          conversation_id: string
          created_at: string
          from_user: string | null
          id: string
          note: string
          project_id: string | null
          to_queue: string | null
          to_user: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          from_user?: string | null
          id?: string
          note?: string
          project_id?: string | null
          to_queue?: string | null
          to_user?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          from_user?: string | null
          id?: string
          note?: string
          project_id?: string | null
          to_queue?: string | null
          to_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_queue_fkey"
            columns: ["to_queue"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          project_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          project_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          project_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      wavoip_secrets: {
        Row: {
          base_url: string
          call_url: string
          close_after_call: boolean
          created_at: string
          device_token: string
          email: string
          password: string
          provider: string
          start_if_ready: boolean
          updated_at: string
        }
        Insert: {
          base_url?: string
          call_url?: string
          close_after_call?: boolean
          created_at?: string
          device_token?: string
          email?: string
          password?: string
          provider?: string
          start_if_ready?: boolean
          updated_at?: string
        }
        Update: {
          base_url?: string
          call_url?: string
          close_after_call?: boolean
          created_at?: string
          device_token?: string
          email?: string
          password?: string
          provider?: string
          start_if_ready?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      webhook_eventos: {
        Row: {
          created_at: string
          erro: string | null
          evento: string
          external_id: string | null
          http_status: number | null
          id: string
          payload: Json
          processado_em: string | null
          status: string
          tentativas: number
          token: string
          url: string
        }
        Insert: {
          created_at?: string
          erro?: string | null
          evento?: string
          external_id?: string | null
          http_status?: number | null
          id?: string
          payload?: Json
          processado_em?: string | null
          status?: string
          tentativas?: number
          token?: string
          url?: string
        }
        Update: {
          created_at?: string
          erro?: string | null
          evento?: string
          external_id?: string | null
          http_status?: number | null
          id?: string
          payload?: Json
          processado_em?: string | null
          status?: string
          tentativas?: number
          token?: string
          url?: string
        }
        Relationships: []
      }
      webviews: {
        Row: {
          created_at: string
          description: string
          id: string
          open_external: boolean
          project_id: string | null
          sort_order: number
          title: string
          updated_at: string
          url: string
          use_proxy: boolean
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          open_external?: boolean
          project_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
          url: string
          use_proxy?: boolean
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          open_external?: boolean
          project_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          url?: string
          use_proxy?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "webviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          base_url: string
          color: string
          company: string
          connection_test_at: string | null
          connection_test_detail: string | null
          connection_test_status: string | null
          created_at: string
          default_queue_id: string | null
          display_id: string | null
          id: string
          instance_id: string
          instance_name: string
          is_default: boolean
          label: string
          last_event: string | null
          last_qr: string | null
          monitor_desde: string | null
          monitor_estado: string | null
          monitor_tentativas: number
          monitor_ultimo_check: string | null
          monitor_ultimo_erro: string | null
          phone: string
          project_id: string | null
          provider: string
          status: string
          updated_at: string
          webhook_events: string | null
          webhook_synced_at: string | null
          webhook_token: string
          webhook_url: string | null
        }
        Insert: {
          base_url?: string
          color?: string
          company?: string
          connection_test_at?: string | null
          connection_test_detail?: string | null
          connection_test_status?: string | null
          created_at?: string
          default_queue_id?: string | null
          display_id?: string | null
          id?: string
          instance_id?: string
          instance_name?: string
          is_default?: boolean
          label?: string
          last_event?: string | null
          last_qr?: string | null
          monitor_desde?: string | null
          monitor_estado?: string | null
          monitor_tentativas?: number
          monitor_ultimo_check?: string | null
          monitor_ultimo_erro?: string | null
          phone?: string
          project_id?: string | null
          provider?: string
          status?: string
          updated_at?: string
          webhook_events?: string | null
          webhook_synced_at?: string | null
          webhook_token?: string
          webhook_url?: string | null
        }
        Update: {
          base_url?: string
          color?: string
          company?: string
          connection_test_at?: string | null
          connection_test_detail?: string | null
          connection_test_status?: string | null
          created_at?: string
          default_queue_id?: string | null
          display_id?: string | null
          id?: string
          instance_id?: string
          instance_name?: string
          is_default?: boolean
          label?: string
          last_event?: string | null
          last_qr?: string | null
          monitor_desde?: string | null
          monitor_estado?: string | null
          monitor_tentativas?: number
          monitor_ultimo_check?: string | null
          monitor_ultimo_erro?: string | null
          phone?: string
          project_id?: string | null
          provider?: string
          status?: string
          updated_at?: string
          webhook_events?: string | null
          webhook_synced_at?: string | null
          webhook_token?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_default_queue_id_fkey"
            columns: ["default_queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_config_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_secrets: {
        Row: {
          base_url: string
          client_token: string
          config_id: string
          instance_token: string
          provider: string
          updated_at: string
        }
        Insert: {
          base_url?: string
          client_token?: string
          config_id?: string
          instance_token?: string
          provider: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          client_token?: string
          config_id?: string
          instance_token?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bank_balance: {
        Args: never
        Returns: {
          balance: number
          total_in: number
          total_out: number
        }[]
      }
      current_project_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      nfse_reservar_rps: {
        Args: { _empresa: string }
        Returns: {
          numero: number
          serie: string
        }[]
      }
      sentinela_limpar_diario: { Args: never; Returns: undefined }
    }
    Enums: {
      agent_status: "available" | "away" | "offline"
      app_role: "admin" | "agent" | "superadmin"
      chatbot_action:
        | "message"
        | "transfer_queue"
        | "transfer_department"
        | "ai"
        | "close"
        | "loja"
      chatbot_state: "menu" | "ai" | "handoff" | "done"
      conversation_status: "waiting" | "open" | "closed"
      message_direction: "inbound" | "outbound" | "system"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_status: ["available", "away", "offline"],
      app_role: ["admin", "agent", "superadmin"],
      chatbot_action: [
        "message",
        "transfer_queue",
        "transfer_department",
        "ai",
        "close",
        "loja",
      ],
      chatbot_state: ["menu", "ai", "handoff", "done"],
      conversation_status: ["waiting", "open", "closed"],
      message_direction: ["inbound", "outbound", "system"],
    },
  },
} as const
