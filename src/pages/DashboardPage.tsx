import { useEffect, useMemo, useState } from "react";
import { requireSupabase } from "../lib/supabase";
import { addMonths, currentMonthDate, formatMonth } from "../lib/date";
import { calculateMonthlyPot } from "../lib/legacyImport";
import { formatMoney } from "../lib/money";
import type { DraftSlot, Gam3eya, Gam3eyaSlot, Organization, Payment, Person } from "../types";

type Gam3eyaWithSlots = Gam3eya & {
  gam3eya_slots?: Gam3eyaSlot[];
  payments?: Payment[];
};

export function DashboardPage({
  organization,
  onOpenGam3eya,
  onMessage,
}: {
  organization: Organization;
  onOpenGam3eya: (gam3eya: Gam3eya) => void;
  onMessage: (message: string) => void;
}) {
  const [gam3eyas, setGam3eyas] = useState<Gam3eyaWithSlots[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const client = requireSupabase();
    const [{ data: gam3eyaData, error: gam3eyaError }, { data: peopleData, error: peopleError }] = await Promise.all([
      client
        .from("gam3eyas")
        .select("*, gam3eya_slots(*), payments(*)")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false }),
      client.from("people").select("*").eq("organization_id", organization.id).order("full_name"),
    ]);
    setLoading(false);
    if (gam3eyaError) throw gam3eyaError;
    if (peopleError) throw peopleError;
    setGam3eyas((gam3eyaData || []) as Gam3eyaWithSlots[]);
    setPeople((peopleData || []) as Person[]);
  }

  useEffect(() => {
    load().catch((error) => onMessage(error.message));
  }, [organization.id]);

  return (
    <section className="page-stack">
      <div className="panel-heading">
        <div>
          <h3>Dashboard</h3>
          <p className="muted">Owner-focused Phase 1 workspace.</p>
        </div>
        <button className="primary-button" onClick={() => setShowCreate((current) => !current)}>
          {showCreate ? "Close" : "Create Gam3eya"}
        </button>
      </div>

      {showCreate ? (
        <CreateGam3eyaPanel
          organization={organization}
          people={people}
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
          onMessage={onMessage}
        />
      ) : null}

      {loading ? <p className="muted">Loading gam3eyas...</p> : null}
      {!loading && !gam3eyas.length ? <p className="panel muted">No gam3eyas yet. Create a draft to get started.</p> : null}

      <section className="summary-grid">
        {gam3eyas.map((gam3eya) => (
          <button className="metric metric-button" key={gam3eya.id} onClick={() => onOpenGam3eya(gam3eya)}>
            <span>{gam3eya.status}</span>
            <strong>{gam3eya.name}</strong>
            <small>{getGam3eyaSummary(gam3eya)}</small>
          </button>
        ))}
      </section>
    </section>
  );
}

function getGam3eyaSummary(gam3eya: Gam3eyaWithSlots): string {
  const slots = gam3eya.gam3eya_slots || [];
  const activeSlots = slots.filter((slot) => slot.status === "active");
  const currentMonth = currentMonthDate();
  const payments = (gam3eya.payments || []).filter((payment) => payment.month === currentMonth);
  const paid = payments.filter((payment) => payment.status === "paid").length;
  const receiver = slots.find((slot) => slot.payout_month === currentMonth);
  return `${activeSlots.length} slots | pot ${formatMoney(calculateMonthlyPot(gam3eya.monthly_amount, activeSlots.length), gam3eya.currency)} | ${paid}/${payments.length} paid | receiver slot ${receiver?.slot_number || "-"}`;
}

