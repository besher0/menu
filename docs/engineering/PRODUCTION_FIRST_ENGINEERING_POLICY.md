# Production-first engineering policy

Prioritize authentication, authorization, tenant isolation, database integrity, pricing and orders, uploads, deployment configuration, CI security, performance and migration/restore readiness for real restaurants. Classify a finding by the affected asset and the evidenced path to it.

Treat local preview infrastructure or disposable demo data as demo-only when the evidence supports that classification. A demo-only maintenance issue does not block a source push. A component handling an actual credential, exposing a sensitive API or capable of affecting production belongs in the production security review. Record unknown reachability explicitly.

Use fresh isolated databases and synthetic identities to verify production code. Keep credentials, customer data and operational artifacts out of source and CI logs. Changes to live credentials, customer databases, deployments and Git remotes require their own authorization. Preserve existing repository instructions within these boundaries.
