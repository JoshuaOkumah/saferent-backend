const request = require("supertest");
const app = require("../../../src/app.js");

/**
 * Convenience wrappers around supertest.
 * All methods accept a token for auth and body for POST/PUT/PATCH.
 */

const api = {
  get: (url, token) => {
    const req = request(app).get(url);
    if (token) req.set("Authorization", `Bearer ${token}`);
    return req;
  },

  post: (url, body, token) => {
    const req = request(app).post(url).send(body);
    if (token) req.set("Authorization", `Bearer ${token}`);
    return req;
  },

  put: (url, body, token) => {
    const req = request(app).put(url).send(body);
    if (token) req.set("Authorization", `Bearer ${token}`);
    return req;
  },

  patch: (url, body, token) => {
    const req = request(app)
      .patch(url)
      .send(body || {});
    if (token) req.set("Authorization", `Bearer ${token}`);
    return req;
  },

  delete: (url, token) => {
    const req = request(app).delete(url);
    if (token) req.set("Authorization", `Bearer ${token}`);
    return req;
  },
};

module.exports = { api };