function CreateGam3eyaPanel({
  organization,
  people,
  onCreated,
  onMessage,
}: {
  organization: Organization;
  people: Person[];
  onCreated: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("1000");
  const [currency, setCurrency] = useState(organization.default_currency);
  const [startMonth, setStartMonth] = useState(currentMonthDate().slice(0, 7));
  const [dueDay, setDueDay] = useState("1");
  const [slots, setSlots] = useState<DraftSlot[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [saving, setSaving] = useState(false);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  function addSlot() {
    const personId = selectedPersonId || people[0]?.id;
    if (!personId) return;
    setSlots((current) => [...current, { clientId: crypto.randomUUID(), personId }]);
    setSelectedPersonId(personId);
  }

  function moveSlot(index: number, direction: number) {
    setSlots((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function saveDraft(activate: boolean) {
    if (!slots.length) {
      onMessage("Add at least one slot before saving.");
      return;
    }
    setSaving(true);
    onMessage("");
    try {
      const client = requireSupabase();
      const { data: userData } = await client.auth.getUser();
      const { data: gam3eya, error: gam3eyaError } = await client
        .from("gam3eyas")
        .insert({
          organization_id: organization.id,
          name,
          monthly_amount: Number(monthlyAmount),
          currency,
          start_month: `${startMonth}-01`,
          due_day: Number(dueDay),
          created_by: userData.user?.id || null,
        })
        .select()
        .single();
      if (gam3eyaError) throw gam3eyaError;

      const slotRows = slots.map((slot, index) => ({
        gam3eya_id: gam3eya.id,
        person_id: slot.personId,
        slot_number: index + 1,
        payout_month: addMonths(`${startMonth}-01`, index),
      }));
      const { error: slotError } = await client.from("gam3eya_slots").insert(slotRows);
      if (slotError) throw slotError;

      if (activate) {
        const { error: activateError } = await client.rpc("activate_gam3eya", { gam3eya_id: gam3eya.id });
        if (activateError) throw activateError;
      }
      await onCreated();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not save gam3eya.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel form-stack">
      <h3>Create Gam3eya draft</h3>
      <div className="form-grid two">
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Monthly amount per slot
          <input type="number" min="1" value={monthlyAmount} onChange={(event) => setMonthlyAmount(event.target.value)} />
        </label>
        <label>
          Currency
          <input value={currency} onChange={(event) => setCurrency(event.target.value)} />
        </label>
        <label>
          Start month
          <input type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} />
        </label>
        <label>
          Due day
          <input type="number" min="1" max="28" value={dueDay} onChange={(event) => setDueDay(event.target.value)} />
        </label>
      </div>

      <div className="panel-subsection">
        <div className="panel-heading">
          <div>
            <h4>Slots and turn order</h4>
            <p className="muted">A person may own multiple slots. Each slot owes the monthly amount.</p>
          </div>
          <div className="row-actions">
            <select value={selectedPersonId} onChange={(event) => setSelectedPersonId(event.target.value)}>
              <option value="">Select person</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </select>
            <button className="ghost-button" type="button" onClick={addSlot} disabled={!people.length}>
              Add slot
            </button>
          </div>
        </div>
        {!people.length ? <p className="muted">Add people first from the People page.</p> : null}
        <div className="turn-list">
          {slots.map((slot, index) => (
            <article className="turn-row" key={slot.clientId}>
              <span className="turn-number">{index + 1}</span>
              <div>
                <strong>{peopleById.get(slot.personId)?.full_name || "Unknown person"}</strong>
                <small>{formatMonth(addMonths(`${startMonth}-01`, index))}</small>
              </div>
              <div className="row-actions">
                <button className="ghost-button" type="button" onClick={() => moveSlot(index, -1)}>Up</button>
                <button className="ghost-button" type="button" onClick={() => moveSlot(index, 1)}>Down</button>
                <button className="danger-button" type="button" onClick={() => setSlots((current) => current.filter((_, slotIndex) => slotIndex !== index))}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="row-actions">
        <button className="ghost-button" disabled={saving || !name} onClick={() => saveDraft(false)}>
          Save draft
        </button>
        <button className="primary-button" disabled={saving || !name} onClick={() => saveDraft(true)}>
          Activate & Lock
        </button>
      </div>
    </section>
  );
}
