import type { Json } from "@/lib/supabase/database.types";

export type AuditEventType =
  | "account_purpose_changed"
  | "account_inclusion_flag_changed"
  | "manual_finance_item_created"
  | "manual_finance_item_updated"
  | "manual_finance_item_deleted"
  | "bank_connection_created"
  | "bank_connection_start_requested"
  | "bank_connection_callback_handled"
  | "bank_connection_status_changed"
  | "bank_connection_sync_started"
  | "bank_connection_sync_completed"
  | "bank_connection_sync_failed"
  | "bank_connection_revoked"
  | "consent_status_changed"
  | "provider_sync_event_created"
  | "notification_preference_changed"
  | "notification_created"
  | "notification_marked_read"
  | "notification_dismissed"
  | "push_notification_permission_requested"
  | "push_subscription_placeholder_saved"
  | "push_subscription_placeholder_deleted";

export type AuditEventInput = {
  userId: string;
  eventType: AuditEventType;
  entity: string;
  entityId: string | null;
  metadata?: Json;
};

export function createAuditEvent(input: AuditEventInput) {
  return {
    user_id: input.userId,
    event_type: input.eventType,
    entity: input.entity,
    entity_id: input.entityId,
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString(),
  };
}
