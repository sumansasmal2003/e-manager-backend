const rateLimit = require('express-rate-limit');

// 1. General Limiter: 100 requests per 15 minutes
// Good for general API usage (fetching tasks, teams, etc.)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    message: 'Too many requests from this IP, please try again after 15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// 2. Strict Login Limiter: 5 requests per hour
// Prevents brute-force password guessing
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 5 login requests per hour
  message: {
    message: 'Too many login attempts from this IP, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { generalLimiter, loginLimiter };
