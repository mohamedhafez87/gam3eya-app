# Supabase Notes

Apply migrations in order from `supabase/migrations/`.

The Phase 1 migration creates the tenant schema, enables RLS on all tables, adds indexes for organization-scoped access paths, and defines core RPCs for organization creation, activation, and payment state changes.

Payment unpaid behavior is intentionally simple: `mark_payment_unpaid` sets `status = 'unpaid'` and clears `method`, `paid_at`, and `recorded_by`; notes are preserved for operator context.

Audit logging is database-side. Generic triggers cover direct changes to people, gam3eyas, and slots. Payment changes are logged by payment RPCs so the immutable payment fields remain protected.

Use only the anon key in the frontend. Never expose a service-role key in Vite environment variables.
