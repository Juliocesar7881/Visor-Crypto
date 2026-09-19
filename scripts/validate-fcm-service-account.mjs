import fs from 'node:fs';
import crypto from 'node:crypto';

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credentialsPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required');

const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
const projectId = process.env.FCM_PROJECT_ID || credentials.project_id;
if (!credentials.client_email || !credentials.private_key || !projectId) {
    throw new Error('Incomplete FCM service-account credentials');
}

const base64Url = (value) => Buffer.from(value).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
}));
const unsigned = `${header}.${claims}`;
const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url');

const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`
    })
});
const tokenPayload = await tokenResponse.json();
if (!tokenResponse.ok) {
    throw new Error(`OAuth validation failed (${tokenResponse.status}): ${tokenPayload.error || 'unknown_error'} - ${tokenPayload.error_description || 'no description'}`);
}
if (!tokenPayload.access_token) throw new Error('OAuth validation returned no access token');

const fcmResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
        authorization: `Bearer ${tokenPayload.access_token}`,
        'content-type': 'application/json'
    },
    body: JSON.stringify({
        message: {
            topic: 'visor_release_validation_v1',
            data: {
                type: 'release_validation',
                strategyVersion: 'S6_INV',
                versionCode: '136'
            },
            android: {
                priority: 'high',
                ttl: '60s',
                restricted_package_name: 'com.visorcrypto.app'
            }
        }
    })
});
if (!fcmResponse.ok) throw new Error(`FCM validation failed (${fcmResponse.status})`);

console.log(JSON.stringify({
    oauthValidated: true,
    fcmAccepted: true,
    projectId,
    packageName: 'com.visorcrypto.app',
    topic: 'visor_release_validation_v1'
}));
