/**
 * Account provisioning for SmartCanteen.
 *
 * Operators and field agents are onboarded by phone number — an email is
 * optional, because many operators do not have one. Each new account gets a
 * one-time password that the admin forwards on WhatsApp; the operator then
 * sets a private PIN in Settings and uses that to unlock the app.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProvisionInput = {
  name: string;
  phone: string;
  role: "operator" | "agent" | "support" | "finance" | "admin";
  school: string;
  email?: string;
};

/** Digits only, Uganda-friendly: 0772… becomes 256772…. */
export function normalisePhone(raw: string) {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) return `256${d.slice(1)}`;
  if (d.startsWith("256")) return d;
  // Nine local digits typed without the country code (e.g. 772 000 000).
  if (d.length === 9) return `256${d}`;
  return d;
}

/** Login address derived from the phone number — never shown to the operator. */
export const phoneEmail = (phone: string) => `p${normalisePhone(phone)}@phone.smartcanteen.app`;

/**
 * One-time password the admin reads out to the operator. Supabase's
 * weak-password check rejects short or simple codes, so use ten random
 * letters and digits (no 0/O/1/I confusion).
 */
const otp = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const digits = "23456789";
  let out = "";
  for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  // guarantee at least two digits so it never reads as a plain word
  out = digits[Math.floor(Math.random() * digits.length)] + out.slice(1, 9) + digits[Math.floor(Math.random() * digits.length)];
  return out;
};


