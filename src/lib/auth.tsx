import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteAccount as deleteAccountFn,
  ensureBootstrap,
  normalisePhone,
  phoneEmail,
  provisionAccount,
  requestAccessHelp,
  resetOneTimePassword,
  setAccountActive,
  signInWithPin,
} from "./accounts.functions";

export type Role = "admin" | "support" | "finance" | "operator" | "agent";

export const roleLabels: Record<Role, string> = {
  admin: "Super Admin",
  support: "Support Staff",
  finance: "Finance",
  operator: "Canteen operator",
  agent: "Field agent",
};

/** Where each role lands after signing in. */
export const homeForRole = (role: Role) =>
  role === "operator" ? "/" : role === "agent" ? "/agent" : "/admin";

export const isAdminRole = (role: Role) =>
  role === "admin" || role === "support" || role === "finance";

export type Account = {
  id: string;
  name: string;
  email: string;
  /** Only present right after creation — the one-time password to hand over. */
  password?: string;
  role: Role;
  /** School / canteen the operator runs (blank for the platform admin). */
  school: string;
  phone?: string;
  createdAt: number;
  active: boolean;
  /** True until the person has replaced the one-time password with a PIN. */
  otpPending?: boolean;
  /** Locked out after four wrong PIN tries. */
  pinLocked?: boolean;
  /** They tapped "Forgot PIN" and are waiting for a new one-time password. */
  pinResetRequested?: boolean;
};

type ProfileRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  school: string;
  active: boolean;
  otp_pending: boolean;
  pin_locked?: boolean;
  pin_reset_requested?: boolean;
  created_at: string;
};

type CreateInput = {
  name: string;
  email?: string;
  password?: string;
  school: string;
  phone?: string;
};

type Result = { ok: boolean; error?: string; account?: Account };

