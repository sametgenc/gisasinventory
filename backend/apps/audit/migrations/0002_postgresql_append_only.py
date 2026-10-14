from django.db import migrations


def install_append_only_guards(apps, schema_editor):
    """Production PostgreSQL guards also cover raw SQL and bulk operations."""
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("""
        CREATE FUNCTION audit_reject_evidence_change() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Audit events are append-only';
        END;
        $$;
    """)
    schema_editor.execute("""
        CREATE TRIGGER audit_event_immutable
        BEFORE UPDATE OR DELETE ON audit_auditevent
        FOR EACH ROW EXECUTE FUNCTION audit_reject_evidence_change();
    """)
    schema_editor.execute("""
        CREATE TRIGGER audit_event_no_truncate
        BEFORE TRUNCATE ON audit_auditevent
        FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_evidence_change();
    """)


def remove_append_only_guards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("DROP TRIGGER IF EXISTS audit_event_immutable ON audit_auditevent")
    schema_editor.execute("DROP TRIGGER IF EXISTS audit_event_no_truncate ON audit_auditevent")
    schema_editor.execute("DROP FUNCTION IF EXISTS audit_reject_evidence_change()")


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]
    operations = [migrations.RunPython(install_append_only_guards, remove_append_only_guards)]
