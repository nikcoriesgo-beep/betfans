import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

export function PicksSessionRecovery({ open, expectedUserId, onRecovered }: {
  open: boolean;
  expectedUserId: string | null;
  onRecovered: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Dialog open={open}>
    <DialogContent onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Sign in to finish your picks</DialogTitle>
        <DialogDescription>Your session ended. Your remaining selections are still here. Sign in to the same account, then submit again.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/auth/login", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: phone.replace(/\D/g, ""), password }),
          });
          if (!response.ok) throw new Error("Sign-in failed. Check your phone number and password.");
          // Confirm the browser actually retained the new session cookie.
          const session = await fetch("/api/auth/user", { credentials: "include", cache: "no-store" });
          if (!session.ok) throw new Error("Your browser could not keep the session. Allow cookies for BetFans and try again.");
          const user = await session.json();
          if (!expectedUserId || user.id !== expectedUserId) {
            throw new Error("Sign in to the same account that selected these picks.");
          }
          setPassword("");
          onRecovered();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
        } finally { setBusy(false); }
      }}>
        <label className="block text-sm">Phone number
          <Input type="tel" autoComplete="username" required value={phone} onChange={e => setPhone(e.target.value)} />
        </label>
        <label className="block text-sm">Password
          <div className="relative">
            <Input type={visible ? "text" : "password"} autoComplete="current-password" required className="pr-12" value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" className="absolute right-1 top-0 h-10 w-10 flex items-center justify-center" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>
              {visible ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </label>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in and keep selections"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}