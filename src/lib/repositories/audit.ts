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
  | "bank_connection_callback_failed"
  | "bank_connection_status_changed"
  | "bank_connection_sync_started"
  | "bank_connection_sync_completed"
  | "bank_connection_sync_failed"
  | "bank_connection_revoked"
  | "bank_connection_scheduled_sync_started"
  | "bank_connection_scheduled_sync_completed"
  | "consent_status_changed"
  | "provider_sync_event_created"
  | "provider_webhook_event_received"
  | "provider_webhook_event_processed"
  | "sync_job_enqueued"
  | "sync_job_completed"
  | "sync_job_failed"
  | "notification_preference_changed"
  | "notification_created"
  | "notification_marked_read"
  | "notification_dismissed"
  | "push_notification_permission_requested"
  | "push_subscription_placeholder_saved"
  | "push_subscription_placeholder_deleted"
  | "push_subscription_saved"
  | "push_subscription_deleted"
  | "push_test_requested"
  | "notification_delivery_attempt_created"
  | "scheduled_notifications_started"
  | "scheduled_notifications_completed"
  | "scheduled_notification_duplicate_suppressed"
  | "ai_money_coach_requested"
  | "ai_money_coach_failed"
  | "ai_insight_created";

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
