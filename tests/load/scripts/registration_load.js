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
  const oidcRes = http.post(
    flow.ui.action,
    JSON.stringify({ method: 'oidc', provider: 'mock', csrf_token: csrfToken }),
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      redirects: 0,
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
  const callbackRes = http.get(authorizeUrl, { redirects: 10 });
  check(callbackRes, { 'registration complete': (r) => r.status === 200 });

  sleep(1);
}
