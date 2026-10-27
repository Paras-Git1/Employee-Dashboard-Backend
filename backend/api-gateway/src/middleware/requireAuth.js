import jwt from 'jsonwebtoken';

// Verifies the session cookie issued by the auth service and exposes the user as req.user.
export function requireAuth({ jwtSecret, cookieName }) {
  return (req, res, next) => {
    const token = req.cookies?.[cookieName];
    if (!token) return res.status(401).json({ error: 'Not signed in.' });
    try {
      const claims = jwt.verify(token, jwtSecret, { issuer: 'taskdash-auth', audience: 'taskdash' });
      req.user = { id: Number(claims.sub), email: claims.email, name: claims.name, access: claims.access };
      next();
    } catch {
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
  };
}
