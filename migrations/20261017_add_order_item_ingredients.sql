ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS ingredients JSONB;

UPDATE order_items oi
SET ingredients = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'ingredientId', mi.ingredient_id,
        'amount', mi.amount::float8
      )
      ORDER BY mi.ingredient_id
    )
    FROM menu_item_ingredients mi
    WHERE mi.menu_item_id = oi.menu_item_id
  ),
  '[]'::jsonb
)
WHERE oi.ingredients IS NULL;

ALTER TABLE order_items
ALTER COLUMN ingredients SET DEFAULT '[]'::jsonb,
ALTER COLUMN ingredients SET NOT NULL;
