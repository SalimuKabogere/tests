// we pass Objects and arrays by reference

const person = {
    name: "Salimu",
    age: 25,
    occupation: "Software Engineer"
}

// define a function that tries to modify the person object

function modifyPerson(object) {
    object.name = "John Doe";
    console.log(object);
}

modifyPerson(person);
console.log(person); // the original person object is modified

// This same implementation also applies to arrays

let shoppingList = ["milk", "bread", "eggs"];

function addOneKilo(list) {
    for (let i = 0; i < list.length; i++) {
        list[i] = `1kg of ${list[i]}`;
    }
}

addOneKilo(shoppingList);

console.log(shoppingList);