// Illustrative data: approximate values per typical serving, for prototype use only.
export type Serving = { label: string; mult: number }
export type Food = {
  id: string
  name: string
  category: string
  servingLabel: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
}

type Row = [string, string, string, number, number, number, number, number]
// [name, category, serving label, grams, kcal, protein g, carbs g, fat g]
const rows: Row[] = [
  // Indonesian staples
  ['Nasi goreng', 'Indonesian', '1 plate', 300, 520, 14, 70, 20],
  ['Nasi uduk', 'Indonesian', '1 plate', 250, 410, 7, 62, 14],
  ['Nasi putih (white rice)', 'Indonesian', '1 cup cooked', 160, 205, 4, 45, 0.4],
  ['Nasi kuning', 'Indonesian', '1 plate', 250, 400, 7, 64, 12],
  ['Nasi padang (rice + rendang)', 'Indonesian', '1 plate', 400, 750, 30, 75, 35],
  ['Rendang daging', 'Indonesian', '1 piece', 100, 270, 20, 6, 19],
  ['Tempe goreng', 'Indonesian', '1 piece', 25, 88, 5, 3.5, 6],
  ['Tempe mendoan', 'Indonesian', '1 piece', 40, 130, 5, 10, 8],
  ['Orek tempe', 'Indonesian', '1 serving', 50, 110, 6, 7, 6.5],
  ['Tempe bacem', 'Indonesian', '1 piece', 30, 80, 5, 7, 3.5],
  ['Tahu goreng', 'Indonesian', '1 piece', 30, 70, 4.5, 1.5, 5],
  ['Sate ayam (with peanut sauce)', 'Indonesian', '10 skewers', 200, 450, 35, 15, 28],
  ['Sate kambing', 'Indonesian', '10 skewers', 200, 480, 34, 10, 33],
  ['Gado-gado', 'Indonesian', '1 plate', 350, 400, 16, 30, 25],
  ['Mie goreng', 'Indonesian', '1 plate', 300, 540, 13, 70, 22],
  ['Indomie goreng (instant)', 'Indonesian', '1 pack', 85, 380, 8, 52, 16],
  ['Bakso (meatball soup)', 'Indonesian', '1 bowl', 400, 380, 22, 40, 14],
  ['Soto ayam', 'Indonesian', '1 bowl', 400, 310, 22, 25, 13],
  ['Ayam goreng', 'Indonesian', '1 thigh', 120, 320, 26, 6, 21],
  ['Ayam bakar', 'Indonesian', '1 thigh', 120, 260, 27, 5, 14],
  ['Pecel lele', 'Indonesian', '1 fish + sambal', 150, 350, 22, 8, 25],
  ['Bubur ayam', 'Indonesian', '1 bowl', 350, 350, 15, 50, 9],
  ['Ketoprak', 'Indonesian', '1 plate', 350, 450, 15, 55, 19],
  ['Martabak manis', 'Indonesian', '1 slice', 90, 300, 6, 40, 13],
  ['Martabak telur', 'Indonesian', '2 pieces', 120, 330, 13, 22, 21],
  ['Pisang goreng', 'Indonesian', '1 piece', 70, 160, 1.5, 24, 7],
  ['Gorengan bakwan', 'Indonesian', '1 piece', 50, 140, 3, 14, 8],
  ['Sayur asem', 'Indonesian', '1 bowl', 250, 90, 3, 15, 2],
  ['Sayur lodeh', 'Indonesian', '1 bowl', 250, 200, 5, 12, 15],
  ['Capcay', 'Indonesian', '1 plate', 250, 180, 9, 15, 9],
  ['Rawon', 'Indonesian', '1 bowl', 350, 330, 25, 10, 21],
  ['Gulai ayam', 'Indonesian', '1 bowl', 250, 360, 25, 8, 25],
  ['Pempek', 'Indonesian', '1 portion', 150, 330, 13, 45, 10],
  ['Siomay', 'Indonesian', '1 portion', 200, 340, 18, 35, 14],
  ['Lontong sayur', 'Indonesian', '1 plate', 350, 420, 10, 55, 17],
  ['Kerupuk', 'Indonesian', '1 handful', 20, 100, 1, 13, 5],
  ['Sambal', 'Indonesian', '1 tbsp', 15, 30, 0.3, 2, 2.4],
  ['Es teh manis', 'Drinks', '1 glass', 250, 90, 0, 23, 0],
  ['Es kopi susu', 'Drinks', '1 cup', 250, 180, 4, 26, 6],
  ['Kopi tubruk (with sugar)', 'Drinks', '1 cup', 200, 50, 0.3, 12, 0],
  // Breakfast and grains
  ['Oatmeal', 'Breakfast', '1 bowl cooked', 240, 160, 6, 27, 3],
  ['Granola', 'Breakfast', '1/2 cup', 60, 270, 6, 38, 10],
  ['Whole wheat bread', 'Breakfast', '1 slice', 30, 80, 4, 14, 1],
  ['White bread', 'Breakfast', '1 slice', 30, 80, 2.5, 15, 1],
  ['Croissant', 'Breakfast', '1 piece', 60, 230, 5, 26, 12],
  ['Pancakes', 'Breakfast', '2 medium', 150, 350, 8, 50, 12],
  ['Cornflakes', 'Breakfast', '1 cup', 30, 110, 2, 25, 0.2],
  ['Boiled egg', 'Breakfast', '1 large', 50, 78, 6, 0.6, 5],
  ['Fried egg', 'Breakfast', '1 large', 50, 90, 6, 0.4, 7],
  ['Scrambled eggs', 'Breakfast', '2 eggs', 120, 200, 13, 2, 15],
  ['Pasta, cooked', 'Grains', '1 cup', 140, 220, 8, 43, 1.3],
  ['Brown rice, cooked', 'Grains', '1 cup', 160, 215, 5, 45, 1.8],
  ['Quinoa, cooked', 'Grains', '1 cup', 185, 220, 8, 39, 3.5],
  ['Potato, boiled', 'Grains', '1 medium', 170, 150, 4, 34, 0.2],
  ['Sweet potato, baked', 'Grains', '1 medium', 150, 135, 3, 31, 0.2],
  ['Tortilla wrap', 'Grains', '1 wrap', 60, 180, 5, 30, 4.5],
  // Protein
  ['Chicken breast, grilled', 'Protein', '1 fillet', 150, 250, 46, 0, 5.5],
  ['Salmon, baked', 'Protein', '1 fillet', 150, 310, 33, 0, 19],
  ['Tuna, canned in water', 'Protein', '1 can', 120, 130, 29, 0, 1],
  ['Beef steak', 'Protein', '1 steak', 200, 500, 50, 0, 33],
  ['Ground beef, cooked', 'Protein', '100 g', 100, 250, 26, 0, 16],
  ['Shrimp, cooked', 'Protein', '100 g', 100, 100, 24, 0.2, 0.3],
  ['Tofu, firm', 'Protein', '100 g', 100, 145, 16, 3, 9],
  ['Lentils, cooked', 'Protein', '1 cup', 200, 230, 18, 40, 0.8],
  ['Chickpeas, cooked', 'Protein', '1 cup', 165, 270, 15, 45, 4],
  ['Greek yogurt, plain', 'Dairy', '1 cup', 200, 130, 20, 8, 0.8],
  ['Milk, whole', 'Dairy', '1 glass', 250, 150, 8, 12, 8],
  ['Milk, skim', 'Dairy', '1 glass', 250, 85, 8, 12, 0.2],
  ['Cheddar cheese', 'Dairy', '1 slice', 28, 115, 7, 0.4, 9.5],
  ['Whey protein shake', 'Drinks', '1 scoop + water', 30, 120, 24, 3, 1.5],
  // Fruit and veg
  ['Banana', 'Fruit', '1 medium', 118, 105, 1.3, 27, 0.4],
  ['Apple', 'Fruit', '1 medium', 180, 95, 0.5, 25, 0.3],
  ['Orange', 'Fruit', '1 medium', 130, 62, 1.2, 15, 0.2],
  ['Mango', 'Fruit', '1 cup sliced', 165, 100, 1.4, 25, 0.6],
  ['Papaya', 'Fruit', '1 cup', 145, 62, 0.7, 16, 0.4],
  ['Watermelon', 'Fruit', '1 wedge', 280, 85, 1.7, 21, 0.4],
  ['Strawberries', 'Fruit', '1 cup', 150, 50, 1, 12, 0.5],
  ['Grapes', 'Fruit', '1 cup', 150, 105, 1.1, 27, 0.2],
  ['Avocado', 'Fruit', '1/2 fruit', 100, 160, 2, 9, 15],
  ['Mixed salad', 'Vegetables', '1 bowl', 150, 30, 2, 6, 0.3],
  ['Broccoli, steamed', 'Vegetables', '1 cup', 150, 55, 4, 11, 0.6],
  ['Carrots', 'Vegetables', '1 cup', 130, 52, 1.2, 12, 0.3],
  ['Spinach, sauteed', 'Vegetables', '1 cup', 180, 80, 5, 7, 4],
  ['Kangkung tumis', 'Indonesian', '1 plate', 150, 120, 4, 8, 8],
  ['Corn on the cob', 'Vegetables', '1 ear', 100, 90, 3, 19, 1.4],
  // Meals and fast food
  ['Cheeseburger', 'Meals', '1 burger', 200, 540, 28, 40, 30],
  ['Pizza, cheese', 'Meals', '1 slice', 110, 285, 12, 36, 10],
  ['French fries', 'Meals', 'Medium portion', 117, 365, 4, 48, 17],
  ['Fried chicken (fast food)', 'Meals', '1 piece', 130, 390, 30, 12, 25],
  ['Chicken sandwich', 'Meals', '1 sandwich', 200, 450, 28, 42, 18],
  ['Caesar salad with chicken', 'Meals', '1 bowl', 300, 440, 35, 15, 27],
  ['Sushi roll (salmon)', 'Meals', '6 pieces', 180, 300, 12, 42, 8],
  ['Ramen', 'Meals', '1 bowl', 500, 550, 22, 70, 20],
  ['Spaghetti bolognese', 'Meals', '1 plate', 350, 560, 28, 65, 20],
  ['Burrito', 'Meals', '1 burrito', 300, 600, 26, 70, 22],
  // Snacks and drinks
  ['Almonds', 'Snacks', '1 handful', 28, 165, 6, 6, 14],
  ['Peanuts, roasted', 'Snacks', '1 handful', 28, 165, 7, 5, 14],
  ['Peanut butter', 'Snacks', '1 tbsp', 16, 95, 4, 3, 8],
  ['Dark chocolate', 'Snacks', '2 squares', 20, 110, 1.5, 9, 8],
  ['Potato chips', 'Snacks', '1 small bag', 28, 150, 2, 15, 10],
  ['Cookies', 'Snacks', '2 cookies', 30, 140, 1.5, 20, 6],
  ['Protein bar', 'Snacks', '1 bar', 60, 220, 20, 23, 7],
  ['Ice cream', 'Snacks', '1 scoop', 70, 145, 2.5, 17, 8],
  ['Coffee, black', 'Drinks', '1 cup', 240, 2, 0.3, 0, 0],
  ['Latte', 'Drinks', '1 medium', 350, 190, 10, 15, 10],
  ['Orange juice', 'Drinks', '1 glass', 250, 110, 2, 26, 0.5],
  ['Cola', 'Drinks', '1 can', 330, 140, 0, 35, 0],
  ['Bubble tea', 'Drinks', '1 cup', 500, 350, 2, 70, 7],
  ['Beer', 'Drinks', '1 bottle', 330, 150, 1.6, 13, 0],
]

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const FOODS: Food[] = rows.map(([name, category, servingLabel, grams, kcal, protein, carbs, fat]) => ({
  id: slug(name),
  name,
  category,
  servingLabel,
  grams,
  kcal,
  protein,
  carbs,
  fat,
}))

export const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]))

export function servingsFor(food: Food): Serving[] {
  const out: Serving[] = [
    { label: `${food.servingLabel} (${food.grams} g)`, mult: 1 },
  ]
  if (food.grams !== 100) out.push({ label: '100 g', mult: 100 / food.grams })
  return out
}
