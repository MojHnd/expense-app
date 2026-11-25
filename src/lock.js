// App lock with a WebAuthn platform passkey (Face ID on iPhone, Windows Hello on the PC).
// There is no server, so the app does not verify the signature: a successful
// navigator.credentials.get() with user verification is the gate ("lock only").

export const RELOCK_AFTER_MS = 5 * 60 * 1000;

export function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** True when the app was hidden long enough that it must lock again. */
export function shouldRelock(hiddenAt, now) {
  return hiddenAt !== null && now - hiddenAt >= RELOCK_AFTER_MS;
}

export function lockSupported() {
  return Boolean(globalThis.PublicKeyCredential && navigator.credentials);
}

const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

/** Make a new passkey for this site. Returns the credential ID (base64url). */
export async function registerPasskey() {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Expenses', id: location.hostname },
      user: { id: randomBytes(16), name: 'expenses-owner', displayName: 'Expenses owner' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  return toBase64Url(new Uint8Array(credential.rawId));
}

/** Ask for Face ID / Windows Hello. Resolves when it passes; rejects when it fails or is cancelled. */
export async function verifyPasskey(credentialId) {
  const result = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: fromBase64Url(credentialId) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  if (!result) throw new Error('No credential');
}
