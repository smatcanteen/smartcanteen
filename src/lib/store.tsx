import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type TxType = "sale" | "expense" | "stock" | "capital";

export type TxEdit = {
  at: number;
  /** Plain-language note of what changed, e.g. "Amount 24,000 → 20,000". */
  note: string;
};

export type Tx = {
  id: string;
  type: TxType;
  label: string;
  amount: number;
  category?: string;
  /** Optional item breakdown for itemised sales. */
  lines?: { itemId: string; name: string; qty: number }[];
  /** Stock purchases remember which shelf item and how many units they added. */
  itemId?: string;
  units?: number;
  sell?: number;
  /** Every correction made to this entry, newest last. */
  edits?: TxEdit[];
  ts: number;
};

/** An item the operator stocks regularly, remembered for next time. */
export type SavedItem = {
  id: string;
  name: string;
  /** Usual buying price per unit. */
  buy: number;
  /** Usual selling price per unit. */
  sell: number;
  pack?: string;
  unitsPerPack?: number;
};


export type StockItem = {
  id: string;
  name: string;
  /** Total units bought this term. */
  qty: number;
  /** Units still on the shelf. */
  stock: number;
  /** Total buying price paid. */
  buy: number;
  /** Selling price per unit. */
  sell: number;
  /** How the item is sold, e.g. "Piece", "Crate of 24". */
  pack?: string;
  /** Units contained in one package (1 = sold as ones). */
  unitsPerPack?: number;
};

/** One payment made against a student's credit. */
export type DebtPayment = { id: string; amount: number; ts: number };

export type Debtor = {
  id: string;
  name: string;
  klass: string;
  item: string;
  /** How many units were given on credit. */
  qty?: number;
  amount: number;
  paid: boolean;
  ts: number;
  /** Every part-payment, so the running balance is always traceable. */
  payments?: DebtPayment[];
};


export type Payment = { id: string; amount: number; note: string; ts: number };

export type ExpenseCategory = { id: string; label: string; icon: string };

export type TermRecord = {
  id: string;
  name: string;
  capital: number;
  target: number;
  startedAt: number;
  closedAt: number;
  sales: number;
  expenses: number;
  stockSpend: number;
  profit: number;
  txs: Tx[];
  items: StockItem[];
};

export type State = {
  termName: string;
  termStartedAt: number;
  pin: string | null;
  autoLockMin: number;
  theme: "light" | "dark";
  fontScale: number;
  payments: Payment[];
  capital: number;
  /** Money the operator wants to be holding by the end of the term. */
  savingsGoal: number;
  items: StockItem[];
  txs: Tx[];
  debtors: Debtor[];
  expenseCategories: ExpenseCategory[];
  /** The operator's own regular shopping list, private to this account. */
  savedItems?: SavedItem[];
  terms: TermRecord[];

  /** False until the operator has done the canteen setup (term + opening cash). */
  setupDone?: boolean;
};

const STORAGE_BASE = "smartcanteen.v2";
/** Every account keeps its own cash book; nothing is shared between logins. */
export const storeKeyFor = (userId: string | null | undefined) =>
  userId ? `${STORAGE_BASE}.${userId}` : STORAGE_BASE;


/** Deterministic timestamps so server and client render the same demo data. */
const ANCHOR = Date.UTC(2026, 7, 14, 9, 0, 0);
const days = (n: number) => ANCHOR - n * 86400000;

export const defaultExpenseCategories: ExpenseCategory[] = [
  { id: "c1", label: "Transport", icon: "local_shipping" },
  { id: "c2", label: "Salary/Wages", icon: "badge" },
  { id: "c3", label: "Allowances", icon: "volunteer_activism" },
  { id: "c4", label: "Rent", icon: "home_work" },
  { id: "c5", label: "Foodstuffs", icon: "restaurant" },
  { id: "c6", label: "Cooking Gas", icon: "propane_tank" },
  { id: "c7", label: "Water", icon: "water_drop" },
  { id: "c8", label: "Packaging", icon: "inventory_2" },
  { id: "c9", label: "Utensils/Repairs", icon: "handyman" },
  { id: "c10", label: "Airtime", icon: "smartphone" },
  { id: "c11", label: "Data", icon: "wifi" },
  { id: "c12", label: "Miscellaneous", icon: "more_horiz" },
];

