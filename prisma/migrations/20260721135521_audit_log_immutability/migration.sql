-- Enforces the audit trail's append-only guarantee at the database layer,
-- not just by convention in application code.
--
-- REVOKE UPDATE/DELETE alone does not actually stop the table owner (the
-- role that ran this migration is also the role the app connects as in this
-- setup) — Postgres table owners retain implicit rights over their own
-- objects regardless of GRANT/REVOKE. A BEFORE UPDATE/DELETE trigger that
-- unconditionally raises is the mechanism that actually works no matter
-- which role is connected, so that's what's used here.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_mutation();