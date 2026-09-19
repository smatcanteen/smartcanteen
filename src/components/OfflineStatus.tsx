import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/** Reassures the operator that losing signal does not stop the cash book. */
export function OfflineStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="fixed left-1/2 top-2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full bg-inverse-surface px-4 py-2 text-xs font-bold text-inverse-on-surface shadow-raised">
      <Icon name="cloud_off" className="text-[17px]" />
      Offline · entries save on this phone
    </div>
  );
}
