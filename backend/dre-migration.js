// Phase 2 is additive and separate from the already-applied Phase 1 migration.
export const defaultCategories=['Marketing','Pessoal','Administrativo','Infraestrutura','Veículos','Tecnologia','Contabilidade','Aluguel','Utilidades','Seguros','Financeiro','Outros','Pró-labore'];
export function migrateDre(repo){
 repo.transaction(()=>{
  repo.db.exec(`
   CREATE TABLE IF NOT EXISTS finance_categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 1);
   CREATE TABLE IF NOT EXISTS finance_expenses(id TEXT PRIMARY KEY,competence TEXT NOT NULL,category_id TEXT NOT NULL REFERENCES finance_categories(id),status TEXT NOT NULL,nature TEXT NOT NULL,rule_id TEXT,data TEXT NOT NULL,revision INTEGER NOT NULL,UNIQUE(rule_id,competence));
   CREATE INDEX IF NOT EXISTS finance_expense_period ON finance_expenses(competence,status,category_id);
   CREATE INDEX IF NOT EXISTS finance_expense_category ON finance_expenses(category_id,competence);
   CREATE TABLE IF NOT EXISTS finance_recurrences(id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS finance_recognitions(proposal_id TEXT PRIMARY KEY REFERENCES proposals(id),service_date TEXT NOT NULL,competence TEXT NOT NULL,data TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS finance_recognition_period ON finance_recognitions(competence,service_date);
   CREATE TABLE IF NOT EXISTS finance_periods(competence TEXT PRIMARY KEY,data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS finance_audit(id TEXT PRIMARY KEY,entity TEXT NOT NULL,entity_id TEXT NOT NULL,actor TEXT NOT NULL,recorded_at TEXT NOT NULL,data TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS finance_audit_entity ON finance_audit(entity,entity_id,recorded_at);
  `);
  if(!repo.config('dre-schema-version')){
   for(const [i,name] of defaultCategories.entries())repo.db.prepare('INSERT OR IGNORE INTO finance_categories(id,name) VALUES (?,?)').run('category-'+(i+1),name);
   repo.setConfig('dre-schema-version',2);
  }
 });
}
