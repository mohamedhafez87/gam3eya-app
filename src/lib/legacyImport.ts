import { addMonths, toMonthDate } from "./date";
import type { LegacyPreview, PaymentMethod } from "../types";

type LegacyMember = {
  id: string;
  name?: string;
  phone?: string;
  nationalId?: string;
  address?: string;
  notes?: string;
};

type LegacyAssociation = {
  id?: string;
  name?: string;
  monthlyAmount?: number;
  monthly_amount?: number;
  currency?: string;
  startMonth?: string;
  start_month?: string;
  members?: LegacyMember[];
  turnOrder?: string[];
  turn_order?: string[];
  payments?: Record<string, Record<string, { paid?: boolean; method?: string; paidAt?: string; notes?: string }>>;
};

const methodMap: Record<string, PaymentMethod> = {
  cash: "cash",
  "bank transfer": "bank_transfer",
  bank_transfer: "bank_transfer",
  wallet: "other_wallet",
  instapay: "instapay",
  "vodafone cash": "vodafone_cash",
  vodafone_cash: "vodafone_cash",
  other_wallet: "other_wallet",
  other: "other",
};

export function parseLegacyExport(text: string): LegacyPreview {
  try {
    const parsed = JSON.parse(text) as unknown;
    const association = extractAssociation(parsed);
    const members = Array.isArray(association.members) ? association.members : [];
    const turnOrder = association.turnOrder || association.turn_order || members.map((member) => member.id);
    const paymentCount = Object.values(association.payments || {}).reduce(
      (total, cyclePayments) => total + Object.values(cyclePayments || {}).filter((entry) => entry?.paid).length,
      0,
    );

    return {
      valid: true,
      associationName: association.name || "Imported Gam3eya",
      peopleCount: members.length,
      slotsCount: turnOrder.length,
      paymentsCount: paymentCount,
      source: association,
    };
  } catch (error) {
    return {
      valid: false,
      associationName: "",
      peopleCount: 0,
      slotsCount: 0,
      paymentsCount: 0,
      source: null,
      error: error instanceof Error ? error.message : "Invalid JSON file",
    };
  }
}

export function extractAssociation(source: unknown): LegacyAssociation {
  const value = source as { association?: LegacyAssociation; associations?: LegacyAssociation[] };
  if (value?.association) return value.association;
  if (Array.isArray(value?.associations) && value.associations[0]) return value.associations[0];
  if ((source as LegacyAssociation)?.members) return source as LegacyAssociation;
  throw new Error("No legacy association found.");
}

export function buildLegacyImportPlan(source: unknown) {
  const association = extractAssociation(source);
  const members = Array.isArray(association.members) ? association.members : [];
  const memberById = new Map(members.map((member) => [member.id, member]));
  const turnOrder = association.turnOrder || association.turn_order || members.map((member) => member.id);
  const startMonth = toMonthDate(association.startMonth || association.start_month || new Date().toISOString().slice(0, 7));
  const monthlyAmount = Number(association.monthlyAmount || association.monthly_amount || 1);

  return {
    gam3eya: {
      name: association.name || "Imported Gam3eya",
      monthly_amount: monthlyAmount,
      currency: association.currency || "EGP",
      start_month: startMonth,
      due_day: 1,
    },
    people: members.map((member) => ({
      legacyId: member.id,
      full_name: member.name || "Unnamed person",
      phone: member.phone || null,
      email: null,
      address: member.address || null,
      notes: [member.nationalId ? `Legacy national ID: ${member.nationalId}` : "", member.notes || ""]
        .filter(Boolean)
        .join("\n") || null,
    })),
    slots: turnOrder
      .map((memberId, index) => memberById.get(memberId) ? { legacyMemberId: memberId, slot_number: index + 1, payout_month: addMonths(startMonth, index) } : null)
      .filter((slot): slot is { legacyMemberId: string; slot_number: number; payout_month: string } => Boolean(slot)),
    paidPayments: Object.entries(association.payments || {}).flatMap(([cycle, cyclePayments]) => {
      const month = addMonths(startMonth, Number(cycle || 0));
      return Object.entries(cyclePayments || {})
        .filter(([, payment]) => payment?.paid)
        .map(([legacyMemberId, payment]) => ({
          legacyMemberId,
          month,
          method: methodMap[String(payment.method || "cash").toLowerCase()] || "other",
          paid_at: payment.paidAt ? `${payment.paidAt}T12:00:00Z` : new Date().toISOString(),
          notes: payment.notes || null,
        }));
    }),
  };
}

export function calculateMonthlyPot(monthlyAmount: number, activeSlotCount: number): number {
  return Number(monthlyAmount || 0) * Number(activeSlotCount || 0);
}
