const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const { OAuth2Client } = require('google-auth-library');
const { sendOtpEmail } = require('../services/emailService');

// Helper for generating 6 digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    let user = await User.findOne({ username });

    // Auto-create admin in dev mode
    if (!user && username === 'admin' && password === 'admin123') {
      user = new User({
        username: 'admin',
        email: 'admin@guardiansync.io',
        password: 'admin123',
        role: 'admin',
      });
      await user.save();
    }

    // Keep the built-in admin account authoritative
    if (user && username === 'admin' && password === 'admin123' && user.role !== 'admin') {
      user.role = 'admin';
      if (!user.email) user.email = 'admin@guardiansync.io';
      await user.save();
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Generate OTP
    const otpCode = generateOTP();
    user.otpCode = otpCode;
    user.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await user.save();

    // Send email
    const emailSent = await sendOtpEmail(user.email, otpCode);
    if (!emailSent) {
      return res.status(502).json({ error: 'Unable to send OTP email. Please try again later.' });
    }

    res.json({ requireOtp: true, userId: user._id });
  } catch (err) { next(err); }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { userId, otpCode } = req.body;
    if (!userId || !otpCode) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.otpCode !== otpCode || new Date() > user.otpExpiresAt) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    // Clear OTP
    user.otpCode = null;
    user.otpExpiresAt = null;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token, user: user.toJSON() });
  } catch (err) { next(err); }
});

// POST /api/auth/google-login
router.post('/google-login', async (req, res, next) => {
  try {
    const { idToken, access_token, role } = req.body;

    let email, name;

    if (access_token) {
      // Implicit flow: verify access token by calling Google's userinfo endpoint
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Invalid Google access token:', response.status, errorBody);
        return res.status(401).json({ error: 'Invalid Google access token' });
      }
      const userInfo = await response.json();
      email = userInfo.email;
      name = userInfo.name;
      console.log('Google token (access_token) verified for:', email);
    } else if (idToken) {
      // Authorization code flow: verify ID token
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({ error: 'Google OAuth not configured on server' });
      }
      const googleClient = new OAuth2Client(clientId);
      const ticket = await googleClient.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      email = payload.email;
      name = payload.name;
      console.log('Google token (idToken) verified for:', email);
    } else {
      return res.status(400).json({ error: 'No Google token provided' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Could not retrieve email from Google' });
    }

    // Find or create user
    let user = await User.findOne({ email });
    if (!user) {
      const username = email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
      user = new User({
        username,
        email,
        password: Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10),
        role: role === 'admin' ? 'admin' : 'operator',
      });
      await user.save();
      console.log('New user created via Google OAuth:', username, 'with role:', user.role);
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token, user: user.toJSON() });
  } catch (err) {
    console.error('Google Auth Error:', err.message);
    res.status(401).json({ error: 'Google sign-in failed: ' + err.message });
  }
});

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }

    const normalizedRole = role === 'admin' ? 'admin' : 'operator';
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const user = new User({ username, email, password, role: normalizedRole });
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  delete user.password;
  res.json(user);
});

module.exports = router;
