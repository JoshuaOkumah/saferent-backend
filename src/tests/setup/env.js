/**
 * Test environment variables.
 * Loaded before any test file or application code runs.
 * Overrides any .env file values for the test suite.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "rentsafe-test-jwt-secret-do-not-use-in-production";
process.env.JWT_EXPIRES_IN = "1h";
process.env.SIGNATURE_HMAC_SECRET =
  "rentsafe-test-hmac-secret-do-not-use-in-production";

// Email — mocked in tests, these values just prevent crashes
process.env.EMAIL_USER = "test@rentsafe.test";
process.env.EMAIL_PASS = "test-password";

// Cloudinary — mocked in tests
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-api-key";
process.env.CLOUDINARY_API_SECRET = "test-api-secret";

// Paystack — mocked in tests
process.env.PAYSTACK_SECRET_KEY = "sk_test_mock_key";

// Bachs.io — mocked in tests
process.env.BACHS_SECRET_KEY = "sk_test_bachs_mock_key";
process.env.BACHS_PUBLIC_KEY = "pk_test_bachs_mock_key";
process.env.BACHS_WEBHOOK_SECRET = "test_webhook_secret";
process.env.BACHS_BASE_URL = "https://api.bachs.io";

// Google OAuth — mocked in tests
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";

// Client URL
process.env.CLIENT_URL = "http://localhost:5173";

// MONGO_URI is set dynamically by globalSetup after MongoMemoryServer starts
// It writes to process.env.MONGO_URI which mongoose reads on connect
