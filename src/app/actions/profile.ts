'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { errorSummary, fieldErrors, profileSchema, type ProfileActionState } from '@/lib/validation';

/**
 * Update the signed-in user's display name.
 *
 * Two rules this must not break:
 *
 * 1. Identity comes from the session, never from the form. A `userId` in
 *    FormData is ignored outright — not validated and then discarded, which
 *    would still be a place to get the ownership check wrong.
 * 2. RLS is what actually prevents writing to someone else's row, and a denied
 *    update does not raise: it silently affects zero rows. So "no error" is not
 *    success. If the update returns no row, the policy blocked it and the
 *    user is told so, rather than being shown a confirmation that never
 *    happened.
 */
export async function updateProfile(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const parsed = profileSchema.safeParse({ fullName: formData.get('fullName') });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted field.',
      fieldErrors: fieldErrors(parsed.error),
      errors: errorSummary(parsed.error),
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName })
    .eq('id', user.id)
    .select('full_name')
    .maybeSingle();

  if (error) {
    // Logged raw, translated for the shopper. A column-grant or policy failure
    // is a server-side configuration problem the user cannot act on.
    console.error(`[profile] update failed for ${user.id}: ${error.message}`);
    return { status: 'error', message: 'We could not save your name. Please try again.' };
  }

  if (!data) {
    console.error(`[profile] update matched no row for ${user.id} — blocked by policy or grant`);
    return { status: 'error', message: 'We could not save your name. Please try again.' };
  }

  revalidatePath('/account');
  return { status: 'success' };
}
