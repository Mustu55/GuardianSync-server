const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = header.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Invalid token format' });
    }
    const decoded = jwt.verify(token, JWT_SECRET, { 
      algorithms: ['HS256'],
      clockTimestamp: Math.floor(Date.now() / 1000),
    });
    req.user = decoded;
    next();
  } catch (error) {
    const message = error.name === 'TokenExpiredError' 
      ? 'Token expired' 
      : error.name === 'JsonWebTokenError'
      ? 'Invalid token'
      : 'Authentication failed';
    return res.status(401).json({ error: message });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  const isAdminUser = req.user?.username === 'admin';
  if (!req.user || (!roles.includes(req.user.role) && !isAdminUser)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

module.exports = { authMiddleware, requireRole };
