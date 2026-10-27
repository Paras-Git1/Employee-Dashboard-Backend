import jwt from 'jsonwebtoken';

// Returns the signed-in user for a session token, or null if it is missing, invalid or expired.
export function verifySession(token, jwtSecret) {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, jwtSecret, { issuer: 'taskdash-auth', audience: 'taskdash' });
    return { id: Number(claims.sub), email: claims.email, name: claims.name, access: claims.access };
  } catch {
    return null;
  }
}

// Verifies the session cookie issued by the auth service and exposes the user as req.user.
export function requireAuth({ jwtSecret, cookieName }) {
  return (req, res, next) => {
    const token = req.cookies?.[cookieName];
    if (!token) return res.status(401).json({ error: 'Not signed in.' });
    const user = verifySession(token, jwtSecret);
    if (!user) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    req.user = user;
    next();
  };
}
