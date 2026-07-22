const ADJECTIVES = [
  "Wobbly", "Silly", "Fluffy", "Funky", "Bouncy", "Sneaky", "Chubby", "Derpy",
  "Giggly", "Goofy", "Jiggly", "Nutty", "Peppy", "Quirky", "Snazzy", "Speedy",
  "Squishy", "Wacky", "Zesty", "Zigzag", "Bumbling", "Clumsy", "Dizzy", "Fizzy",
  "Giddy", "Jolly", "Loopy", "Mellow", "Nippy", "Puffy", "Rowdy", "Sassy",
  "Spunky", "Ticklish", "Tobbly", "Wiggly", "Yappy", "Zippy", "Bubbling", "Cranky",
  "Doodle", "Fidgety", "Glitchy", "Hasty", "Jumpy", "Kooky", "Nifty", "Pompous",
  "Scribble", "Sparky"
];

const NOUNS = [
  "Potato", "Pancake", "Banana", "Noodle", "Penguin", "Otter", "Taco", "Unicorn",
  "Waffle", "Muffin", "Pickle", "Burrito", "Donut", "Nugget", "Cupcake", "Meatball",
  "Pretzel", "Biscuit", "Marshmallow", "Wombat", "Capybara", "Hamster", "Hedgehog", "Sloth",
  "Llama", "Panda", "Koala", "Duckling", "Flamingo", "Walrus", "Cheeto", "TaterTot",
  "Popcorn", "Dumpling", "Guacamole", "Dorito", "Macaroni", "Ramen", "Samosa", "Bagel",
  "Cactus", "Mango", "Pineapple", "Turnip", "Zucchini", "Blobfish", "Moose", "Badger"
];

/**
 * Generates a random funny name combining an adjective and a noun.
 * 50 Adjectives x 48 Nouns = 2,400 unique combinations!
 */
export function getRandomFunnyName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}${noun}`;
}
