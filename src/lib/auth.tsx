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
  repairAdminLogin,
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
  ) => Promise<{ ok: boolean; role?: Role; userId?: string; error?: string; locked?: boolean }>;
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
const AUTH_CACHE = "smartcanteen.auth.directory.v1";

function readAuthCache(): Account[] {
  try {
    return JSON.parse(localStorage.getItem(AUTH_CACHE) ?? "[]") as Account[];
  } catch {
    return [];
  }
}

function writeAuthCache(accounts: Account[]) {
  try {
    localStorage.setItem(AUTH_CACHE, JSON.stringify(accounts));
  } catch {
    /* Device storage may be unavailable in private browsing. */
  }
}

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
    const cached = readAuthCache();
    try {
      const [profilesResult, rolesResult] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profilesResult.error || rolesResult.error) throw profilesResult.error ?? rolesResult.error;
      const roleFor = new Map<string, Role>();
      (rolesResult.data ?? []).forEach((r) => roleFor.set(r.user_id, r.role as Role));
      const list = (profilesResult.data ?? []).map((p) =>
        toAccount(p as ProfileRow, roleFor.get(p.id) ?? "operator"),
      );
      const current = list.find((a) => a.id === uid) ?? cached.find((a) => a.id === uid) ?? null;
      setAccounts(list.length ? list : cached);
      setUser(current);
      if (list.length) writeAuthCache(list);
    } catch {
      // The signed-in operator must remain identifiable when the school has no data signal.
      setAccounts(cached);
      setUser(cached.find((a) => a.id === uid) ?? null);
    }
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
      // Supabase keeps the last valid session on this device. Restore the cached
      // account first; network directory checks happen afterwards.
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      const sessionUser = data.session?.user;
      const uid = sessionUser?.id ?? null;
      if (uid) {
        const cached = readAuthCache();
        let current = cached.find((a) => a.id === uid) ?? null;
        if (!current && sessionUser) {
          const meta = sessionUser.user_metadata ?? {};
          current = {
            id: uid,
            name: String(meta.full_name ?? meta.name ?? "Canteen operator"),
            email: sessionUser.email ?? "",
            role: (meta.role as Role | undefined) ?? "operator",
            school: String(meta.school ?? ""),
            phone: String(meta.phone ?? sessionUser.phone ?? ""),
            createdAt: new Date(sessionUser.created_at).getTime(),
            active: true,
          };
          writeAuthCache([...cached, current]);
        }
        setAccounts(current ? [...cached.filter((a) => a.id !== uid), current] : cached);
        setUser(current);
      }
      setReady(true);
      try {
        await ensureBootstrap();
        // Ensure Super Admin email login always works (admin@smartcanteen.app).
        await repairAdminLogin();
      } catch {
        /* bootstrap is best-effort */
      }
      await loadDirectory(uid);
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
      return { ok: true, role, userId: data.user.id };
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
    try {
      const res = await resetOneTimePassword({ data: { id } });
      return res.ok ? { ok: true, otp: res.otp } : { ok: false, error: res.error };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not reach the server." };
    }
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
