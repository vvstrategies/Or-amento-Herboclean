export function migrateIntegrations(repo){repo.transaction(()=>{
 repo.db.exec(`
 CREATE TABLE IF NOT EXISTS integration_connections(provider TEXT PRIMARY KEY,secret TEXT,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS integration_oauth_states(state TEXT PRIMARY KEY,provider TEXT NOT NULL,session_id TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS integration_accounts(provider TEXT NOT NULL,connection_id TEXT NOT NULL,account_id TEXT NOT NULL,manager_id TEXT NOT NULL DEFAULT '',data TEXT NOT NULL,PRIMARY KEY(provider,connection_id,account_id,manager_id));
 CREATE TABLE IF NOT EXISTS ad_spend_daily(provider TEXT NOT NULL,account_id TEXT NOT NULL,campaign_id TEXT NOT NULL,day TEXT NOT NULL,currency TEXT NOT NULL,spend_cents INTEGER NOT NULL,data TEXT NOT NULL,sync_run_id TEXT NOT NULL,PRIMARY KEY(provider,account_id,campaign_id,day));
 CREATE INDEX IF NOT EXISTS ad_spend_period ON ad_spend_daily(day,provider,currency);
 CREATE TABLE IF NOT EXISTS integration_sync_runs(id TEXT PRIMARY KEY,provider TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,period_from TEXT,period_to TEXT,status TEXT NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS integration_sync_provider ON integration_sync_runs(provider,started_at);
 CREATE TABLE IF NOT EXISTS ad_spend_revisions(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,provider TEXT NOT NULL,account_id TEXT NOT NULL,campaign_id TEXT NOT NULL,day TEXT NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS ad_spend_revision_run ON ad_spend_revisions(run_id);
 CREATE TABLE IF NOT EXISTS proposal_attribution(proposal_id TEXT PRIMARY KEY REFERENCES proposals(id),data TEXT NOT NULL,revision INTEGER NOT NULL);
 `);
 if(!repo.config('integrations-schema-version'))repo.setConfig('integrations-schema-version',1);
});}
