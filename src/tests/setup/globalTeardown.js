// module.exports = async () => {
//   if (global.__MONGOD__) {
//     await global.__MONGOD__.stop();
//     console.log("\n🧪 MongoMemoryServer stopped\n");
//   }
// };

module.exports = async () => {
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
    console.log("\n🧪 MongoMemoryReplSet stopped\n");
  }
};
