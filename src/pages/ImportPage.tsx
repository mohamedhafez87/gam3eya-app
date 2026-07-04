import { useState } from "react";
import { requireSupabase } from "../lib/supabase";
import { buildLegacyImportPlan, parseLegacyExport } from "../lib/legacyImport";
import type { LegacyPreview, Organization } from "../types";

export function ImportPage({ organization, onMessage }: { organization: Organization; onMessage: (message: string) => void }) {
  const [preview, setPreview] = useState<LegacyPreview | null>(null);
  const [importing, setImporting] = useState(false);

  async function readFile(file: File) {
    const text = await file.text();
    setPreview(parseLegacyExport(text));
  }

  async function importLegacy() {
    if (!preview?.valid) return;
    if (!confirm(`Import "${preview.associationName}" into ${organization.name}?`)) return;
    setImporting(true);
    onMessage("");
    try {
      const client = requireSupabase();
      const plan = buildLegacyImportPlan(preview.source);
      const legacyToPersonId = new Map<string, string>();

      for (const person of plan.people) {
        const { data, error } = await client
          .from("people")
          .insert({
            organization_id: organization.id,
            full_name: person.full_name,
            phone: person.phone,
            email: person.email,
            address: person.address,
            notes: person.notes,
          })
          .select()
          .single();
        if (error) throw error;
        legacyToPersonId.set(person.legacyId, data.id);
      }

      const { data: userData } = await client.auth.getUser();
      const { data: gam3eya, error: gam3eyaError } = await client
        .from("gam3eyas")
        .insert({
          organization_id: organization.id,
          name: plan.gam3eya.name,
          monthly_amount: plan.gam3eya.monthly_amount,
          currency: plan.gam3eya.currency,
          start_month: plan.gam3eya.start_month,
          due_day: plan.gam3eya.due_day,
          created_by: userData.user?.id || null,
        })
        .select()
        .single();
      if (gam3eyaError) throw gam3eyaError;

      const slotRows = plan.slots.map((slot) => ({
        gam3eya_id: gam3eya.id,
        person_id: legacyToPersonId.get(slot.legacyMemberId)!,
        slot_number: slot.slot_number,
        payout_month: slot.payout_month,
      }));
      const { error: slotError } = await client.from("gam3eya_slots").insert(slotRows);
      if (slotError) throw slotError;

      const { error: activateError } = await client.rpc("activate_gam3eya", { gam3eya_id: gam3eya.id });
      if (activateError) throw activateError;

      const { data: payments, error: paymentLoadError } = await client.from("payments").select("*").eq("gam3eya_id", gam3eya.id);
      if (paymentLoadError) throw paymentLoadError;

      for (const paidPayment of plan.paidPayments) {
        const personId = legacyToPersonId.get(paidPayment.legacyMemberId);
        const payment = (payments || []).find((item) => item.person_id === personId && item.month === paidPayment.month);
        if (!payment) continue;
        const { error } = await client.rpc("record_payment", {
          payment_id: payment.id,
          method: paidPayment.method,
          paid_at: paidPayment.paid_at,
          notes: paidPayment.notes,
        });
        if (error) throw error;
      }

      setPreview(null);
      onMessage("Legacy import completed.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function exportOrganization() {
    const client = requireSupabase();
    const [{ data: people }, { data: gam3eyas }, { data: slots }, { data: payments }] = await Promise.all([
      client.from("people").select("*").eq("organization_id", organization.id),
      client.from("gam3eyas").select("*").eq("organization_id", organization.id),
      client.from("gam3eya_slots").select("*, gam3eyas!inner(organization_id)").eq("gam3eyas.organization_id", organization.id),
      client.from("payments").select("*, gam3eyas!inner(organization_id)").eq("gam3eyas.organization_id", organization.id),
    ]);
    const payload = {
      type: "gam3eya-supabase-organization-backup",
      exportedAt: new Date().toISOString(),
      organization,
      people: people || [],
      gam3eyas: gam3eyas || [],
      slots: slots || [],
      payments: payments || [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${organization.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "organization"}-backup.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="page-stack">
      <section className="panel form-stack">
        <h3>Legacy localStorage import</h3>
        <p className="muted">Import the old static app JSON. Preview is shown before writing to Supabase.</p>
        <input type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && readFile(event.target.files[0])} />
        {preview ? (
          <div className={preview.valid ? "security-note" : "error-box"}>
            {preview.valid ? (
              <>
                <strong>{preview.associationName}</strong>
                <p>{preview.peopleCount} people, {preview.slotsCount} slots, {preview.paymentsCount} paid payment records.</p>
              </>
            ) : (
              preview.error
            )}
          </div>
        ) : null}
        <button className="primary-button" disabled={!preview?.valid || importing} onClick={importLegacy}>
          {importing ? "Importing..." : "Confirm import"}
        </button>
      </section>

      <section className="panel form-stack">
        <h3>Backup export</h3>
        <p className="muted">Supabase free tier does not provide automated backups. Export organization data periodically.</p>
        <button className="ghost-button" onClick={exportOrganization}>Export organization JSON</button>
      </section>
    </section>
  );
}
