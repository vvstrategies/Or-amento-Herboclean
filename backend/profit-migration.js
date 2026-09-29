export function migrateProfit(repo){
 repo.db.exec(`
 CREATE TABLE IF NOT EXISTS finance_actuals (proposal_id TEXT NOT NULL REFERENCES proposals(id),version INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(proposal_id,version));
 CREATE TABLE IF NOT EXISTS finance_contexts (proposal_id TEXT PRIMARY KEY REFERENCES proposals(id),city TEXT NOT NULL,customer_key TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS finance_context_city ON finance_contexts(city);
 CREATE INDEX IF NOT EXISTS finance_context_customer ON finance_contexts(customer_key);
 CREATE TABLE IF NOT EXISTS finance_goals (competence TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(competence,version));
 `);
 if(!repo.config('profit-schema-version'))repo.setConfig('profit-schema-version',3);
}
