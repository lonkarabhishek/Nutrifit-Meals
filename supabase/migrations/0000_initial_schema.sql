
-- Create custom enum types
CREATE TYPE user_role AS ENUM ('client', 'chef', 'admin', 'driver');
CREATE TYPE delivery_status AS ENUM ('scheduled', 'out_for_delivery', 'arriving', 'delivered', 'skipped_paused', 'holiday_sunday', 'failed');
CREATE TYPE meal_slot AS ENUM ('lunch', 'dinner');

-- Create profiles table to store user data
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'client',
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create addresses table
CREATE TABLE addresses (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    line1 TEXT NOT NULL,
    line2 TEXT,
    city TEXT NOT NULL,
    pincode TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_addresses_user_id ON addresses(user_id);

-- Create subscriptions table
CREATE TABLE subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'canceled')),
    plan_name TEXT NOT NULL DEFAULT 'Monthly',
    price_in_inr INT NOT NULL DEFAULT 4000,
    meals_per_day INT NOT NULL DEFAULT 1,
    start_date DATE NOT NULL,
    end_date DATE,
    next_billing_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);

-- Create pauses table
CREATE TABLE pauses (
    id BIGSERIAL PRIMARY KEY,
    subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT five_day_limit CHECK (end_date - start_date <= 5)
);
CREATE INDEX idx_pauses_subscription_id_dates ON pauses(subscription_id, start_date, end_date);

-- Create recipes table
CREATE TABLE recipes (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    photo_url TEXT,
    description TEXT,
    instructions_md TEXT,
    allergens TEXT[],
    kcal INT,
    protein_g INT,
    carbs_g INT,
    fats_g INT,
    yield_servings INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ingredients table
CREATE TABLE ingredients (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    unit TEXT
);

-- Create recipe_ingredients join table
CREATE TABLE recipe_ingredients (
    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity NUMERIC(10, 2) NOT NULL,
    unit TEXT,
    PRIMARY KEY (recipe_id, ingredient_id)
);

-- Create menu_templates table
CREATE TABLE menu_templates (
    id BIGSERIAL PRIMARY KEY,
    week_no INT NOT NULL CHECK (week_no IN (1, 2)),
    dow INT NOT NULL CHECK (dow BETWEEN 1 AND 6), -- Monday=1, Saturday=6
    meal_slot meal_slot NOT NULL DEFAULT 'lunch',
    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    UNIQUE (week_no, dow, meal_slot)
);
CREATE INDEX idx_menu_templates_week_dow ON menu_templates(week_no, dow);

-- Create menu_instances table (materialized daily)
CREATE TABLE menu_instances (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    week_no INT NOT NULL,
    meal_slot meal_slot NOT NULL DEFAULT 'lunch',
    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE
);

-- Create deliveries table
CREATE TABLE deliveries (
    id BIGSERIAL PRIMARY KEY,
    subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    meal_slot meal_slot NOT NULL DEFAULT 'lunch',
    status delivery_status NOT NULL DEFAULT 'scheduled',
    driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    delivered_at TIMESTAMPTZ,
    notes TEXT
);
CREATE INDEX idx_deliveries_sub_date ON deliveries(subscription_id, date);
CREATE INDEX idx_deliveries_driver_date ON deliveries(driver_id, date);

-- Create driver_locations table
CREATE TABLE driver_locations (
    id BIGSERIAL PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_driver_locations_driver_id ON driver_locations(driver_id);

-- Create routes table
CREATE TABLE routes (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    stops JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_routes_driver_date ON routes(driver_id, date);

-- Create macro_facts table
CREATE TABLE macro_facts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    kcal INT NOT NULL DEFAULT 0,
    protein_g INT NOT NULL DEFAULT 0,
    carbs_g INT NOT NULL DEFAULT 0,
    fats_g INT NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'system',
    UNIQUE(user_id, date)
);
CREATE INDEX idx_macro_facts_user_date ON macro_facts(user_id, date);

-- Enable RLS for all relevant tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE macro_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles: Users can see and update their own profile. Admins can see all.
CREATE POLICY "Allow users to view and manage their own profile" ON profiles
    FOR ALL USING (auth.uid() = id);
CREATE POLICY "Allow admins to view all profiles" ON profiles
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Addresses: Users can manage their own addresses. Admins can see all.
CREATE POLICY "Allow users to manage their own addresses" ON addresses
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Allow admins to view all addresses" ON addresses
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Subscriptions: Clients see their own. Admins see all.
CREATE POLICY "Allow clients to view their own subscriptions" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow admins to manage all subscriptions" ON subscriptions
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Pauses: Clients see their own. Admins see all.
CREATE POLICY "Allow clients to manage their own pauses" ON pauses
    FOR ALL USING (EXISTS (SELECT 1 FROM subscriptions WHERE id = subscription_id AND user_id = auth.uid()));
CREATE POLICY "Allow admins to manage all pauses" ON pauses
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Deliveries: Clients see their own. Drivers see their assigned ones. Admins see all.
CREATE POLICY "Allow clients to view their own deliveries" ON deliveries
    FOR SELECT USING (EXISTS (SELECT 1 FROM subscriptions WHERE id = subscription_id AND user_id = auth.uid()));
CREATE POLICY "Allow drivers to see their assigned deliveries" ON deliveries
    FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Allow drivers to update status of their deliveries" ON deliveries
    FOR UPDATE USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Allow admins to manage all deliveries" ON deliveries
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Macro Facts: Clients see their own. Admins see all.
CREATE POLICY "Allow clients to view their own macro facts" ON macro_facts
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow admins to manage all macro facts" ON macro_facts
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Driver Locations: Drivers can update their own location. Admins/Clients can see relevant locations.
CREATE POLICY "Allow drivers to manage their own location" ON driver_locations
    FOR ALL USING (auth.uid() = driver_id);
CREATE POLICY "Allow admins to view all driver locations" ON driver_locations
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
-- Note: A specific policy or view will be needed for clients to see their assigned driver's location.

-- Routes: Drivers can see their own route. Admins can manage all routes.
CREATE POLICY "Allow drivers to see their own routes" ON routes
    FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Allow admins to manage all routes" ON routes
    FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Read-only access for authenticated users to recipe/menu data
CREATE POLICY "Allow authenticated users to view recipes and menus" ON recipes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to view menu templates" ON menu_templates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to view menu instances" ON menu_instances FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to view ingredients" ON ingredients FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to view recipe ingredients" ON recipe_ingredients FOR SELECT USING (auth.role() = 'authenticated');

-- Admin/Chef write access to menu data
CREATE POLICY "Allow admin/chef to manage recipes" ON recipes FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'chef')));
CREATE POLICY "Allow admin/chef to manage menu templates" ON menu_templates FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'chef')));
CREATE POLICY "Allow admin/chef to manage ingredients" ON ingredients FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'chef')));
CREATE POLICY "Allow admin/chef to manage recipe ingredients" ON recipe_ingredients FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'chef')));
