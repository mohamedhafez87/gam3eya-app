import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { Gam3eyaDetailPage } from "./pages/Gam3eyaDetailPage";
import { ImportPage } from "./pages/ImportPage";
import { PeoplePage } from "./pages/PeoplePage";
import { isSupabaseConfigured, requireSupabase, supabase } from "./lib/supabase";
import { t } from "./lib/i18n";
import type { Gam3eya, Language, MembershipWithOrg, Organization } from "./types";

type View =
  | { name: "dashboard" }
  | { name: "people" }
  | { name: "import" }
  | { name: "gam3eya"; gam3eyaId: string };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithOrg[]>([]);
  const [activeOrgId, setActiveOrgId] = useState("");
  const [language, setLanguage] = useState<Language>("ar");
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const activeOrganization = useMemo<Organization | null>(() => {
    return memberships.find((membership) => membership.organization_id === activeOrgId)?.organizations || null;
  }, [activeOrgId, memberships]);

  const loadMemberships = useCallback(async () => {
    if (!session || !supabase) return;
    const { data, error } = await supabase
      .from("organization_members")
      .select("*, organizations(*)")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const nextMemberships = (data || []) as MembershipWithOrg[];
    setMemberships(nextMemberships);
    setActiveOrgId((current) => {
      if (current && nextMemberships.some((membership) => membership.organization_id === current)) return current;
      return nextMemberships[0]?.organization_id || "";
    });
  }, [session]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setView({ name: "dashboard" });
      if (!nextSession) {
        setMemberships([]);
        setActiveOrgId("");
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    loadMemberships().catch((error) => setMessage(error.message));
  }, [loadMemberships, session]);

  async function createOrganization(name: string) {
    setMessage("");
    const client = requireSupabase();
    const { data, error } = await client.rpc("create_initial_organization", { org_name: name });
    if (error) throw error;
    await loadMemberships();
    const created = data as Organization;
    setActiveOrgId(created.id);
  }

  async function logout() {
    await requireSupabase().auth.signOut();
  }

  function openGam3eya(gam3eya: Gam3eya) {
    setView({ name: "gam3eya", gam3eyaId: gam3eya.id });
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="center-screen">
        <section className="panel narrow">
          <p className="eyebrow">Configuration</p>
          <h1>Supabase environment missing</h1>
          <p className="muted">
            Copy <code>.env.example</code> to <code>.env.local</code> and set
            <code> VITE_SUPABASE_URL</code> and <code> VITE_SUPABASE_ANON_KEY</code>.
          </p>
        </section>
      </main>
    );
  }

  if (loading) {
    return <main className="center-screen">Loading...</main>;
  }

  if (!session) {
    return <AuthPage />;
  }

  if (!activeOrganization) {
    return <OrganizationSetup onCreate={createOrganization} error={message} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Savings circle SaaS</p>
          <h1>{t(language, "appName")}</h1>
          <p className="muted">Supabase-backed owner workspace.</p>
        </div>

        <label className="dark-label">
          Organization
          <select value={activeOrgId} onChange={(event) => setActiveOrgId(event.target.value)} disabled={memberships.length < 2}>
            {memberships.map((membership) => (
              <option key={membership.id} value={membership.organization_id}>
                {membership.organizations?.name || "Organization"}
              </option>
            ))}
          </select>
        </label>

        <nav className="side-nav">
          <button className={view.name === "dashboard" ? "active" : ""} onClick={() => setView({ name: "dashboard" })}>
            {t(language, "dashboard")}
          </button>
          <button className={view.name === "people" ? "active" : ""} onClick={() => setView({ name: "people" })}>
            {t(language, "people")}
          </button>
          <button className={view.name === "import" ? "active" : ""} onClick={() => setView({ name: "import" })}>
            {t(language, "import")}
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeOrganization.default_currency}</p>
            <h2>{activeOrganization.name}</h2>
          </div>
          <div className="toolbar">
            <button className="ghost-button" onClick={() => setLanguage(language === "ar" ? "en" : "ar")}>
              {language === "ar" ? "EN" : "AR"}
            </button>
            <button className="ghost-button" onClick={logout}>
              {t(language, "logout")}
            </button>
          </div>
        </header>

        {message ? <p className="error-box">{message}</p> : null}

        {view.name === "dashboard" ? (
          <DashboardPage organization={activeOrganization} onOpenGam3eya={openGam3eya} onMessage={setMessage} />
        ) : null}
        {view.name === "people" ? <PeoplePage organization={activeOrganization} onMessage={setMessage} /> : null}
        {view.name === "import" ? <ImportPage organization={activeOrganization} onMessage={setMessage} /> : null}
        {view.name === "gam3eya" ? (
          <Gam3eyaDetailPage
            organization={activeOrganization}
            gam3eyaId={view.gam3eyaId}
            onBack={() => setView({ name: "dashboard" })}
            onMessage={setMessage}
          />
        ) : null}
      </section>
    </main>
  );
}

function OrganizationSetup({ onCreate, error }: { onCreate: (name: string) => Promise<void>; error: string }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onCreate(name);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="center-screen">
      <form className="panel narrow" onSubmit={submit}>
        <p className="eyebrow">First organization</p>
        <h1>Create your organization</h1>
        <p className="muted">Organizations are tenants. Your user will be added as owner.</p>
        <label>
          Organization name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        {error ? <p className="error-box">{error}</p> : null}
        <button className="primary-button" disabled={submitting}>
          {submitting ? "Creating..." : "Create organization"}
        </button>
      </form>
    </main>
  );
}
