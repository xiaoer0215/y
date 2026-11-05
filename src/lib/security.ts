export type PasswordScope = "account.password.change" | "account.password.set";
export interface VerificationRequirements {
  scope: PasswordScope;
  methods: { method: string; available: boolean; reason?: string }[];
  oauth_providers?: { slug: string; name: string }[];
  password_encryption_enabled?: boolean;
}
export interface LoginSession {
  sid: string;
  current?: boolean;
  is_current?: boolean;
  user_agent?: string;
  ip?: string;
  created_at?: number;
  last_seen_at?: number;
  last_active_at?: number;
  expires_at?: number;
}
export interface SecurityOverview {
  user: { has_password?: boolean; email?: string; username?: string };
  twofa?: {
    enabled: boolean;
    locked?: boolean;
    backup_codes_remaining?: number;
  };
  sessions?: LoginSession[];
  twofa_error?: string;
  sessions_error?: string;
}
export interface RegisterPayload {
  username: string;
  password: string;
  email?: string;
  verification_code?: string;
  aff_code?: string;
}
