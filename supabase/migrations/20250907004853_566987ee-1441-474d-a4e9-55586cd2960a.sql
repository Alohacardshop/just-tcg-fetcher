-- Update games with tcgcsv category IDs and slugs
UPDATE games SET 
  slug = 'magic',
  tcgcsv_category_id = '1'
WHERE name = 'Magic: The Gathering';

UPDATE games SET 
  slug = 'pokemon',
  tcgcsv_category_id = '3'
WHERE name = 'Pokemon';

UPDATE games SET 
  slug = 'pokemon-japan',
  tcgcsv_category_id = '85'
WHERE name = 'Pokemon Japan';

UPDATE games SET 
  slug = 'yugioh',
  tcgcsv_category_id = '2'
WHERE name = 'YuGiOh';

UPDATE games SET 
  slug = 'flesh-and-blood',
  tcgcsv_category_id = '10'
WHERE name = 'Flesh and Blood TCG';

UPDATE games SET 
  slug = 'one-piece',
  tcgcsv_category_id = '16'
WHERE name = 'One Piece Card Game';

UPDATE games SET 
  slug = 'digimon',
  tcgcsv_category_id = '14'
WHERE name = 'Digimon Card Game';

UPDATE games SET 
  slug = 'disney-lorcana',
  tcgcsv_category_id = '15'
WHERE name = 'Disney Lorcana';

UPDATE games SET 
  slug = 'star-wars-unlimited',
  tcgcsv_category_id = '17'
WHERE name = 'Star Wars: Unlimited';