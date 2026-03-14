Remaining manual steps (outside codebase):

Google Cloud Console — Create OAuth2 Web App client, add the redirect URI:
https://mathtrail.localhost/api/kratos/self-service/methods/oidc/callback/google

Vault KV — Write credentials at secret/data/local/mathtrail-identity/kratos:


vault kv put secret/local/mathtrail-identity/kratos \  google_client_id="<YOUR_CLIENT_ID>" \  google_client_secret="<YOUR_CLIENT_SECRET>"
Drop Kratos DB for MVP — skaffold dev restart will recreate tables automatically