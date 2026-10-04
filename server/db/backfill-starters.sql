-- Approval-gated data backfill for the 52 starter templates added in seed.sql.
-- This is intentionally separate from db:seed and must only be executed after
-- explicit approval. It copies each missing starter to each existing user.
-- Existing customized rows and existing copies are left untouched.
INSERT INTO cartcheck.products (user_id, source_starter_code, name, category)
SELECT u.id, s.code, s.name, s.category
FROM cartcheck.users AS u
CROSS JOIN cartcheck.starter_products AS s
WHERE s.code IN (
  'produce-kangkong', 'produce-pechay', 'produce-okra', 'produce-sayote',
  'produce-sitaw', 'produce-malunggay-leaves', 'produce-ampalaya', 'produce-upo',
  'dairy-powdered-milk', 'meat-chicken-thigh', 'meat-chicken-drumstick',
  'meat-bangus', 'meat-tilapia', 'seafood-dried-fish', 'meat-whole-chicken',
  'meat-pork-belly', 'meat-tocino', 'meat-longganisa', 'seafood-galunggong',
  'produce-saba-bananas', 'produce-lakatan-bananas',
  'pantry-bihon', 'pantry-pancit-canton', 'pantry-mung-beans', 'pantry-bagoong',
  'pantry-regular-milled-rice', 'pantry-dinorado-rice', 'pantry-sinandomeng-rice',
  'pantry-glutinous-rice', 'pantry-cornstarch', 'pantry-corn-grits',
  'pantry-banana-ketchup', 'pantry-coconut-cream', 'beverages-instant-coffee',
  'beverages-three-in-one-coffee', 'pantry-cup-noodles', 'household-fabric-conditioner',
  'pantry-canned-luncheon-meat', 'pantry-corned-beef', 'household-toothbrush',
  'frozen-fish-balls', 'household-hair-conditioner', 'snacks-banana-chips', 'meat-pork-shoulder-kasim',
  'beverages-powdered-juice', 'beverages-chocolate-drink', 'household-sanitary-pads',
  'household-bath-soap', 'household-shampoo', 'household-toothpaste',
  'household-bleach', 'household-facial-tissues'
)
ON CONFLICT (user_id, source_starter_code) DO NOTHING;
