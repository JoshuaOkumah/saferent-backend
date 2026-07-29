// const { MongoMemoryServer } = require("mongodb-memory-server");

// module.exports = async () => {
//   // Start an in-memory MongoDB instance
//   const mongod = await MongoMemoryServer.create({
//     instance: {
//       dbName: "rentsafe_test",
//     },
//   });

//   const uri = mongod.getUri();

//   // Store the URI and instance reference globally so tests and teardown can use them
//   process.env.MONGO_URI = uri;

//   // Store mongod instance so globalTeardown can stop it
//   global.__MONGOD__ = mongod;

//   console.log(`\n🧪 MongoMemoryServer started: ${uri}\n`);
// };

const { MongoMemoryReplSet } = require("mongodb-memory-server");

module.exports = async () => {
  // Transactions require a replica set — a standalone MongoMemoryServer
  // cannot run session.withTransaction(). Spin up a single-node repl set instead.
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });

  await replSet.waitUntilRunning();

  const uri = replSet.getUri();

  process.env.MONGO_URI = uri;
  global.__MONGOD__ = replSet;

  console.log(`\n🧪 MongoMemoryReplSet started: ${uri}\n`);
};
