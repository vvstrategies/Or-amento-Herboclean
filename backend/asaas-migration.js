// CobranÃ§as ficam separadas das propostas para que CPF/CNPJ nunca entre em PDFs ou backups comerciais.
export function migrateAsaas(repo){
  repo.db.exec(`
    CREATE TABLE IF NOT EXISTS asaas_payers (
      document_ref TEXT PRIMARY KEY,
      asaas_customer_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS asaas_payments (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      proposal_revision INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('pix','card')),
      asaas_payment_id TEXT NOT NULL UNIQUE,
      asaas_customer_id TEXT NOT NULL,
      asaas_installment_id TEXT,
      status TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      installment_count INTEGER NOT NULL,
      invoice_url TEXT NOT NULL,
      due_date TEXT NOT NULL,
      external_reference TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paid_at TEXT
    );
    CREATE INDEX IF NOT EXISTS asaas_payments_proposal ON asaas_payments(proposal_id, proposal_revision, created_at DESC);
    CREATE INDEX IF NOT EXISTS asaas_payments_asaas_id ON asaas_payments(asaas_payment_id);
    CREATE TABLE IF NOT EXISTS asaas_webhook_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      asaas_payment_id TEXT,
      received_at TEXT NOT NULL
    );
  `);
  const columns=repo.db.prepare('PRAGMA table_info(asaas_payments)').all().map(row=>row.name);
  if(!columns.includes('asaas_installment_id'))repo.db.exec('ALTER TABLE asaas_payments ADD COLUMN asaas_installment_id TEXT');
  repo.db.exec('CREATE INDEX IF NOT EXISTS asaas_payments_installment ON asaas_payments(asaas_installment_id)');
  repo.setConfig('asaas-schema-version',2);
}

