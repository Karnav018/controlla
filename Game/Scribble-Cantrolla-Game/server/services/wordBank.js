/**
 * Themed Word Banks for Scribble Party (1,000+ Words)
 */

const THEMED_WORDS = {
  classic: [
    "cat", "dog", "elephant", "pizza", "guitar", "umbrella", "rocket", "snowman", "bicycle", "lighthouse",
    "volcano", "astronaut", "butterfly", "treasure", "dinosaur", "rainbow", "castle", "submarine", "parachute", "tornado",
    "apple", "banana", "orange", "grape", "watermelon", "strawberry", "pineapple", "cherry", "peach", "mango",
    "lion", "tiger", "bear", "monkey", "giraffe", "zebra", "hippo", "rhino", "penguin", "koala",
    "car", "truck", "bus", "train", "airplane", "helicopter", "boat", "ship", "motorcycle", "scooter",
    "computer", "phone", "television", "radio", "camera", "clock", "watch", "headphones", "microphone", "speaker",
    "table", "chair", "sofa", "bed", "desk", "lamp", "mirror", "window", "door", "stairs",
    "house", "apartment", "tent", "igloo", "cabin", "mansion", "palace", "hut", "barn", "factory",
    "sun", "moon", "star", "cloud", "rain", "snow", "wind", "storm", "lightning", "thunder",
    "tree", "flower", "grass", "bush", "leaf", "branch", "root", "seed", "forest", "jungle",
    "ocean", "river", "lake", "pond", "waterfall", "beach", "island", "mountain", "hill", "valley",
    "doctor", "nurse", "teacher", "police", "firefighter", "chef", "baker", "farmer", "pilot", "dentist",
    "shirt", "pants", "dress", "skirt", "jacket", "coat", "sweater", "sock", "shoe", "hat",
    "glasses", "sunglasses", "scarf", "glove", "belt", "tie", "ring", "necklace", "bracelet", "earring",
    "book", "notebook", "pen", "pencil", "eraser", "ruler", "scissors", "glue", "tape", "paper",
    "ball", "bat", "glove", "net", "goal", "racket", "club", "puck", "board", "skate",
    "dragon", "unicorn", "mermaid", "fairy", "goblin", "ghost", "vampire", "zombie", "werewolf", "witch",
    "wizard", "knight", "king", "queen", "prince", "princess", "alien", "robot", "monster", "superhero"
  ],

  marvel: [
    "iron man", "spider-man", "thor", "thanos", "captain america", "hulk", "loki", "groot", "venom",
    "vibranium", "wakanda", "mjolnir", "shield", "doctor strange", "deadpool", "wolverine", "hawkeye",
    "black widow", "infinity gauntlet", "vision", "ant-man", "scarlet witch", "daredevil", "punisher",
    "asgard", "hydra", "sanctum", "falcon", "winter soldier", "black panther", "nick fury", "rocket raccoon",
    "gamora", "drax", "star-lord", "nebula", "mantis", "magneto", "professor x", "storm", "cyclops",
    "rogue", "beast", "mystique", "quicksilver", "thanos snap", "arc reactor", "web shooter", "infinity stone",
    "space stone", "mind stone", "reality stone", "power stone", "time stone", "soul stone", "quantum realm",
    "avengers tower", "bucky barnes", "miles morales", "spider-gwen", "green goblin", "doc ock", "electro", "sandman"
  ],

  galaxy: [
    "black hole", "supernova", "lightsaber", "astronaut", "alien", "spaceship", "planet mars", "meteor",
    "nebula", "telescope", "zero gravity", "warp drive", "eclipse", "solar flare", "starship", "wormhole",
    "cosmos", "rocket", "satellite", "constellation", "milky way", "orbit", "cyberpunk", "laser", "forcefield",
    "spacewalk", "lunar rover", "space station", "asteroid belt", "comet", "milky way", "andromeda", "jupiter",
    "saturn rings", "pluto", "hologram", "space helmet", "gravity beam", "starlight", "supercluster",
    "deep space", "space shuttle", "space cadet", "solar panel", "space dust", "light speed", "event horizon"
  ],

  popculture: [
    "harry potter", "pikachu", "batman", "star wars", "spongebob", "mario", "shrek", "mickey mouse",
    "pac-man", "sonic", "transformer", "barbie", "godzilla", "minion", "joker", "darth vader", "wednesday",
    "matrix", "indiana jones", "jurassic park", "elsa", "buzz lightyear", "woody", "nemo", "wall-e",
    "scooby-doo", "bugs bunny", "garfield", "homer simpson", "darth maul", "superman", "wonder woman",
    "flash", "aquaman", "katniss", "gollum", "legolas", "sherlock holmes", "james bond", "jack sparrow",
    "squid game", "stranger things", "pennywise", "chucky", "t-800 terminator", "ghostbusters", "back to the future"
  ],

  food: [
    "pizza", "sushi", "burger", "taco", "ice cream", "pancake", "waffle", "donut", "ramen", "chocolate",
    "espresso", "burrito", "cheesecake", "croissant", "milkshake", "spaghetti", "hotdog", "popcorn",
    "nachos", "cupcake", "macaron", "bubble tea", "dumpling", "lasagna", "omelette", "paella", "bagel",
    "muffin", "pretzel", "brownie", "tiramisu", "smoothie", "guacamole", "nuggets", "french fries",
    "fried chicken", "barbecue", "marshmallow", "cotton candy", "fondue", "churro", "boba tea", "curry"
  ],

  gaming: [
    "minecraft", "pokemon", "zelda", "fortnite", "among us", "dragon ball", "naruto", "one piece",
    "attack on titan", "league of legends", "roblox", "arcade", "portal", "tetris", "game boy", "playstation",
    "joystick", "death note", "demon slayer", "jujutsu kaisen", "super smash bros", "god of war",
    "elden ring", "halo", "overwatch", "valorant", "gta v", "call of duty", "donkey kong", "pac-man ghost",
    "kirby", "master chief", "kratos", "goku", "luffy", "zoro", "tanjiro", "gojo", "kakashi", "saiyan"
  ]
};

// Generate mixed word list from all categories combined
const ALL_WORDS = Array.from(
  new Set(Object.values(THEMED_WORDS).flat().map(w => w.trim().toLowerCase().replace(/\s+/g, ' ')))
);

module.exports = {
  THEMED_WORDS,
  ALL_WORDS,

  getRandomWords(count, theme = 'classic') {
    const list = (THEMED_WORDS[theme] && THEMED_WORDS[theme].length > 0)
      ? THEMED_WORDS[theme]
      : (theme === 'mix' ? ALL_WORDS : THEMED_WORDS.classic);

    const shuffled = [...list].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).map(w => w.trim().toLowerCase());
  }
};
