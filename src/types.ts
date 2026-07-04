export type Language = "ar" | "en";

export type OrganizationRole = "owner" | "admin" | "collector";
export type Gam3eyaStatus = "draft" | "active" | "completed" | "archived";
export type PaymentStatus = "unpaid" | "paid";
export type PaymentMethod =
  | "cash"
  | "bank_transfer"
  | "instapay"
  | "vodafone_cash"
  | "other_wallet"
  | "other";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  preferred_language: Language;
  created_at: string;
};

export type Organization = {
  id: string;
  name: string;
  owner_id: string;
  default_currency: string;
  created_at: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: OrganizationRole;
  created_at: string;
};

export type Person = {
  id: string;
  organization_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

export type Gam3eya = {
  id: string;
  organization_id: string;
  name: string;
  monthly_amount: number;
  currency: string;
  start_month: string;
  due_day: number;
  status: Gam3eyaStatus;
  created_by: string | null;
  created_at: string;
};

export type Gam3eyaSlot = {
  id: string;
  gam3eya_id: string;
  person_id: string;
  slot_number: number;
  payout_month: string;
  status: "active" | "left";
};

export type Payment = {
  id: string;
  gam3eya_id: string;
  slot_id: string;
  person_id: string;
  month: string;
  amount: number;
  method: PaymentMethod | null;
  status: PaymentStatus;
  paid_at: string | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MembershipWithOrg = OrganizationMember & {
  organizations: Organization | null;
};

export type DraftSlot = {
  clientId: string;
  personId: string;
};

export type LegacyPreview = {
  valid: boolean;
  associationName: string;
  peopleCount: number;
  slotsCount: number;
  paymentsCount: number;
  source: unknown;
  error?: string;
};
