import { useEffect, useMemo, useState } from "react";
import { requireSupabase } from "../lib/supabase";
import { dueDateForMonth, formatMonth, isLatePayment } from "../lib/date";
import { formatMoney } from "../lib/money";
import type { Gam3eya, Gam3eyaSlot, Organization, Payment, PaymentMethod, Person } from "../types";

type PaymentWithPerson = Payment & {
  people?: Pick<Person, "id" | "full_name"> | null;
};

type SlotWithPerson = Gam3eyaSlot & {
  people?: Pick<Person, "id" | "full_name"> | null;
};

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "instapay", label: "Instapay" },
  { value: "vodafone_cash", label: "Vodafone Cash" },
  { value: "other_wallet", label: "Other wallet" },
  { value: "other", label: "Other" },
];

export function Gam3eyaDetailPage({
  organization,
  gam3eyaId,
  onBack,
  onMessage,
}: {
  organization: Organization;
  gam3eyaId: string;
  onBack: () => void;
  onMessage: (message: string) => void;
}) {
  const [gam3eya, setGam3eya] = useState<Gam3eya | null>(null);
  const [slots, setSlots] = useState<SlotWithPerson[]>([]);
  const [payments, setPayments] = useState<PaymentWithPerson[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentWithPerson | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");

  async function load() {
    const client = requireSupabase();
    const [{ data: gam3eyaData, error: gam3eyaError }, { data: slotData, error: slotError }, { data: paymentData, error: paymentError }] =
      await Promise.all([
        client.from("gam3eyas").select("*").eq("organization_id", organization.id).eq("id", gam3eyaId).single(),
        client.from("gam3eya_slots").select("*, people(id, full_name)").eq("gam3eya_id", gam3eyaId).order("slot_number"),
        client.from("payments").select("*, people(id, full_name)").eq("gam3eya_id", gam3eyaId).order("month"),
      ]);
    if (gam3eyaError) throw gam3eyaError;
    if (slotError) throw slotError;
    if (paymentError) throw paymentError;
    setGam3eya(gam3eyaData as Gam3eya);
    setSlots((slotData || []) as SlotWithPerson[]);
    setPayments((paymentData || []) as PaymentWithPerson[]);
  }

  useEffect(() => {
    load().catch((error) => onMessage(error.message));
  }, [gam3eyaId, organization.id]);

  const months = useMemo(() => {
    return Array.from(new Set(payments.map((payment) => payment.month))).sort();
  }, [payments]);

  const paymentBySlotMonth = useMemo(() => {
    return new Map(payments.map((payment) => [`${payment.slot_id}:${payment.month}`, payment]));
  }, [payments]);

  function openPayment(payment: PaymentWithPerson) {
    setSelectedPayment(payment);
    setMethod(payment.method || "cash");
    setPaidAt(payment.paid_at ? payment.paid_at.slice(0, 16) : new Date().toISOString().slice(0, 16));
    setNotes(payment.notes || "");
  }

  async function recordPaid() {
    if (!selectedPayment) return;
    const { error } = await requireSupabase().rpc("record_payment", {
      payment_id: selectedPayment.id,
      method,
      paid_at: new Date(paidAt).toISOString(),
      notes: notes || null,
    });
    if (error) {
      onMessage(error.message);
      return;
    }
    setSelectedPayment(null);
    await load();
  }

  async function markUnpaid() {
    if (!selectedPayment) return;
    const { error } = await requireSupabase().rpc("mark_payment_unpaid", {
      payment_id: selectedPayment.id,
    });
    if (error) {
      onMessage(error.message);
      return;
    }
    setSelectedPayment(null);
    await load();
  }

  if (!gam3eya) return <p className="muted">Loading gam3eya...</p>;

  return (
    <section className="page-stack">
      <div className="panel-heading">
        <div>
          <button className="ghost-button" onClick={onBack}>Back</button>
          <h3>{gam3eya.name}</h3>
          <p className="muted">
            {gam3eya.status} | {formatMoney(gam3eya.monthly_amount, gam3eya.currency)} per slot | due day {gam3eya.due_day}
          </p>
        </div>
      </div>

      <section className="panel">
        <h3>Turn order</h3>
        <div className="turn-list">
          {slots.map((slot) => (
            <article className="turn-row" key={slot.id}>
              <span className="turn-number">{slot.slot_number}</span>
              <div>
                <strong>{slot.people?.full_name || "Unknown person"}</strong>
                <small>{formatMonth(slot.payout_month)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Payment grid</h3>
        {!months.length ? <p className="muted">No payment rows yet. Activate the draft to generate cycles.</p> : null}
        {months.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Slot</th>
                  {months.map((month) => (
                    <th key={month}>{formatMonth(month)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.id}>
                    <td>
                      <strong>#{slot.slot_number}</strong>
                      <small>{slot.people?.full_name || "Unknown person"}</small>
                    </td>
                    {months.map((month) => {
                      const payment = paymentBySlotMonth.get(`${slot.id}:${month}`);
                      if (!payment) return <td key={month}>-</td>;
                      const late = isLatePayment(payment.status, month, gam3eya.due_day);
                      return (
                        <td key={month}>
                          <button className={`cell-button ${payment.status} ${late ? "late" : ""}`} onClick={() => openPayment(payment)}>
                            {payment.status === "paid" ? "Paid" : late ? "Late" : "Unpaid"}
                          </button>
                          <small>{formatMoney(payment.amount, gam3eya.currency)}</small>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {selectedPayment ? (
        <section className="panel payment-editor">
          <div className="panel-heading">
            <div>
              <h3>Record payment</h3>
              <p className="muted">Due {dueDateForMonth(selectedPayment.month, gam3eya.due_day)}</p>
            </div>
            <button className="ghost-button" onClick={() => setSelectedPayment(null)}>Close</button>
          </div>
          <div className="form-grid three">
            <label>
              Method
              <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
                {paymentMethods.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              Paid at
              <input type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </label>
            <label>
              Notes
              <input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>
          <div className="row-actions">
            <button className="primary-button" onClick={recordPaid}>Mark paid</button>
            <button className="danger-button" onClick={markUnpaid}>Mark unpaid</button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
