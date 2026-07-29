// const mongoose = require("mongoose");

// // Connect to the MongoMemoryServer instance before each test file runs.
// // globalSetup already started the server and set process.env.MONGO_URI.
// beforeAll(async () => {
//   if (mongoose.connection.readyState === 0) {
//     await mongoose.connect(process.env.MONGO_URI, { dbName: "rentsafe_test" });
//   }
// });

// // Clear all collections between every test to ensure isolation.
// afterEach(async () => {
//   const collections = mongoose.connection.collections;
//   await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
// });

// // Do NOT disconnect here — the connection is shared across all test files.
// // globalTeardown handles the final stop.

const mongoose = require("mongoose");

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "rentsafe_test",
    });
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});
