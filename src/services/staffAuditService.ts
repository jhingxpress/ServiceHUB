import { supabase } from '../lib/supabase';

export interface StaffActionInput {
  action: string;
  targetTable?: string;
  targetRecordId?: string;
  targetUserId?: string;
  notes?: string;
}

export async function logStaffAction(input: StaffActionInput): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const staffId = sessionData.session?.user?.id;
  if (!staffId) return;

  const { error } = await supabase.from('staff_action_log').insert({
    staff_id: staffId,
    action: input.action,
    target_table: input.targetTable ?? null,
    target_record_id: input.targetRecordId ?? null,
    target_user_id: input.targetUserId ?? null,
    notes: input.notes?.trim() || null,
  });

  if (error) {
    console.error('[staffAudit] failed to log action:', error);
  }
}
