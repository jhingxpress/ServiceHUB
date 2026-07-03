import { supabase } from '../lib/supabase';
import { Escalation, EscalationStatus } from '../types';

export interface CreateEscalationInput {
  targetTable?: string;
  targetRecordId?: string;
  targetUserId?: string;
  reason: string;
  notes?: string;
}

export async function createEscalation(input: CreateEscalationInput): Promise<{ data?: Escalation; error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: 'Not authenticated' };
  }

  const { data, error } = await supabase
    .from('escalations')
    .insert({
      created_by: userData.user.id,
      target_table: input.targetTable ?? null,
      target_record_id: input.targetRecordId ?? null,
      target_user_id: input.targetUserId ?? null,
      reason: input.reason,
      notes: input.notes?.trim() ?? null,
    })
    .select('*, created_by_user:created_by(full_name, email, role), assigned_to_user:assigned_to(full_name, email, role), target_user:target_user_id(full_name, email)')
    .single();

  if (error) {
    console.error('[escalationService] create error:', error);
    return { error: error.message };
  }

  return { data: data as unknown as Escalation };
}

export async function fetchEscalations(): Promise<{ data?: Escalation[]; error?: string }> {
  const { data, error } = await supabase
    .from('escalations')
    .select('*, created_by_user:created_by(full_name, email, role), assigned_to_user:assigned_to(full_name, email, role), target_user:target_user_id(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[escalationService] fetch error:', error);
    return { error: error.message };
  }

  return { data: (data ?? []) as unknown as Escalation[] };
}

export async function updateEscalationStatus(
  escalationId: string,
  status: EscalationStatus,
  notes?: string
): Promise<{ data?: Escalation; error?: string }> {
  const update: Record<string, unknown> = { status };
  if (notes !== undefined) {
    update.notes = notes.trim() || null;
  }
  if (status === 'resolved' || status === 'dismissed') {
    update.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('escalations')
    .update(update)
    .eq('id', escalationId)
    .select('*, created_by_user:created_by(full_name, email, role), assigned_to_user:assigned_to(full_name, email, role), target_user:target_user_id(full_name, email)')
    .single();

  if (error) {
    console.error('[escalationService] update error:', error);
    return { error: error.message };
  }

  return { data: data as unknown as Escalation };
}