type Ctx = {
  accounts: Account[];
  user: Account | null;
  ready: boolean;
  login: (identifier: string, password: string) => Promise<{ ok: boolean; role?: Role; error?: string }>;
  loginWithPin: (
    phone: string,
    pin: string,
  ) => Promise<{ ok: boolean; role?: Role; error?: string; locked?: boolean }>;
  requestHelp: (phone: string) => Promise<void>;
  logout: () => Promise<void>;
  createOperator: (input: CreateInput) => Promise<Result>;
  createAccount: (input: CreateInput & { role: Role }) => Promise<Result>;
  toggleAccount: (id: string) => Promise<void>;
  removeAccount: (id: string) => Promise<{ ok: boolean; error?: string }>;
  resendOtp: (id: string) => Promise<{ ok: boolean; otp?: string; error?: string }>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

const toAccount = (p: ProfileRow, role: Role): Account => ({
  id: p.id,
  name: p.full_name,
  email: p.email ?? "",
  role,
  school: p.school,
  ...(p.phone ? { phone: p.phone } : {}),
  createdAt: new Date(p.created_at).getTime(),
  active: p.active,
  otpPending: p.otp_pending,
  pinLocked: !!p.pin_locked,
  pinResetRequested: !!p.pin_reset_requested,
});

/** Staff sign in with an email; operators and agents sign in with a phone number. */
const loginEmailFor = (identifier: string) => {
  const v = identifier.trim();
  return v.includes("@") ? v.toLowerCase() : phoneEmail(v);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [user, setUser] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);

  const loadDirectory = useCallback(async (uid: string | null) => {
    if (!uid) {
      setUser(null);
      setAccounts([]);
      return;
    }
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const roleFor = new Map<string, Role>();
    (roles ?? []).forEach((r) => roleFor.set(r.user_id, r.role as Role));
    const list = (profiles ?? []).map((p) =>
      toAccount(p as ProfileRow, roleFor.get(p.id) ?? "operator"),
    );
    setAccounts(list);
    setUser(list.find((a) => a.id === uid) ?? null);
  }, []);

  useEffect(() => {
    let alive = true;

    // Keep the session in sync; the directory reload happens outside the callback.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "SIGNED_OUT") {
        setUser(null);
        setAccounts([]);
        return;
      }
      if (session?.user) void loadDirectory(session.user.id);
    });

    (async () => {
      try {
        await ensureBootstrap();
      } catch {
        /* bootstrap is best-effort */
      }
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      await loadDirectory(data.session?.user.id ?? null);
      if (alive) setReady(true);
    })();

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadDirectory]);

  const login = useCallback<Ctx["login"]>(async (identifier, password) => {
    const email = loginEmailFor(identifier);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return { ok: false, error: "Phone/email or password is not correct." };
    }
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", data.user.id),
    ]);
    if (profile && !profile.active) {
      await supabase.auth.signOut();
      return { ok: false, error: "This account has been paused by the administrator." };
    }
    const role = ((roleRows ?? [])[0]?.role as Role) ?? "operator";
    await supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id);
    await loadDirectory(data.user.id);
    return { ok: true, role };
  }, [loadDirectory]);

  const loginWithPin = useCallback<Ctx["loginWithPin"]>(
    async (phone, pin) => {
      const res = await signInWithPin({ data: { phone, pin } });
      if (!res.ok) {
        return {
          ok: false,
          error: res.error,
          ...("locked" in res && res.locked ? { locked: true } : {}),
        };
      }
      const { data, error } = await supabase.auth.verifyOtp({
        email: res.email,
        token: res.code,
        type: "email",
      });
      if (error || !data.user) return { ok: false, error: "Could not open your session." };
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      const role = ((roleRows ?? [])[0]?.role as Role) ?? "operator";
      await supabase
        .from("profiles")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", data.user.id);
      await loadDirectory(data.user.id);
      return { ok: true, role };
    },
    [loadDirectory],
  );

  const requestHelp = useCallback(async (phone: string) => {
    try {
      await requestAccessHelp({ data: { phone } });
    } catch {
      /* the admin can also be reached on WhatsApp */
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAccounts([]);
  }, []);

  const createAccount = useCallback<Ctx["createAccount"]>(
    async (input) => {
      const name = input.name.trim();
      const phone = normalisePhone(input.phone ?? "");
      if (!name) return { ok: false, error: "Please enter the person's full name." };
      if (phone.length < 9) return { ok: false, error: "Please enter a valid phone number." };

      const res = await provisionAccount({
        data: {
          name,
          phone,
          role: input.role,
          school: input.school ?? "",
          ...(input.email?.trim() ? { email: input.email.trim().toLowerCase() } : {}),
        },
      });
      if (!res.ok) return { ok: false, error: res.error };

      const account: Account = {
        id: res.id,
        name,
        email: input.email?.trim().toLowerCase() ?? "",
        password: res.otp,
        role: input.role,
        school: input.school ?? "",
        phone: res.phone,
        createdAt: Date.now(),
        active: true,
        otpPending: true,
      };
      setAccounts((list) => [...list, account]);
      return { ok: true, account };
    },
    [],
  );

  const createOperator = useCallback<Ctx["createOperator"]>(
    (input) => createAccount({ ...input, role: "operator" }),
    [createAccount],
  );

  const toggleAccount = useCallback(
    async (id: string) => {
      const current = accounts.find((a) => a.id === id);
      const next = !(current?.active ?? true);
      setAccounts((list) => list.map((a) => (a.id === id ? { ...a, active: next } : a)));
      await setAccountActive({ data: { id, active: next } });
    },
    [accounts],
  );

  const removeAccount = useCallback<Ctx["removeAccount"]>(async (id) => {
    const res = await deleteAccountFn({ data: { id } });
    if (res.ok) setAccounts((list) => list.filter((a) => a.id !== id));
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }, []);

  const resendOtp = useCallback<Ctx["resendOtp"]>(async (id) => {
    const res = await resetOneTimePassword({ data: { id } });
    return res.ok ? { ok: true, otp: res.otp } : { ok: false, error: res.error };
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadDirectory(data.session?.user.id ?? null);
  }, [loadDirectory]);

  const value = useMemo<Ctx>(
    () => ({
      accounts,
      user,
      ready,
      login,
      loginWithPin,
      requestHelp,
      logout,
      createOperator,
      createAccount,
      toggleAccount,
      removeAccount,
      resendOtp,
      refresh,
    }),
    [accounts, user, ready, login, loginWithPin, requestHelp, logout, createOperator, createAccount, toggleAccount, removeAccount, resendOtp, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
