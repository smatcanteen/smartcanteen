import { useEffect, useRef, useState } from "react";

/**
 * Keeps in-progress entry work on the device so an interruption (a phone call,
 * a customer, the app closing) never costs the operator what they had typed.
 * Drafts are recovery protection only — they never touch Cash at Hand until
 * the operator actually saves the entry.
 */
const KEY = (name: string) => `smartcanteen.draft.${name}`;

export function useDraft<T>(name: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY(name));
      if (raw) {
        setValue(JSON.parse(raw) as T);
        setRestored(true);
      }
    } catch {
      /* ignore */
    }
    loaded.current = true;
  }, [name]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY(name), JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [name, value]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(KEY(name));
    } catch {
      /* ignore */
    }
    setRestored(false);
  };

  return { value, setValue, restored, clearDraft, dismissRestored: () => setRestored(false) };
}
