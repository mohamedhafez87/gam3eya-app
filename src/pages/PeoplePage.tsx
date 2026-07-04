import { useEffect, useState, type FormEvent } from "react";
import { requireSupabase } from "../lib/supabase";
import type { Organization, Person } from "../types";

type PersonForm = {
  full_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const emptyForm: PersonForm = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export function PeoplePage({ organization, onMessage }: { organization: Organization; onMessage: (message: string) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [form, setForm] = useState<PersonForm>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadPeople() {
    setLoading(true);
    const { data, error } = await requireSupabase()
      .from("people")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) throw error;
    setPeople((data || []) as Person[]);
  }

  useEffect(() => {
    loadPeople().catch((error) => onMessage(error.message));
  }, [organization.id]);

  function update<K extends keyof PersonForm>(key: K, value: PersonForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function edit(person: Person) {
    setEditingId(person.id);
    setForm({
      full_name: person.full_name,
      phone: person.phone || "",
      email: person.email || "",
      address: person.address || "",
      notes: person.notes || "",
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    onMessage("");
    const payload = {
      organization_id: organization.id,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    const query = editingId
      ? requireSupabase().from("people").update(payload).eq("id", editingId)
      : requireSupabase().from("people").insert(payload);
    const { error } = await query;
    if (error) {
      onMessage(error.message);
      return;
    }
    setForm(emptyForm);
    setEditingId("");
    await loadPeople();
  }

  return (
    <section className="split-grid">
      <form className="panel form-stack" onSubmit={submit}>
        <div className="panel-heading">
          <h3>{editingId ? "Edit person" : "Add person"}</h3>
          {editingId ? (
            <button className="ghost-button" type="button" onClick={() => { setEditingId(""); setForm(emptyForm); }}>
              Cancel
            </button>
          ) : null}
        </div>
        <label>
          Full name
          <input value={form.full_name} onChange={(event) => update("full_name", event.target.value)} required />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(event) => update("phone", event.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
        </label>
        <label>
          Address
          <input value={form.address} onChange={(event) => update("address", event.target.value)} />
        </label>
        <label>
          Notes
          <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} />
        </label>
        <button className="primary-button">{editingId ? "Save person" : "Add person"}</button>
      </form>

      <section className="panel">
        <h3>People directory</h3>
        {loading ? <p className="muted">Loading people...</p> : null}
        {!loading && !people.length ? <p className="muted">No people yet. Add participants before creating slots.</p> : null}
        <div className="member-list">
          {people.map((person) => (
            <article className="member-card" key={person.id}>
              <div>
                <strong>{person.full_name}</strong>
                <span>{person.phone || "No phone"}</span>
                <small>{person.email || "No email"}</small>
              </div>
              <button className="ghost-button" onClick={() => edit(person)}>
                Edit
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