const seed: State = {
  termName: "Term 2, 2026",
  termStartedAt: days(10),
  pin: null,
  autoLockMin: 5,
  theme: "light",
  fontScale: 1,
  payments: [],
  capital: 473000,
  savingsGoal: 900000,
  expenseCategories: defaultExpenseCategories,
  items: [
    { id: "i1", name: "Mandazi", qty: 200, stock: 148, buy: 40000, sell: 500, pack: "Piece", unitsPerPack: 1 },
    { id: "i2", name: "Soda (300ml)", qty: 96, stock: 61, buy: 96000, sell: 1500, pack: "Crate of 24", unitsPerPack: 24 },
    { id: "i3", name: "Water Bottle", qty: 120, stock: 84, buy: 72000, sell: 1000, pack: "Box of 12", unitsPerPack: 12 },
  ],
  txs: [
    { id: "t0", type: "capital", label: "Opening term capital", amount: 473000, ts: days(9) },
    { id: "t1", type: "stock", label: "Mandazi restock", amount: 40000, ts: days(8) },
    { id: "t2", type: "stock", label: "Soda (300ml) restock", amount: 96000, ts: days(8) },
    { id: "t3", type: "stock", label: "Water Bottle restock", amount: 72000, ts: days(8) },
    { id: "t4", type: "sale", label: "Cash sale", amount: 86000, ts: days(2) },
    { id: "t5", type: "expense", label: "Transport", category: "Transport", amount: 15000, ts: days(1) },
    { id: "t6", type: "sale", label: "Cash sale", amount: 120000, ts: days(1) + 3600000 },
    { id: "t7", type: "expense", label: "Allowance — Sarah", category: "Allowances", amount: 30000, ts: days(1) + 7200000 },
  ],
  debtors: [
    { id: "d1", name: "Brian Okello", klass: "S3 East", item: "Soda & Mandazi", amount: 4500, paid: false, ts: days(6) },
    { id: "d2", name: "Aisha Nakato", klass: "S1 West", item: "Water Bottle", amount: 2000, paid: false, ts: days(2) },
  ],
  terms: [
    {
      id: "term-1",
      name: "Term 1, 2026",
      capital: 400000,
      target: 800000,
      startedAt: days(160),
      closedAt: days(95),
      sales: 1420000,
      expenses: 310000,
      stockSpend: 760000,
      profit: 350000,
      txs: [
        { id: "p1", type: "capital", label: "Opening term capital", amount: 400000, ts: days(160) },
        { id: "p2", type: "stock", label: "Mandazi restock", amount: 260000, ts: days(158) },
        { id: "p3", type: "stock", label: "Soda (300ml) restock", amount: 300000, ts: days(150) },
        { id: "p4", type: "stock", label: "Water Bottle restock", amount: 200000, ts: days(140) },
        { id: "p5", type: "sale", label: "Cash sales (week 1-4)", amount: 720000, ts: days(130) },
        { id: "p6", type: "sale", label: "Cash sales (week 5-8)", amount: 700000, ts: days(105) },
        { id: "p7", type: "expense", label: "Transport", category: "Transport", amount: 120000, ts: days(120) },
        { id: "p8", type: "expense", label: "Salary/Wages", category: "Salary/Wages", amount: 150000, ts: days(110) },
        { id: "p9", type: "expense", label: "Cooking Gas", category: "Cooking Gas", amount: 40000, ts: days(100) },
      ],
      items: [
        { id: "pi1", name: "Mandazi", qty: 600, stock: 20, buy: 260000, sell: 500, pack: "Piece", unitsPerPack: 1 },
        { id: "pi2", name: "Soda (300ml)", qty: 240, stock: 12, buy: 300000, sell: 1500, pack: "Crate of 24", unitsPerPack: 24 },
      ],
    },
  ],
};

