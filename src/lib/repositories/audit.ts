import type { Json } from "@/lib/supabase/database.types";

export type AuditEventType =
  | "account_purpose_changed"
  | "account_inclusion_flag_changed"
  | "manual_finance_item_created"
  | "manual_finance_item_updated"
  | "manual_finance_item_deleted"
  | "bank_connection_created"
  | "bank_connection_status_changed"
  | "consent_status_changed";

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
