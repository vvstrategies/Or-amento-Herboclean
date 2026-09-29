// Additive migration. Historical proposals, PDFs, estimates, and existing route snapshots remain unchanged.
export function migrateFinance(repo){
 repo.transaction(()=>{
  repo.db.exec(`
   CREATE TABLE IF NOT EXISTS finance_estimates (
    id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES proposals(id),
    version INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(proposal_id,version)
   );
   CREATE INDEX IF NOT EXISTS finance_estimates_proposal ON finance_estimates(proposal_id,version DESC);
   CREATE TABLE IF NOT EXISTS finance_routes (id TEXT PRIMARY KEY, route_key TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS finance_routes_key ON finance_routes(route_key,created_at DESC);
   CREATE TABLE IF NOT EXISTS finance_route_usage (day TEXT PRIMARY KEY, count INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS finance_geocodes (
    id TEXT PRIMARY KEY, geocode_key TEXT NOT NULL, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL,
    data TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(subject_type,subject_id)
   );
   CREATE INDEX IF NOT EXISTS finance_geocodes_key ON finance_geocodes(geocode_key,created_at DESC);
   CREATE TABLE IF NOT EXISTS finance_route_metrics (
    day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(day,kind)
   );
   CREATE TABLE IF NOT EXISTS finance_route_quota (
    provider TEXT NOT NULL, kind TEXT NOT NULL, limit_value INTEGER, remaining INTEGER, reset_value INTEGER,
    updated_at TEXT NOT NULL, PRIMARY KEY(provider,kind)
   );
  `);
  repo.setConfig('finance-schema-version',2);
 });
}