async function hashPin(pin: string, saltHex?: string) {
  const { randomBytes, scryptSync } = await import("node:crypto");
  const salt = saltHex ?? randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}$${hash}`;
}

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin") && !roles.includes("support")) throw new Error("Forbidden");
  return roles as string[];
}

/** Creates a working login for a new operator or field agent. */
export const provisionAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProvisionInput) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context as any);

    const phone = normalisePhone(data.phone);
    if (phone.length < 9) return { ok: false as const, error: "Enter a valid phone number." };
    const name = (data.name || "").trim();
    if (!name) return { ok: false as const, error: "Enter the person's full name." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existing = await supabaseAdmin.from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (existing.data) return { ok: false as const, error: "That phone number already has an account." };

    const password = otp();
    const created = await supabaseAdmin.auth.admin.createUser({
      email: phoneEmail(phone),
      password,
      email_confirm: true,
      user_metadata: { full_name: name, phone },
    });
    if (created.error || !created.data.user) {
      return { ok: false as const, error: created.error?.message ?? "Could not create the account." };
    }
    const id = created.data.user.id;

    const prof = await supabaseAdmin.from("profiles").insert({
      id,
      full_name: name,
      phone,
      email: data.email?.trim() || null,
      school: (data.school || "").trim(),
      created_by: context.userId,
    });
    if (prof.error) {
      await supabaseAdmin.auth.admin.deleteUser(id);
      return { ok: false as const, error: prof.error.message };
    }
    await supabaseAdmin.from("user_roles").insert({ user_id: id, role: data.role });

    return { ok: true as const, id, phone, otp: password };
  });

/** Pause or restore access without losing any data. */
export const setAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; active: boolean }) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    await supabaseAdmin.auth.admin.updateUserById(data.id, {
      ban_duration: data.active ? "none" : "876000h",
    });
    return { ok: true as const };
  });

/** Permanently removes an account and everything it owns. */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const roles = await assertStaff(context as any);
    if (!roles.includes("admin")) return { ok: false as const, error: "Only a super admin can delete accounts." };
    if (data.id === context.userId) return { ok: false as const, error: "You cannot delete your own account." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Issues a fresh one-time password when the operator lost the first one. */
export const resetOneTimePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = otp();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password });
    if (error) return { ok: false as const, error: error.message };
    await supabaseAdmin
      .from("profiles")
      .update({
        otp_pending: true,
        pin_hash: null,
        pin_fail_count: 0,
        pin_locked: false,
        pin_reset_requested: false,
        // Keep first_run_done as it was: a reset operator must choose a new
        // PIN, but must NOT be taken through the new-user term setup again.
      })
      .eq("id", data.id);
    return { ok: true as const, otp: password };
  });

/** The signed-in operator chooses the PIN they will unlock the app with. */
export const setMyPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { pin: string }) => data)
  .handler(async ({ data, context }) => {
    if (!/^[A-Za-z0-9]{4,32}$/.test(data.pin)) return { ok: false as const, error: "Use 4 or more letters or numbers." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        pin_hash: await hashPin(data.pin),
        otp_pending: false,
        pin_fail_count: 0,
        pin_locked: false,
        pin_reset_requested: false,
      })
      .eq("id", context.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Unlock check used by the PIN screen. */
export const verifyMyPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { pin: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("profiles")
      .select("pin_hash")
      .eq("id", context.userId)
      .maybeSingle();
    const stored = row?.pin_hash as string | null | undefined;
    if (!stored) return { ok: false as const, error: "No PIN set yet." };
    const [salt] = stored.split("$");
    const candidate = await hashPin(data.pin, salt);
    return candidate === stored ? { ok: true as const } : { ok: false as const, error: "Wrong PIN." };
  });

/**
 * First-run bootstrap. Creates the platform admin the very first time the app
 * is opened, so there is always someone who can onboard everyone else.
 * Does nothing once any account exists.
 */
export const ensureBootstrap = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return { ok: true as const, created: false };

  const seeds = [
    { email: "admin@smartcanteen.app", password: "admin1234", name: "Shadai Barbra", role: "admin", school: "SmartCanteen HQ", phone: "256700000001" },
    { email: "support@smartcanteen.app", password: "support1234", name: "Joan Atim", role: "support", school: "SmartCanteen HQ", phone: "256700000010" },
    { email: "finance@smartcanteen.app", password: "finance1234", name: "Denis Mugisha", role: "finance", school: "SmartCanteen HQ", phone: "256700000011" },
  ] as const;

  for (const s of seeds) {
    const created = await supabaseAdmin.auth.admin.createUser({
      email: s.email,
      password: s.password,
      email_confirm: true,
      user_metadata: { full_name: s.name },
    });
    const id = created.data.user?.id;
    if (!id) continue;
    await supabaseAdmin.from("profiles").insert({
      id,
      full_name: s.name,
      phone: s.phone,
      email: s.email,
      school: s.school,
      otp_pending: false,
    });
    await supabaseAdmin.from("user_roles").insert({ user_id: id, role: s.role });
  }
  return { ok: true as const, created: true };
});

/**
 * Live onboarding progress for the admin account list.
 *
 * Reads each operator's own cash book straight from the backend, so the
 * "Logged in / Opening capital / First stock / First sale" ticks on the admin
 * side reflect what the operator actually did — no separate copy of the truth.
 */
export const listAccountProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: books }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("canteen_books").select("user_id, data, updated_at"),
      supabaseAdmin.from("profiles").select("id, last_login_at"),
    ]);
    const loginAt = new Map<string, number | null>();
    (profiles ?? []).forEach((p: any) =>
      loginAt.set(p.id, p.last_login_at ? new Date(p.last_login_at).getTime() : null),
    );

    const rows = (books ?? []).map((b: any) => {
      const d = (b.data ?? {}) as any;
      const txs: any[] = Array.isArray(d.txs) ? d.txs : [];
      const capital = Number(d.capital ?? 0);
      return {
        accountId: b.user_id as string,
        entries: txs.filter((t) => t.type !== "capital").length,
        lastLoginAt: loginAt.get(b.user_id) ?? null,
        checklist: {
          loggedIn: !!loginAt.get(b.user_id),
          capitalSet: capital > 0 || txs.some((t) => t.type === "capital"),
          firstStock: txs.some((t) => t.type === "stock"),
          firstSale: txs.some((t) => t.type === "sale"),
        },
      };
    });

    // Accounts that have logged in but never written a book yet still tick "logged in".
    (profiles ?? []).forEach((p: any) => {
      if (rows.some((r) => r.accountId === p.id)) return;
      rows.push({
        accountId: p.id,
        entries: 0,
        lastLoginAt: loginAt.get(p.id) ?? null,
        checklist: {
          loggedIn: !!loginAt.get(p.id),
          capitalSet: false,
          firstStock: false,
          firstSale: false,
        },
      });
    });

    return { ok: true as const, rows };
  });

/** How many wrong PIN tries are allowed before the account is locked. */
export const PIN_MAX_TRIES = 4;

/**
 * PIN sign-in. Public on purpose — it is the operator's front door — and
 * protected by locking the account after four wrong tries.
 */
export const signInWithPin = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string; pin: string }) => data)
  .handler(async ({ data }) => {
    const phone = normalisePhone(data.phone);
    const fail = { ok: false as const, error: "Phone number or PIN is not correct." };
    if (phone.length < 9 || !/^[A-Za-z0-9]{4,32}$/.test(data.pin)) return fail;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id, active, pin_hash, pin_fail_count, pin_locked")
      .eq("phone", phone)
      .maybeSingle();
    if (!row) return fail;
    if (!row.active) {
      return { ok: false as const, error: "This account has been paused by the administrator." };
    }
    if (row.pin_locked) {
      return {
        ok: false as const,
        locked: true as const,
        error: "Too many wrong PINs. Ask the administrator for a new PIN.",
      };
    }
    const stored = row.pin_hash as string | null;
    if (!stored) {
      return {
        ok: false as const,
        error: "No PIN set yet — sign in with your one-time password first.",
      };
    }

    const [salt] = stored.split("$");
    if ((await hashPin(data.pin, salt)) !== stored) {
      const tries = (row.pin_fail_count ?? 0) + 1;
      const locked = tries >= PIN_MAX_TRIES;
      await supabaseAdmin
        .from("profiles")
        .update({ pin_fail_count: tries, pin_locked: locked })
        .eq("id", row.id);
      return locked
        ? {
            ok: false as const,
            locked: true as const,
            error: "Too many wrong PINs. Ask the administrator for a new PIN.",
          }
        : {
            ok: false as const,
            triesLeft: PIN_MAX_TRIES - tries,
            error: `Wrong PIN. ${PIN_MAX_TRIES - tries} ${
              PIN_MAX_TRIES - tries === 1 ? "try" : "tries"
            } left.`,
          };
    }

    await supabaseAdmin
      .from("profiles")
      .update({ pin_fail_count: 0, pin_locked: false, pin_reset_requested: false })
      .eq("id", row.id);

    // Hand the browser a one-time code it can exchange for a real session.
    const link = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: phoneEmail(phone),
    });
    const code = link.data?.properties?.email_otp;
    if (link.error || !code) {
      return { ok: false as const, error: "Could not open your session. Try again." };
    }
    return { ok: true as const, email: phoneEmail(phone), code };
  });

/** "Forgot PIN" / "Forgot password" — tells the administrator to issue a new one. */
export const requestAccessHelp = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string }) => data)
  .handler(async ({ data }) => {
    const phone = normalisePhone(data.phone);
    if (phone.length >= 9) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("profiles").update({ pin_reset_requested: true }).eq("phone", phone);
    }
    // Always the same answer, so nobody can fish for who has an account.
    return { ok: true as const };
  });

/** What the app needs to know right after sign-in to decide where to send someone. */
export const myFirstRunState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("otp_pending, first_run_done, pin_hash")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      ok: true as const,
      otpPending: !!data?.otp_pending,
      firstRunDone: !!data?.first_run_done,
      hasPin: !!data?.pin_hash,
    };
  });

/** Marks the guided first-time setup (PIN + term capital) as finished. */
export const markFirstRunDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ first_run_done: true, otp_pending: false })
      .eq("id", context.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
