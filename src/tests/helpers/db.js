const mongoose = require("mongoose");

/**
 * Connect mongoose to the MongoMemoryServer instance.
 * Call in beforeAll().
 */
const connectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "rentsafe_test",
    });
  }
};

/**
 * Drop all collections between tests.
 * Call in beforeEach() or afterEach() to ensure test isolation.
 */
const clearDB = async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((col) => col.deleteMany({})),
  );
};

/**
 * Disconnect mongoose after all tests in a file.
 * Call in afterAll().
 */
const disconnectDB = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};

/**
 * Standard setup block — use at the top of every test file.
 */
const setupTestDB = () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterEach(async () => {
    await clearDB();
  });

  afterAll(async () => {
    // Don't disconnect — other test files share the connection
    // Only clear data
  });
};

module.exports = { connectDB, clearDB, disconnectDB, setupTestDB };
