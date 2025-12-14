const rateLimit = require('express-rate-limit');

// Define your allowed IP addresses here
const ALLOWED_IPS = ['103.75.162.230', '::1', '127.0.0.1']; // Add your specific IPs

// Helper function to check if IP is allowed
const isAllowedIP = (req) => {
  // You might need to check req.headers['x-forwarded-for'] if behind a proxy
  const clientIp = req.headers['x-forwarded-for'] || req.ip;
  return ALLOWED_IPS.includes(clientIp);
};

// 1. General Limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    message: 'Too many requests from this IP, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip limiting if the function returns true
  skip: (req, res) => isAllowedIP(req)
});

// 2. Strict Login Limiter
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    message: 'Too many login attempts from this IP, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip limiting if the function returns true
  skip: (req, res) => isAllowedIP(req)
});

module.exports = { generalLimiter, loginLimiter };