seed.setupDone = true;

/** A brand new account starts completely empty — no demo figures at all. */
export const emptyState = (): State => ({
  termName: "",
  termStartedAt: Date.now(),
  pin: null,
  autoLockMin: 5,
  theme: "light",
  fontScale: 1,
  payments: [],
  capital: 0,
  savingsGoal: 0,
  expenseCategories: defaultExpenseCategories,
  savedItems: [],
  items: [],

  txs: [],
  debtors: [],
  terms: [],
  setupDone: false,
});

/**
 * Writes a brand-new operator's cash book straight after their account is
 * created, so they log in with their opening capital already in place.
 */
export function seedAccountBook(
  userId: string,
  opts: { capital: number; termName: string; goal?: number },
) {
  const base = emptyState();
  const capital = Math.max(0, Math.round(opts.capital || 0));
  const next: State = {
    ...base,
    termName: opts.termName,
    capital,
    savingsGoal: opts.goal || capital * 2,
    setupDone: capital > 0 && !!opts.termName,
    txs: capital
      ? [
          {
            id: Math.random().toString(36).slice(2, 10),
            type: "capital",
            label: "Opening term capital",
            amount: capital,
            ts: Date.now(),
          },
        ]
      : [],
  };
  try {
    localStorage.setItem(storeKeyFor(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Only the seeded demo operator sees the sample cash book. */
const DEMO_IDS = new Set(["acc-op-1"]);



type Ctx = {
  state: State;
  hydrated: boolean;
  cashAtHand: number;
  shelfValueAtCost: number;
  /** Cash + shelf stock minus what the term started with. */
  termProfit: number;
  totals: { sales: number; expenses: number; stock: number };
  today: { sales: number; expenses: number; net: number };
  addTx: (tx: Omit<Tx, "id" | "ts"> & { ts?: number }) => void;
  sellItems: (
    picked: { itemId: string; qty: number }[],
    opts?: { ts?: number; credit?: boolean },
  ) => { label: string; total: number };
  addStockItems: (
    entries: {
      name: string;
      qty: number;
      buy: number;
      sell: number;
      pack?: string;
      unitsPerPack?: number;
      ts?: number;
    }[],
  ) => void;
  /** Corrects a saved entry and re-adjusts cash, stock and profit by the difference. */
  editTx: (
    id: string,
    patch: {
      amount?: number;
      label?: string;
      category?: string;
      ts?: number;
      units?: number;
      sell?: number;
      lines?: { itemId: string; qty: number }[];
    },
  ) => void;
  /** Removes an entry completely, putting back any stock it moved. */
  deleteTx: (id: string) => void;
  saveMyItem: (item: Omit<SavedItem, "id">) => void;
  removeMyItem: (id: string) => void;
  setCapital: (amount: number, termName: string, goal: number) => void;
  settleDebtor: (id: string) => void;
  /** Records a part or full payment against a debt, on the date it happened. */
  payDebtor: (id: string, amount: number, ts?: number) => void;
  addDebtor: (d: Omit<Debtor, "id" | "ts" | "paid">) => void;
  /** Corrects the units left on the shelf after a physical count. */
  setStockCount: (itemId: string, counted: number) => void;

  undoLast: () => void;

  setPin: (pin: string | null, autoLockMin: number) => void;
  addPayment: (amount: number, note: string) => void;
  addExpenseCategory: (label: string, icon: string) => void;
  removeExpenseCategory: (id: string) => void;
  setTheme: (theme: "light" | "dark") => void;
  setFontScale: (scale: number) => void;
  archiveTerm: (newTermName: string, carryCash: number, target: number) => void;
  restoreState: (next: State) => void;
  clearAll: () => void;
  /** Force an immediate cloud save (used right after first-time setup). */
  saveNow: () => Promise<void>;
  /** True once the cloud copy has been checked (or the device is offline). */
  cloudChecked: boolean;
};

const StoreContext = createContext<Ctx | null>(null);

const uid = () => Math.random().toString(36).slice(2, 10);
const isToday = (ts: number) => new Date(ts).toDateString() === new Date().toDateString();

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const userId = user?.id ?? null;
  const baseFor = useCallback(
    (id: string | null) => (id && DEMO_IDS.has(id) ? { ...seed } : emptyState()),
    [],
  );
  const [state, setState] = useState<State>(seed);
  const [hydrated, setHydrated] = useState(false);
  /** Blocks cloud writes until we know what the cloud already holds. */
  const [syncReady, setSyncReady] = useState(false);
  /** Set when a write failed (offline); the next change retries everything. */
  const pendingRef = useRef(false);
  /** Flipped once we know what the cloud holds (or that we cannot reach it). */
  const [cloudChecked, setCloudChecked] = useState(false);

  // Load (or create) the cash book that belongs to the signed-in account.
  // Local storage answers instantly (so the app works offline), then the
  // cloud copy is merged in when it is newer.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setHydrated(false);
    setSyncReady(false);
    setCloudChecked(false);
    const base = baseFor(userId);
    // Read the device timestamp BEFORE the first local save stamps a new one,
    // otherwise the cloud copy always looks older and gets overwritten.
    const localAt = Number(localStorage.getItem(`${storeKeyFor(userId)}.updatedAt`) ?? 0);
    let local: State = base;
    try {
      const raw = localStorage.getItem(storeKeyFor(userId));
      if (raw) local = { ...base, ...(JSON.parse(raw) as State) };
    } catch {
      /* ignore */
    }
    setState(local);
    setHydrated(true);

    if (!userId) {
      setCloudChecked(true);
      return;
    }
    void (async () => {
      const { data, error } = await supabase
        .from("canteen_books")
        .select("data, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (!alive) return;
      if (!error && data?.data) {
        const cloudAt = new Date(data.updated_at).getTime();
        if (cloudAt > localAt) {
          setState({ ...base, ...(data.data as Partial<State>) });
          localStorage.setItem(`${storeKeyFor(userId)}.updatedAt`, String(cloudAt));
        }
      }
      // Offline (error): stay local-only so a stale cloud copy can never
      // resurrect data the operator has already cleared on this device.
      if (alive && !error) setSyncReady(true);
      if (alive) setCloudChecked(true);
    })();

    return () => {
      alive = false;
    };
  }, [ready, userId, baseFor]);

  useEffect(() => {
    if (!hydrated) return;
    const updatedAt = Date.now();
    try {
      localStorage.setItem(storeKeyFor(userId), JSON.stringify(state));
      localStorage.setItem(`${storeKeyFor(userId)}.updatedAt`, String(updatedAt));
    } catch {
      /* ignore */
    }
    if (!userId || !syncReady) return;
    // Debounced push; a failure just leaves the local copy authoritative and
    // the next change (or reconnection) retries it.
    const t = setTimeout(() => {
      void supabase
        .from("canteen_books")
        .upsert(
          { user_id: userId, data: state as unknown as Json, updated_at: new Date(updatedAt).toISOString() },
          { onConflict: "user_id" },
        )
        .then(({ error }) => {
          pendingRef.current = !!error;
        });
    }, 800);
    return () => clearTimeout(t);
  }, [state, hydrated, userId, syncReady]);

  // Coming back online: flush whatever the device holds so nothing entered
  // offline is lost.
  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;
    const flush = () => {
      if (!pendingRef.current) return;
      void supabase
        .from("canteen_books")
        .upsert(
          { user_id: userId, data: state as unknown as Json, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        )
        .then(({ error }) => {
          pendingRef.current = !!error;
        });
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [userId, state]);



  // Theme + font scale live on <html> so every screen follows them.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", state.theme === "dark");
    document.documentElement.style.fontSize = `${Math.round(state.fontScale * 100)}%`;
  }, [state.theme, state.fontScale]);

  const addTx = useCallback((tx: Omit<Tx, "id" | "ts"> & { ts?: number }) => {
    setState((s) => ({
      ...s,
      txs: [...s.txs, { ...tx, id: uid(), ts: tx.ts ?? Date.now() }],
    }));
  }, []);

  const sellItems = useCallback<Ctx["sellItems"]>((picked, opts) => {
    let label = "";
    let total = 0;
    setState((s) => {
      const items = s.items.map((i) => ({ ...i }));
      const lines: NonNullable<Tx["lines"]> = [];
      for (const p of picked) {
        const it = items.find((i) => i.id === p.itemId);
        if (!it || p.qty <= 0) continue;
        const qty = Math.min(p.qty, it.stock);
        it.stock -= qty;
        total += it.sell * qty;
        lines.push({ itemId: it.id, name: it.name, qty });
      }
      label = lines.map((l) => `${l.name} x${l.qty}`).join(", ") || "Cash sale";
      if (opts?.credit) return { ...s, items };
      return {
        ...s,
        items,
        txs: [
          ...s.txs,
          { id: uid(), type: "sale" as TxType, label, amount: total, lines, ts: opts?.ts ?? Date.now() },
        ],
      };
    });
    // Recompute synchronously for the caller (state updates are async).
    const snapshot = picked.reduce(
      (acc, p) => {
        const it = state.items.find((i) => i.id === p.itemId);
        if (!it || p.qty <= 0) return acc;
        const qty = Math.min(p.qty, it.stock);
        acc.total += it.sell * qty;
        acc.parts.push(`${it.name} x${qty}`);
        return acc;
      },
      { total: 0, parts: [] as string[] },
    );
    return { label: snapshot.parts.join(", ") || "Cash sale", total: snapshot.total };
  }, [state.items]);

  const addStockItems = useCallback<Ctx["addStockItems"]>((entries) => {
    setState((s) => {
      const items = s.items.map((i) => ({ ...i }));
      const txs = [...s.txs];
      const savedItems = [...(s.savedItems ?? [])];
      for (const e of entries) {
        const existing = items.find((i) => i.name.toLowerCase() === e.name.toLowerCase());
        let itemId: string;
        if (existing) {
          existing.qty += e.qty;
          existing.stock += e.qty;
          existing.buy += e.buy;
          existing.sell = e.sell;
          if (e.pack) existing.pack = e.pack;
          if (e.unitsPerPack) existing.unitsPerPack = e.unitsPerPack;
          itemId = existing.id;
        } else {
          itemId = uid();
          items.push({
            id: itemId,
            name: e.name,
            qty: e.qty,
            stock: e.qty,
            buy: e.buy,
            sell: e.sell,
            pack: e.pack ?? "Piece",
            unitsPerPack: e.unitsPerPack ?? 1,
          });
        }
        txs.push({
          id: uid(),
          type: "stock",
          label: `${e.name} restock`,
          amount: e.buy,
          itemId,
          units: e.qty,
          sell: e.sell,
          ts: e.ts ?? Date.now(),
        });
        // The operator's personal item list builds itself from normal use.
        const unitBuy = e.qty > 0 ? Math.round(e.buy / e.qty) : 0;
        const known = savedItems.find((x) => x.name.toLowerCase() === e.name.toLowerCase());
        if (known) {
          known.buy = unitBuy || known.buy;
          known.sell = e.sell || known.sell;
          if (e.pack) known.pack = e.pack;
          if (e.unitsPerPack) known.unitsPerPack = e.unitsPerPack;
        } else {
          savedItems.push({
            id: uid(),
            name: e.name,
            buy: unitBuy,
            sell: e.sell,
            pack: e.pack ?? "Piece",
            unitsPerPack: e.unitsPerPack ?? 1,
          });
        }
      }
      return { ...s, items, txs, savedItems };
    });
  }, []);

  const saveMyItem = useCallback<Ctx["saveMyItem"]>((item) => {
    setState((s) => {
      const list = [...(s.savedItems ?? [])];
      const found = list.find((x) => x.name.toLowerCase() === item.name.trim().toLowerCase());
      if (found) Object.assign(found, item, { name: found.name });
      else list.push({ ...item, name: item.name.trim(), id: uid() });
      return { ...s, savedItems: list };
    });
  }, []);

  const removeMyItem = useCallback((id: string) => {
    setState((s) => ({ ...s, savedItems: (s.savedItems ?? []).filter((x) => x.id !== id) }));
  }, []);

  const editTx = useCallback<Ctx["editTx"]>((id, patch) => {
    setState((s) => {
      const old = s.txs.find((t) => t.id === id);
      if (!old) return s;
      const items = s.items.map((i) => ({ ...i }));
      const notes: string[] = [];
      const money = (n: number) => new Intl.NumberFormat("en-UG").format(Math.round(n));
      const next: Tx = { ...old };

      if (patch.label !== undefined && patch.label !== old.label) {
        notes.push(`Description "${old.label}" → "${patch.label}"`);
        next.label = patch.label;
      }
      if (patch.category !== undefined && patch.category !== old.category) {
        notes.push(`Category ${old.category ?? "—"} → ${patch.category}`);
        next.category = patch.category;
      }
      if (patch.ts !== undefined && patch.ts !== old.ts) {
        notes.push(
          `Date ${new Date(old.ts).toLocaleDateString("en-GB")} → ${new Date(patch.ts).toLocaleDateString("en-GB")}`,
        );
        next.ts = patch.ts;
      }

      if (old.type === "stock" && old.itemId) {
        const it = items.find((i) => i.id === old.itemId);
        const oldUnits = old.units ?? 0;
        const newUnits = patch.units ?? oldUnits;
        const newBuy = patch.amount ?? old.amount;
        const newSell = patch.sell ?? old.sell ?? it?.sell ?? 0;
        if (it) {
          // Adjust the shelf by the difference only, never by the whole figure.
          it.qty = Math.max(0, it.qty - oldUnits + newUnits);
          it.stock = Math.max(0, it.stock - oldUnits + newUnits);
          it.buy = Math.max(0, it.buy - old.amount + newBuy);
          it.sell = newSell;
        }
        if (newUnits !== oldUnits) notes.push(`Quantity ${oldUnits} → ${newUnits} units`);
        if (newSell !== (old.sell ?? newSell)) notes.push(`Selling price ${money(old.sell ?? 0)} → ${money(newSell)}`);
        next.units = newUnits;
        next.sell = newSell;
      }

      if (old.type === "sale" && old.lines && patch.lines) {
        // Put the original units back, then take the corrected ones off.
        for (const l of old.lines) {
          const it = items.find((i) => i.id === l.itemId);
          if (it) it.stock += l.qty;
        }
        const lines: NonNullable<Tx["lines"]> = [];
        let total = 0;
        for (const l of patch.lines) {
          const it = items.find((i) => i.id === l.itemId);
          if (!it || l.qty <= 0) continue;
          const qty = Math.min(l.qty, it.stock);
          it.stock -= qty;
          total += it.sell * qty;
          lines.push({ itemId: it.id, name: it.name, qty });
        }
        next.lines = lines;
        next.label = lines.map((l) => `${l.name} x${l.qty}`).join(", ") || "Cash sale";
        patch = { ...patch, amount: total };
      }

      if (patch.amount !== undefined && patch.amount !== old.amount) {
        notes.push(`Amount UGX ${money(old.amount)} → UGX ${money(patch.amount)}`);
        next.amount = patch.amount;
      }

      if (notes.length === 0) return s;
      next.edits = [...(old.edits ?? []), { at: Date.now(), note: notes.join(" · ") }];
      const capital = old.type === "capital" ? next.amount : s.capital;
      return { ...s, capital, items, txs: s.txs.map((t) => (t.id === id ? next : t)) };
    });
  }, []);

  const deleteTx = useCallback((id: string) => {
    setState((s) => {
      const old = s.txs.find((t) => t.id === id);
      if (!old) return s;
      const items = s.items.map((i) => ({ ...i }));
      if (old.type === "stock" && old.itemId) {
        const it = items.find((i) => i.id === old.itemId);
        if (it) {
          it.qty = Math.max(0, it.qty - (old.units ?? 0));
          it.stock = Math.max(0, it.stock - (old.units ?? 0));
          it.buy = Math.max(0, it.buy - old.amount);
        }
      }
      if (old.type === "sale" && old.lines) {
        for (const l of old.lines) {
          const it = items.find((i) => i.id === l.itemId);
          if (it) it.stock += l.qty;
        }
      }
      return { ...s, items, txs: s.txs.filter((t) => t.id !== id) };
    });
  }, []);


  const setCapital = useCallback((amount: number, termName: string, goal: number) => {
    setState((s) => ({
      ...s,
      termName,
      capital: amount,
      savingsGoal: goal,
      setupDone: true,
      termStartedAt: s.termStartedAt || Date.now(),
      txs: [
        ...s.txs.filter((t) => t.type !== "capital"),
        { id: uid(), type: "capital", label: "Opening term capital", amount, ts: Date.now() },
      ],
    }));
  }, []);

  const settleDebtor = useCallback((id: string) => {
    setState((s) => {
      const d = s.debtors.find((x) => x.id === id);
      if (!d || d.paid) return s;
      return {
        ...s,
        debtors: s.debtors.map((x) => (x.id === id ? { ...x, paid: true } : x)),
        txs: [
          ...s.txs,
          { id: uid(), type: "sale" as TxType, label: `Credit paid — ${d.name}`, amount: d.amount, ts: Date.now() },
        ],
      };
    });
  }, []);

  const addDebtor = useCallback((d: Omit<Debtor, "id" | "ts" | "paid">) => {
    setState((s) => ({ ...s, debtors: [...s.debtors, { ...d, id: uid(), paid: false, ts: Date.now() }] }));
  }, []);

  const undoLast = useCallback(() => {
    setState((s) => ({ ...s, txs: s.txs.slice(0, -1) }));
  }, []);

  const setPin = useCallback((pin: string | null, autoLockMin: number) => {
    setState((s) => ({ ...s, pin, autoLockMin }));
  }, []);

  const addPayment = useCallback((amount: number, note: string) => {
    setState((s) => ({ ...s, payments: [...s.payments, { id: uid(), amount, note, ts: Date.now() }] }));
  }, []);

  const addExpenseCategory = useCallback((label: string, icon: string) => {
    setState((s) =>
      s.expenseCategories.some((c) => c.label.toLowerCase() === label.toLowerCase())
        ? s
        : { ...s, expenseCategories: [...s.expenseCategories, { id: uid(), label, icon }] },
    );
  }, []);

  const removeExpenseCategory = useCallback((id: string) => {
    setState((s) => ({ ...s, expenseCategories: s.expenseCategories.filter((c) => c.id !== id) }));
  }, []);

  const setTheme = useCallback((theme: "light" | "dark") => setState((s) => ({ ...s, theme })), []);
  const setFontScale = useCallback((fontScale: number) => setState((s) => ({ ...s, fontScale })), []);

  const archiveTerm = useCallback((newTermName: string, carryCash: number, target: number) => {
    setState((s) => {
      const sales = s.txs.filter((t) => t.type === "sale").reduce((a, t) => a + t.amount, 0);
      const expenses = s.txs.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
      const stockSpend = s.txs.filter((t) => t.type === "stock").reduce((a, t) => a + t.amount, 0);
      const record: TermRecord = {
        id: uid(),
        name: s.termName,
        capital: s.capital,
        target: s.savingsGoal,
        startedAt: s.termStartedAt,
        closedAt: Date.now(),
        sales,
        expenses,
        stockSpend,
        profit: sales - expenses - stockSpend,
        txs: s.txs,
        items: s.items,
      };
      return {
        ...s,
        terms: [...s.terms, record],
        termName: newTermName,
        termStartedAt: Date.now(),
        capital: carryCash,
        savingsGoal: target,
        txs: [{ id: uid(), type: "capital", label: "Opening term capital", amount: carryCash, ts: Date.now() }],
        items: s.items.filter((i) => i.stock > 0).map((i) => ({ ...i, qty: i.stock })),
        debtors: s.debtors.filter((d) => !d.paid),
      };
    });
  }, []);

  const restoreState = useCallback((next: State) => {
    setState({ ...seed, ...next });
  }, []);

  const clearAll = useCallback(() => {
    // Wipes the cash book only: entries, stock, debtors and capital.
    // Keeps PIN, auto-lock, term name, goal, categories, terms history and payments.
    setState((s) => ({ ...s, txs: [], debtors: [], items: [], capital: 0 }));
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;

  const saveNow = useCallback(async () => {
    if (!userId) return;
    const now = Date.now();
    try {
      localStorage.setItem(`${storeKeyFor(userId)}.updatedAt`, String(now));
    } catch {
      /* ignore */
    }
    const { error } = await supabase.from("canteen_books").upsert(
      {
        user_id: userId,
        data: stateRef.current as unknown as Json,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "user_id" },
    );
    pendingRef.current = !!error;
  }, [userId]);

  const value = useMemo<Ctx>(() => {
    const t = { sales: 0, expenses: 0, stock: 0 };
    const day = { sales: 0, expenses: 0, net: 0 };
    for (const tx of state.txs) {
      if (tx.type === "sale") t.sales += tx.amount;
      if (tx.type === "expense") t.expenses += tx.amount;
      if (tx.type === "stock") t.stock += tx.amount;
      if (hydrated && isToday(tx.ts)) {
        if (tx.type === "sale") day.sales += tx.amount;
        if (tx.type === "expense" || tx.type === "stock") day.expenses += tx.amount;
      }
    }
    day.net = day.sales - day.expenses;
    const capital = state.txs.find((x) => x.type === "capital")?.amount ?? state.capital;
    const cashAtHand = capital + t.sales - t.expenses - t.stock;
    const shelfValueAtCost = state.items.reduce(
      (a, i) => a + (i.qty ? (i.buy / i.qty) * i.stock : 0),
      0,
    );
    return {
      state,
      hydrated,
      cashAtHand,
      shelfValueAtCost,
      termProfit: cashAtHand + shelfValueAtCost - capital,
      totals: t,
      today: day,
      addTx,
      sellItems,
      addStockItems,
      editTx,
      deleteTx,
      saveMyItem,
      removeMyItem,
      setCapital,
      settleDebtor,
      addDebtor,
      undoLast,
      setPin,
      addPayment,
      addExpenseCategory,
      removeExpenseCategory,
      setTheme,
      setFontScale,
      archiveTerm,
      restoreState,
      clearAll,
      saveNow,
      cloudChecked,
    };
  }, [
    state,
    hydrated,
    addTx,
    sellItems,
    addStockItems,
    editTx,
    deleteTx,
    saveMyItem,
    removeMyItem,
    setCapital,
    settleDebtor,
    addDebtor,
    undoLast,
    setPin,
    addPayment,
    addExpenseCategory,
    removeExpenseCategory,
    setTheme,
    setFontScale,
    archiveTerm,
    restoreState,
    clearAll,
    saveNow,
    cloudChecked,
  ]);

  return (
    <StoreContext.Provider value={value}>
      {hydrated ? (
        children
      ) : (
        // Data lives on the device, so the shell waits for it before painting numbers.
        <div className="flex min-h-screen items-center justify-center bg-primary">
          <span className="text-sm font-semibold text-on-primary/80">Loading SmartCanteen…</span>
        </div>
      )}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export const ugx = (n: number) => new Intl.NumberFormat("en-UG").format(Math.round(n));
export const shortUgx = (n: number) =>
  Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}K` : `${Math.round(n)}`;
export const dateInput = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const fromDateInput = (v: string) => {
  const ts = new Date(`${v}T12:00:00`).getTime();
  return Number.isNaN(ts) ? Date.now() : ts;
};
