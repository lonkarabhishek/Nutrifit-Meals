
-- Create a view to calculate today's production plan
CREATE OR REPLACE VIEW v_today_production AS
SELECT
    mi.recipe_id,
    r.name AS recipe_name,
    COUNT(d.id) AS total_portions
FROM
    deliveries d
JOIN
    subscriptions s ON d.subscription_id = s.id
JOIN
    menu_instances mi ON d.date = mi.date
JOIN
    recipes r ON mi.recipe_id = r.id
WHERE
    d.date = CURRENT_DATE
    AND d.status = 'scheduled' -- Only count scheduled, not paused or holiday
    AND s.status = 'active'
GROUP BY
    mi.recipe_id, r.name;

-- Create a view to sum macros for a client over a date range
CREATE OR REPLACE VIEW v_client_macro_range AS
SELECT
    d.subscription_id,
    s.user_id,
    d.date,
    SUM(r.kcal * s.meals_per_day) AS total_kcal,
    SUM(r.protein_g * s.meals_per_day) AS total_protein_g,
    SUM(r.carbs_g * s.meals_per_day) AS total_carbs_g,
    SUM(r.fats_g * s.meals_per_day) AS total_fats_g
FROM
    deliveries d
JOIN
    subscriptions s ON d.subscription_id = s.id
JOIN
    menu_instances mi ON d.date = mi.date
JOIN
    recipes r ON mi.recipe_id = r.id
WHERE
    d.status = 'delivered'
GROUP BY
    d.subscription_id, s.user_id, d.date;

-- Trigger function to prevent overlapping pauses
CREATE OR REPLACE FUNCTION enforce_pause_constraints()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pauses
        WHERE subscription_id = NEW.subscription_id
        AND id != COALESCE(NEW.id, 0)
        AND daterange(start_date, end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
    ) THEN
        RAISE EXCEPTION 'Pause request overlaps with an existing pause.' ;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_insert_or_update_pauses
    BEFORE INSERT OR UPDATE ON pauses
    FOR EACH ROW
    EXECUTE FUNCTION enforce_pause_constraints();

-- Trigger function to update macro_facts on delivery
CREATE OR REPLACE FUNCTION update_macro_facts_on_delivery()
RETURNS TRIGGER AS $$
DECLARE
    user_id_val UUID;
    recipe_kcal INT;
    recipe_protein INT;
    recipe_carbs INT;
    recipe_fats INT;
    meals_per_day_val INT;
BEGIN
    -- Only run trigger if status is changed to 'delivered'
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
        -- Get user_id and meals_per_day from subscription
        SELECT user_id, meals_per_day INTO user_id_val, meals_per_day_val
        FROM subscriptions
        WHERE id = NEW.subscription_id;

        -- Get macro nutrients from the recipe for that day
        SELECT r.kcal, r.protein_g, r.carbs_g, r.fats_g
        INTO recipe_kcal, recipe_protein, recipe_carbs, recipe_fats
        FROM menu_instances mi
        JOIN recipes r ON mi.recipe_id = r.id
        WHERE mi.date = NEW.date;

        -- Insert or update the macro_facts table
        INSERT INTO macro_facts (user_id, date, kcal, protein_g, carbs_g, fats_g, source)
        VALUES (
            user_id_val,
            NEW.date,
            recipe_kcal * meals_per_day_val,
            recipe_protein * meals_per_day_val,
            recipe_carbs * meals_per_day_val,
            recipe_fats * meals_per_day_val,
            'delivery'
        )
        ON CONFLICT (user_id, date) DO UPDATE SET
            kcal = excluded.kcal,
            protein_g = excluded.protein_g,
            carbs_g = excluded.carbs_g,
            fats_g = excluded.fats_g;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_delivery_update
    AFTER UPDATE ON deliveries
    FOR EACH ROW
    EXECUTE FUNCTION update_macro_facts_on_delivery();
