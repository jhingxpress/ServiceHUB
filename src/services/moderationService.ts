import { supabase } from '../lib/supabase';

export interface ModerationActionResult {
  success: boolean;
  error?: string;
}

/**
 * Suspend a provider account
 */
export async function adminSuspendProvider(
  providerId: string,
  reason?: string
): Promise<ModerationActionResult> {
  const { error } = await supabase.rpc('admin_suspend_provider', {
    p_provider_id: providerId,
    p_reason: reason || null,
  });

  if (error) {
    console.error('adminSuspendProvider error:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Ban a user account
 */
export async function adminBanUser(
  userId: string,
  reason?: string
): Promise<ModerationActionResult> {
  const { error } = await supabase.rpc('admin_ban_user', {
    p_user_id: userId,
    p_reason: reason || null,
  });

  if (error) {
    console.error('adminBanUser error:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Hide a review
 */
export async function adminHideReview(
  reviewId: string,
  reason?: string
): Promise<ModerationActionResult> {
  const { error } = await supabase.rpc('admin_hide_review', {
    p_review_id: reviewId,
    p_reason: reason || null,
  });

  if (error) {
    console.error('adminHideReview error:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Revoke a provider's verification status
 */
export async function adminRevokeVerification(
  providerId: string,
  reason?: string
): Promise<ModerationActionResult> {
  const { error } = await supabase.rpc('admin_revoke_verification', {
    p_provider_id: providerId,
    p_reason: reason || null,
  });

  if (error) {
    console.error('adminRevokeVerification error:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Remove a chat image from a message
 */
export async function adminRemoveChatImage(
  messageId: string,
  reason?: string
): Promise<ModerationActionResult> {
  const { error } = await supabase.rpc('admin_remove_chat_image', {
    p_message_id: messageId,
    p_reason: reason || null,
  });

  if (error) {
    console.error('adminRemoveChatImage error:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Activate a previously suspended or banned user account
 */
export async function adminActivateUser(
  userId: string
): Promise<ModerationActionResult> {
  const { error } = await supabase.rpc('admin_activate_user', {
    p_user_id: userId,
  });

  if (error) {
    console.error('adminActivateUser error:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Fetch moderation log with pagination
 */
export async function fetchModerationLog(
  page = 0,
  pageSize = 50,
  filters?: { targetType?: string; action?: string }
) {
  let query = supabase
    .from('moderation_log')
    .select('*, admin:admin_id(full_name), target_user:target_user_id(full_name)')
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (filters?.targetType) {
    query = query.eq('target_type', filters.targetType);
  }
  if (filters?.action) {
    query = query.eq('action', filters.action);
  }

  return await query;
}
