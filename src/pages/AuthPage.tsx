import { useState, type FormEvent } from "react";
import { requireSupabase } from "../lib/supabase";

type AuthMode = "login" | "signup";

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      const client = requireSupabase();
      if (mode === "signup") {
        const { error } = await client.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        setMessage("Check your email if confirmation is enabled, then sign in.");
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="center-screen">
      <form className="panel narrow" onSubmit={submit}>
        <p className="eyebrow">Supabase Auth</p>
        <h1>{mode === "login" ? "Login" : "Sign up"}</h1>
        <p className="muted">Owners authenticate with Supabase. People records do not log in in Phase 1.</p>
        {mode === "signup" ? (
          <label>
            Full name
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </label>
        ) : null}
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {message ? <p className={message.includes("failed") ? "error-box" : "security-note"}>{message}</p> : null}
        <button className="primary-button" disabled={submitting}>
          {submitting ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage("");
          }}
        >
          {mode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>
    </main>
  );
}
