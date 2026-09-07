/**
 * Keeps anyone who still owes a PIN out of the app.
 *
 * A one-time password reset clears the PIN in the backend. The screen the
 * person was on before may still be in their browser history, so tapping
 * "back" could otherwise slip them straight into the dashboard. This check
 * asks the backend on every shell mount and sends them to the setup screen.
 */
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { myFirstRunState } from "@/lib/accounts.functions";

export function useSetupGate(active: boolean) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void myFirstRunState()
      .then((st) => {
        if (!alive || !st.ok) return;
        if (st.otpPending || !st.hasPin) {
          navigate({ to: "/first-run", replace: true });
        }
      })
      .catch(() => {
        /* offline — the device session keeps working */
      });
    return () => {
      alive = false;
    };
  }, [active, navigate]);
}
