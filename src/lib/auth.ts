import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Profile {
  id: string;
  name: string;
  avatarUrl: string | null;
  discordId: string | null;
}

export function displayName(user: User): string {
  const md = user.user_metadata || {};
  return md.full_name || md.name || md.preferred_username || 'Discord user';
}

export function profileFromUser(user: User): Profile {
  const md = user.user_metadata || {};
  return {
    id: user.id,
    name: displayName(user),
    avatarUrl: md.avatar_url || md.picture || null,
    discordId: md.provider_id || null,
  };
}

/** Keeps the public profiles row in step with the Discord identity (as legacy auth.js did). */
export async function upsertProfileFromSession(session: Session | null): Promise<void> {
  const user = session?.user;
  if (!user) return;
  const md = user.user_metadata || {};
  await supabase.from('profiles').upsert(
    {
      id: user.id,
      discord_id: md.provider_id || null,
      discord_username: md.full_name || md.name || null,
      discord_avatar: md.avatar_url || md.picture || null,
    },
    { onConflict: 'id' },
  );
}

export async function checkIsAdmin(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function signInWithDiscord(redirectPath = '/profile'): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: window.location.origin + redirectPath },
  });
}

export async function signOutUser(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}
