Remaining manual steps (outside codebase):

Google Cloud Console — Create OAuth2 Web App client, add the redirect URI:
http://localhost/api/kratos/self-service/methods/oidc/callback/google

Note: Google rejects .localhost TLD. http://localhost (no port) is their explicit local dev exception.
Kratos public base_url is set to http://localhost/api/kratos/ for the same reason.
Cookie domain .localhost covers both localhost and mathtrail.localhost.

Vault KV — Write credentials at secret/data/local/mathtrail-identity/kratos:


vault kv put secret/local/mathtrail-identity/kratos \  google_client_id="<YOUR_CLIENT_ID>" \  google_client_secret="<YOUR_CLIENT_SECRET>"
Drop Kratos DB for MVP — skaffold dev restart will recreate tables automatically