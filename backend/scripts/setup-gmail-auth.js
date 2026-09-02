/**
 * setup-gmail-auth.js
 * One-time setup script to generate a Gmail OAuth refresh token.
 * Scope: https://www.googleapis.com/auth/gmail.readonly (Read-only access for OTP extraction)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const PORT = 3001;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n======================================================');
console.log('🔒 GMAIL READ-ONLY OAUTH AUTHENTICATION SETUP');
console.log('======================================================');
console.log('\n1. Open this authorization URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Log in with your Gmail (ambatimanoj2469@gmail.com) and grant Read-Only access.');
console.log('3. Upon approval, you will be redirected back and the refresh token will be printed.\n');

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/oauth2callback')) {
    const q = url.parse(req.url, true).query;
    if (q.code) {
      res.end('<h1>Authentication successful!</h1><p>You can close this browser tab and return to the terminal.</p>');
      server.close();
      try {
        const { tokens } = await oauth2Client.getToken(q.code);
        console.log('\n======================================================');
        console.log('✅ AUTHENTICATION SUCCESSFUL!');
        console.log('======================================================');
        console.log('\nAdd the following line to your .env file:\n');
        console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      } catch (err) {
        console.error('Error retrieving access token:', err.message);
      }
    } else {
      res.end('Authentication failed: No code received.');
      server.close();
    }
  }
}).listen(PORT, () => {
  console.log(`Listening for authorization callback on http://localhost:${PORT}/oauth2callback ...`);
});
