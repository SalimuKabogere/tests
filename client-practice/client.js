// define class Client
export class RandomUserClient {
    constructor (baseUrl) {
        this.baseUrl = baseUrl;
    }

    // define method getRandomUser
    async getRandomUser () {
        try {
            const response = await fetch(`${this.baseUrl}`);
            // add guard clause to check if the response is ok
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const user = await response.json();
            return user;
        }
        catch (error) {
            console.error('Error fetching random user:', error);
        }
    }
}

// // function to use the RandomUserClient class
// async function fetchRandomUser() {
//     const client = new RandomUserClient('https://randomuser.me/api');
//     const user = await client.getRandomUser();
//     console.log(user);
// }

// // call the function to fetch a random user
// fetchRandomUser();