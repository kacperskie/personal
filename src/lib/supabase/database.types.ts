import type {
  AccountPurpose,
  AccountRole,
  AccountSubtype,
  AccountType,
  BankProvider,
  CategoryKind,
  ConnectionLifecycleStatus,
  ConsentStatus,
  CurrencyCode,
  EntityStatus,
  ManualFinanceDirection,
  ManualFinanceItemType,
  NotificationChannel,
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
  Recurrence,
} from "@/lib/domain";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          locale: "en-GB";
          currency: CurrencyCode;
          payday_day_of_month: number;
          minimum_buffer: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          provider_connection_id: string | null;
          provider_account_id: string | null;
          institution_name: string;
          institution_id: string;
          name: string;
          official_name: string;
          type: AccountType;
          subtype: AccountSubtype;
          balance: number;
          available_balance: number | null;
          credit_limit: number | null;
          currency: CurrencyCode;
          mask: string | null;
          purpose: AccountPurpose;
          account_role: AccountRole;
          include_in_cashflow: boolean;
          include_in_net_worth: boolean;
          include_in_safe_to_spend: boolean;
          is_spending_account: boolean;
          is_bills_account: boolean;
          is_savings_account: boolean;
          linked_goal_ids: string[];
          sync_status: ConnectionLifecycleStatus;
          last_synced_at: string | null;
          consent_expires_at: string | null;
          notes: string | null;
          provider: BankProvider | "manual";
          status: EntityStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["accounts"]["Row"]> & {
          user_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Row"]>;
        Relationships: [];
      };
      bank_connections: {
        Row: {
          id: string;
          user_id: string;
          provider: BankProvider;
          institution_name: string;
          institution_id: string;
          status: ConnectionLifecycleStatus;
          consent_status: ConsentStatus;
          consent_started_at: string | null;
          consent_expires_at: string | null;
          last_synced_at: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bank_connections"]["Row"]> & {
          user_id: string;
          provider: BankProvider;
          institution_name: string;
          institution_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["bank_connections"]["Row"]>;
        Relationships: [];
      };
      manual_finance_items: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: ManualFinanceItemType;
          direction: ManualFinanceDirection;
          amount: number;
          currency: CurrencyCode;
          due_date: string | null;
          recurrence: Recurrence | null;
          apr: number | null;
          minimum_payment: number | null;
          counterparty: string | null;
          include_in_cashflow: boolean;
          include_in_net_worth: boolean;
          notes: string | null;
          status: EntityStatus;
          review_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["manual_finance_items"]["Row"]> & {
          user_id: string;
          name: string;
          type: ManualFinanceItemType;
          direction: ManualFinanceDirection;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["manual_finance_items"]["Row"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          category_id: string;
          date: string;
          merchant: string;
          description: string;
          amount: number;
          currency: CurrencyCode;
          kind: CategoryKind;
          status: "reviewed" | "needs_review" | "suggested" | "excluded";
          flags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["transactions"]["Row"]> & {
          user_id: string;
          account_id: string;
          category_id: string;
          date: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Row"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          parent_id: string | null;
          kind: CategoryKind;
          budget_type: string;
          include_in_budget: boolean;
          status: EntityStatus;
        };
        Insert: Partial<Database["public"]["Tables"]["categories"]["Row"]> & {
          user_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Row"]>;
        Relationships: [];
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          period_id: string;
          amount: number;
          currency: CurrencyCode;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["budgets"]["Row"]> & {
          user_id: string;
          category_id: string;
          period_id: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["budgets"]["Row"]>;
        Relationships: [];
      };
      budget_periods: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          start_date: string;
          end_date: string;
          status: "open" | "closed" | "planned";
        };
        Insert: Partial<Database["public"]["Tables"]["budget_periods"]["Row"]> & {
          user_id: string;
          label: string;
          start_date: string;
          end_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["budget_periods"]["Row"]>;
        Relationships: [];
      };
      bills: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          amount: number;
          currency: CurrencyCode;
          due_date: string;
          recurrence: Recurrence;
          category_id: string;
          account_id: string | null;
          essential: boolean;
          include_in_cashflow: boolean;
          status: EntityStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bills"]["Row"]> & {
          user_id: string;
          name: string;
          amount: number;
          due_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["bills"]["Row"]>;
        Relationships: [];
      };
      savings_goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_amount: number;
          current_amount: number;
          currency: CurrencyCode;
          target_date: string;
          priority: "high" | "medium" | "low";
          monthly_contribution: number;
          include_in_net_worth: boolean;
          status: EntityStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["savings_goals"]["Row"]> & {
          user_id: string;
          name: string;
          target_amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["savings_goals"]["Row"]>;
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          enabled: boolean;
          channels: NotificationChannel[];
          low_balance_threshold: number;
          budget_warning_percentage: number;
          bill_reminder_days: number;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notification_preferences"]["Row"]> & {
          user_id: string;
          type: NotificationType;
        };
        Update: Partial<Database["public"]["Tables"]["notification_preferences"]["Row"]>;
        Relationships: [];
      };
      notification_rules: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          enabled: boolean;
          threshold_amount: number | null;
          threshold_percentage: number | null;
          days_before: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notification_rules"]["Row"]> & {
          user_id: string;
          type: NotificationType;
        };
        Update: Partial<Database["public"]["Tables"]["notification_rules"]["Row"]>;
        Relationships: [];
      };
      app_notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          severity: NotificationSeverity;
          channel: NotificationChannel;
          title: string;
          body: string;
          privacy_safe_title: string;
          privacy_safe_body: string;
          action_href: string | null;
          entity_type: string | null;
          entity_id: string | null;
          status: NotificationStatus;
          read_at: string | null;
          dismissed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["app_notifications"]["Row"]> & {
          user_id: string;
          type: NotificationType;
          title: string;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["app_notifications"]["Row"]>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint_hash: string;
          browser: string;
          permission: NotificationPermission | "unsupported";
          status: "placeholder" | "active" | "revoked";
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["push_subscriptions"]["Row"]> & {
          user_id: string;
          endpoint_hash: string;
          browser: string;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Row"]>;
        Relationships: [];
      };
      provider_sync_events: {
        Row: {
          id: string;
          user_id: string;
          provider_connection_id: string;
          provider: BankProvider;
          status: ConnectionLifecycleStatus;
          message: string;
          started_at: string;
          finished_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["provider_sync_events"]["Row"]> & {
          user_id: string;
          provider_connection_id: string;
          provider: BankProvider;
          status: ConnectionLifecycleStatus;
          message: string;
          started_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["provider_sync_events"]["Row"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          user_id: string;
          event_type: string;
          entity: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_log"]["Row"]> & {
          user_id: string;
          event_type: string;
          entity: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
