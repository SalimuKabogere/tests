// passing by value means that a copy of the variable is passed to the function

const fruit = "banana";

function changeFruit(anotherFruit) {
    anotherFruit = "apple";
    console.log(anotherFruit); //apple

}

changeFruit(fruit);
console.log(fruit); //banana, the original fruit variable is not modified