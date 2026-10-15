-- Hotel Mantri — reservation_documents table migration
-- Purpose: Durable tracking of generated reservation confirmation PDFs,
-- versioning, and email/WhatsApp delivery statuses.

CREATE TABLE IF NOT EXISTS reservation_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id            UUID NOT NULL,
  reservation_id      UUID NOT NULL,
  document_type       TEXT NOT NULL DEFAULT 'RESERVATION_CONFIRMATION',
  version             INTEGER NOT NULL DEFAULT 1,
  file_name           TEXT NOT NULL,
  storage_path        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'GENERATED',
  email_status        TEXT NOT NULL DEFAULT 'PENDING',
  whatsapp_status     TEXT NOT NULL DEFAULT 'PENDING',
  generated_by        TEXT DEFAULT 'SYSTEM',
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reservation_documents_unique_version
    UNIQUE (hotel_id, reservation_id, document_type, version)
);

CREATE INDEX IF NOT EXISTS res_docs_hotel_id_idx ON reservation_documents (hotel_id);
CREATE INDEX IF NOT EXISTS res_docs_res_id_idx ON reservation_documents (reservation_id);
CREATE INDEX IF NOT EXISTS res_docs_status_idx ON reservation_documents (status);
CREATE INDEX IF NOT EXISTS res_docs_created_at_idx ON reservation_documents (created_at DESC);

-- RLS
ALTER TABLE reservation_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hotel admins can view reservation documents"
  ON reservation_documents
  FOR SELECT
  USING (
    hotel_id IN (
      SELECT hotel_id FROM hotel_admins
      WHERE user_id = auth.uid() AND status = 'Active'
    )
    OR
    EXISTS (SELECT 1 FROM hotels WHERE id = hotel_id AND admin_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    OR
    EXISTS (SELECT 1 FROM hotel_admins WHERE user_id = auth.uid() AND role = 'super_admin' AND status = 'Active')
  );

COMMENT ON TABLE reservation_documents IS 'Durable storage for generated reservation confirmation documents and delivery audit trail.';
