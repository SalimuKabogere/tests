import { test, describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { RandomUserClient } from "./client.js";

describe("RandomUserClient With a Mocked Fetch", () => {
  const fakeBaseUrl = "https://randomuser.fake/api";
  let client;
  let originalFetch;

  // this runs before each test
  beforeEach(() => {
    // initialize the client with a fake base URL
    client = new RandomUserClient(fakeBaseUrl);

    // save the original fetch function
    originalFetch = globalThis.fetch;
  });

  // this runs after each test
  afterEach(() => {
    // restore the original fetch function
    globalThis.fetch = originalFetch;
  });
  // principle 2: test the happy path
  it("It should correctly parse data when the server responds with a 200 Ok", async () => {
    // arrange
    const fakeResponse = {
      results: [
        {
          name: { first: "Salimu", last: "Kabogere" },
          email: "salimukabogere@example.com",
          login: { username: "salimukabogere" },
        },
      ],
    };

    // intercept the global fetch to return the fake response
    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
        // simulate the response to json
        json: async () => fakeResponse,
      };
    };

    // act
    const data = await client.getRandomUser();
    console.log("Fetched data:", data);

    // assert: check if the client code handed us a fake response
    assert.ok(data, "Client did not return any data");
    assert.strictEqual(
      data.results[0].name.first,
      "Salimu",
      "First name does not match",
    );
    assert.strictEqual(
      data.results[0].name.last,
      "Kabogere",
      "Last name does not match",
    );
    assert.strictEqual(
      data.results[0].email,
      "salimukabogere@example.com",
      "Email does not match",
    );
    assert.strictEqual(
      data.results[0].login.username,
      "salimukabogere",
      "Username does not match",
    );

    console.log("Test passed: Client correctly parsed the fake response");
  });

  // Principle 3: Test the sad path
    it("It should return 500 server error when the server responds with a 500 error", async () => {
        // intercept the global fetch to simulate a 500 server error
        globalThis.fetch = async () => {
            return {
                ok: false,
                status: 500,
                // simulate the response to json
                json: async () => (
                    { error: "Internal Server Error"}
                )
            };
        };
        // silence the console error
        const originalConsoleError = console.error;
        console.error = () => {};
    
        // act
        const data2 = await client.getRandomUser();
        console.log("Fetched data[test 2]:", data2);
        
        // assert: check if the client code handled the 500 error correctly
        assert.strictEqual(data2, undefined, "Client did not handle the 500 server error correctly");
    
        // restore the original console.error
        console.error = originalConsoleError;
    
        console.log("Test passed: Client correctly handled the 500 server error");
    });

    it("It should return 404 not found error when the server responds with the 404 error", async () => {
        // intercept the global fetch
        globalThis.fetch = async () => {
            return {
                ok: false, 
                status: 404,
                // simulate the response to json
                json: async () => (
                    { error: "Not Found"}
                )
            };
        };
        // silence the console error
        const originalConsoleError1 = console.error;
        console.error = () => {};
            
        // act
        const data3 = await client.getRandomUser();
        console.log("Fetched data[test 3]:", data3);
        // assert: check if the client code handled the 404 error correctly
        assert.strictEqual(data3, undefined, "Client did not handle the 404 not found error correctly");
    
        // restore the original console.error
        console.error = originalConsoleError1;
    
        console.log("Test passed: Client correctly handled the 404 not found error");
    });

    it("It should return 401 unauthorized error when the server responds with the 401 error", async () => {
        // intercept the global fetch
        globalThis.fetch = async () => {
            return {
                ok: false, 
                status: 401,
                // simulate the response to json
                json: async () => (
                    { error: "Unauthorized"}
                )
            };
        };
        // silence the console error
        const originalConsoleError2 = console.error;
        console.error = () => {};
            
        // act
        const data4 = await client.getRandomUser();
        console.log("Fetched data[test 4]:", data4);
        // assert: check if the client code handled the 404 error correctly
        assert.strictEqual(data4, undefined, "Client did not handle the 401 unauthorized error correctly");
    
        // restore the original console.error
        console.error = originalConsoleError2;
    
        console.log("Test passed: Client correctly handled the 401 unauthorized error");
    });
});
