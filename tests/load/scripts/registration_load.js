import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const KRATOS_URL = __ENV.KRATOS_URL || 'http://kratos-public';

export const options = {
  stages: [
    { duration: '5s',  target: 10 },
    { duration: '30s', target: 10 },
    { duration: '5s',  target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed:   ['rate<0.05'],
  },
};

export default function () {
  // 1. Initiate registration flow (SPA/API mode)
  const initRes = http.get(`${KRATOS_URL}/self-service/registration/browser`, {
    headers: { Accept: 'application/json' },
  });
  if (!check(initRes, { 'flow initiated': (r) => r.status === 200 })) {
    return;
  }

  const flow = initRes.json();
  const csrfNode = flow.ui?.nodes?.find((n) => n.attributes?.name === 'csrf_token');
  const csrfToken = csrfNode?.attributes?.value || '';

  // 2. Submit OIDC method — Kratos returns 422 with redirect_browser_to for API flows
  // Rewrite the action URL: Kratos embeds its public (browser-facing) base URL, which is
  // unreachable from inside the cluster. Swap it for the in-cluster service URL.
  const actionUrl = flow.ui.action.replace(/^https?:\/\/[^/]+(\/api\/kratos)?/, KRATOS_URL);
  const oidcRes = http.post(
    actionUrl,
    JSON.stringify({ method: 'oidc', provider: 'mock', csrf_token: csrfToken }),
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      redirects: 0,
      responseCallback: http.expectedStatuses(200, 302, 422),
    }
  );
  if (!check(oidcRes, { 'oidc redirect received': (r) => r.status === 422 || r.status === 302 })) {
    return;
  }

  // 3. Inject unique login_hint — mock-oauth2-server uses it as OIDC sub and email,
  //    so each VU registers as a distinct Kratos identity.
  let authorizeUrl = oidcRes.json()?.redirect_browser_to || oidcRes.headers['Location'];
  authorizeUrl += `&login_hint=vuser-${uuidv4()}@mathtrail.test`;

  // 4. Follow the full redirect chain: mock authorize → Kratos OIDC callback → session
  // mock-oauth2-server redirects to Kratos callback using its public (browser-facing) URL,
  // which is unreachable from inside the cluster. Intercept the 302 and rewrite it.
  const authorizeRes = http.get(authorizeUrl, { redirects: 0 });
  let callbackUrl = authorizeRes.headers['Location'];
  callbackUrl = callbackUrl.replace(/^https?:\/\/[^/]+(\/api\/kratos)?/, KRATOS_URL);
  // Kratos responds 302 → identity-ui (https://mathtrail.localhost) after successful registration.
  // Don't follow that redirect — the TLS cert is self-signed and unreachable from the pod.
  const callbackRes = http.get(callbackUrl, {
    redirects: 0,
    responseCallback: http.expectedStatuses(302, 303),
  });
  check(callbackRes, { 'registration complete': (r) => r.status === 302 || r.status === 303 });

  sleep(1);
}
