# Summary

This code has a client that hits the API to fetch random users.
It goes ahead and tests the live API integration and then also mocks the tests

## Live API test

As a good practice, you are not encouraged to perform a live test on the API
You must follow these good testing practices for a client test

- Never hit the live API
- Test the happy path ( 200 OK)
- Test the sad path ( 401, 400, 404)

## How to run it

`node --test client_live.test.js`

## Running the mock tests

These ones mock the API response and do not hit the live API.
They instead fake the response and test the two clean testing principles:

- Test the happy path
- Test the sad path

## How to run

`node --test client_mock.test.js`
