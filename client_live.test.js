import assert from 'node:assert';
import { RandomUserClient } from './client.js';
import { test, describe, it } from 'node:test';

describe('RandomUserClient With a Live Integration Test', () => {
    it('should return a random user from the API', async () => {
        // use the real endpoint for the integration test
        const client = new RandomUserClient('https://randomuser.me/api');

        // make the actual network request to the API
        const user = await client.getRandomUser();

        // assert that the user exists
        assert.ok(user, "API did not return a user");

        // assert that the structure matches the real format of the API response
        assert.ok(Array.isArray(user.results), "API response does not contain 'results' array");
        assert.ok(user.results.length > 0, "API response 'results' array is empty");

        // inspect the first user object to ensure it has the expected properties
        const firstUser = user.results[0];
        assert.ok(firstUser.name, "User object does not contain 'name' property");
        assert.ok(firstUser.email, "User object does not contain 'email' property");
        assert.ok(firstUser.login, "User object does not contain 'login' property");

        // log the user full names
        console.log(`Fetched user: ${firstUser.name.first} ${firstUser.name.last}`);
        
    })
})