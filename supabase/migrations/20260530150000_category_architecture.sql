-- ============================================================
-- MIGRATION: Category Hierarchy Architecture (Phase 1)
-- 1. Add parent_id / is_parent to categories
-- 2. Create provider_categories junction table
-- 3. Seed parent groups + manageable leaf set
-- 4. Map existing categories to parents
-- 5. Backfill provider_categories from providers.category_id
-- 6. Indexes + RLS
-- ============================================================

-- ============================================================
-- 1. SCHEMA CHANGES
-- ============================================================

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_parent BOOLEAN DEFAULT false;

-- ============================================================
-- 2. CREATE provider_categories JUNCTION TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_id, category_id)
);

-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_provider_categories_provider ON public.provider_categories(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_categories_category ON public.provider_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories(parent_id);

-- ============================================================
-- 4. SEED PARENT CATEGORY GROUPS
-- ============================================================

INSERT INTO public.categories (name, description, icon, color, is_parent, parent_id)
VALUES
  ('HOME SERVICES',               'Home maintenance, repairs, and improvements',                    'home-outline',           '#3B82F6',  true,  NULL),
  ('HVAC & APPLIANCES',             'Air conditioning, heating, and appliance services',              'thermometer-outline',    '#0EA5E9',  true,  NULL),
  ('AUTOMOTIVE',                    'Vehicle repair, maintenance, and roadside services',             'car-outline',            '#6366F1',  true,  NULL),
  ('CONSTRUCTION & RENOVATION',     'Building, renovation, and structural services',                  'business-outline',       '#F59E0B',  true,  NULL),
  ('EVENTS & ENTERTAINMENT',        'Event equipment rentals and entertainment services',               'musical-notes-outline',  '#EC4899',  true,  NULL),
  ('BEAUTY & WELLNESS',             'Personal grooming, spa, and wellness services',                    'sparkles-outline',       '#8B5CF6',  true,  NULL),
  ('TECHNOLOGY & SECURITY',         'IT, electronics, and security system services',                    'desktop-outline',        '#10B981',  true,  NULL),
  ('LOGISTICS & TRANSPORTATION',    'Delivery, moving, and transportation services',                    'cube-outline',           '#06B6D4',  true,  NULL),
  ('BUSINESS SERVICES',             'Professional and creative business services',                    'briefcase-outline',      '#F97316',  true,  NULL),
  ('EDUCATION & TRAINING',          'Tutoring, coaching, and skill development',                      'school-outline',         '#059669',  true,  NULL),
  ('PET SERVICES',                  'Pet care, grooming, and veterinary home visits',                   'paw-outline',            '#EF4444',  true,  NULL),
  ('HEALTH & HOME CARE',          'Medical and elderly care home services',                           'heart-outline',          '#DC2626',  true,  NULL)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 5. MAP EXISTING CATEGORIES TO PARENT GROUPS
-- ============================================================

-- Set all existing rows as non-parent leaves
UPDATE public.categories SET is_parent = false WHERE is_parent = true AND parent_id IS NULL;

-- Map existing categories to their parent groups
UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE name = 'HOME SERVICES')
WHERE name IN ('Plumbing Services','Cleaning Services','Carpentry','Painting Services','Landscaping','Construction','Welding Services');

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE name = 'HVAC & APPLIANCES')
WHERE name IN ('Aircon Services','Electrical Services','LPG Delivery','Water Delivery');

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE name = 'AUTOMOTIVE')
WHERE name IN ('Mechanic Services','Car Rental Services','Towing Services');

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE name = 'LOGISTICS & TRANSPORTATION')
WHERE name IN ('Rider Services','Courier Services');

-- Any remaining unmapped existing categories default to HOME SERVICES
UPDATE public.categories
SET parent_id = COALESCE(parent_id, (SELECT id FROM public.categories WHERE name = 'HOME SERVICES'))
WHERE parent_id IS NULL AND is_parent = false;

-- ============================================================
-- 6. SEED NEW LEAF CATEGORIES (manageable set ~50)
-- ============================================================

INSERT INTO public.categories (name, description, parent_id, is_parent, icon, color)
SELECT v.name, v.description, p.id, false, v.icon, v.color
FROM (
  VALUES
    -- HOME SERVICES
    ('Deep Cleaning',        'Intensive home and office deep cleaning',                        'sparkles-outline',  '#3B82F6'),
    ('Plumbing',             'Pipe, drainage, water heater and fixture repairs',               'water-outline',     '#3B82F6'),
    ('Electrical',           'Wiring, outlet, lighting installations and repairs',             'flash-outline',     '#3B82F6'),
    ('Handyman',             'General home repairs and small fixes',                           'construct-outline', '#3B82F6'),
    ('Roofing',              'Roof repair, installation, and waterproofing',                   'shield-outline',    '#3B82F6'),
    ('Move-In Cleaning',     'Pre-move and post-move cleaning services',                       'trash-outline',     '#3B82F6'),
    ('Post Construction',      'Post-build debris and dust removal cleaning',                    'hammer-outline',    '#3B82F6'),
    -- HVAC & APPLIANCES
    ('Aircon Cleaning',      'Split-type, window-type AC cleaning and filter service',         'thermometer-outline','#0EA5E9'),
    ('Aircon Repair',        'AC compressor, refrigerant, and cooling repair',                   'construct-outline', '#0EA5E9'),
    ('Aircon Installation',  'New AC unit installation and ductwork',                          'business-outline',  '#0EA5E9'),
    ('Refrigerator Repair',  'Fridge and freezer repair and maintenance',                      'cube-outline',      '#0EA5E9'),
    ('Appliance Repair',     'Washing machine, oven, microwave, and other appliances',           'settings-outline',  '#0EA5E9'),
    -- AUTOMOTIVE
    ('Mechanic',             'Vehicle engine, transmission, and diagnostics',                  'car-outline',       '#6366F1'),
    ('Car Wash',             'Exterior and interior car cleaning and detailing',               'water-outline',     '#6366F1'),
    ('Tire Service',         'Tire change, balancing, alignment, and repair',                'disc-outline',      '#6366F1'),
    ('Battery Service',      'Car and motorcycle battery replacement and testing',             'battery-full-outline','#6366F1'),
    ('Motorcycle Repair',    'Motorcycle engine, electrical, and brake service',               'bicycle-outline',   '#6366F1'),
    -- CONSTRUCTION & RENOVATION
    ('Renovation',           'Home and office renovation and remodeling',                      'business-outline',  '#F59E0B'),
    ('Masonry',              'Concrete, brickwork, and plastering services',                   'hammer-outline',    '#F59E0B'),
    ('Tile Installation',    'Floor and wall tile setting and grouting',                       'grid-outline',      '#F59E0B'),
    ('Glass & Aluminum',     'Glass cutting, aluminum framing, and window installation',       'square-outline',    '#F59E0B'),
    ('Structural Works',     'Foundation, beams, columns, and structural repairs',             'barbell-outline',   '#F59E0B'),
    -- EVENTS & ENTERTAINMENT
    ('Sound System Rental',  'PA systems, speakers, and microphones for events',               'volume-high-outline','#EC4899'),
    ('Live Band',            'Live musical performances for events and parties',               'musical-notes-outline','#EC4899'),
    ('Event Coordinator',    'Full-service event planning and day-of coordination',            'calendar-outline',  '#EC4899'),
    ('DJ',                   'DJ services, mixing, and event music curation',                    'disc-outline',      '#EC4899'),
    -- BEAUTY & WELLNESS
    ('Hair Stylist',         'Hair cutting, coloring, and styling services',                   'cut-outline',       '#8B5CF6'),
    ('Barber',               'Men’s grooming, shaving, and haircuts',                          'man-outline',       '#8B5CF6'),
    ('Makeup Artist',        'Event, bridal, and photoshoot makeup',                             'color-palette-outline','#8B5CF6'),
    ('Massage Therapist',    'Therapeutic and relaxation massage services',                    'heart-outline',     '#8B5CF6'),
    ('Nail Technician',      'Manicure, pedicure, and nail art services',                      'hand-left-outline', '#8B5CF6'),
    -- TECHNOLOGY & SECURITY
    ('Computer Repair',      'Desktop computer hardware and software repair',                  'desktop-outline',   '#10B981'),
    ('Laptop Repair',        'Laptop screen, keyboard, and motherboard repair',                  'laptop-outline',    '#10B981'),
    ('CCTV Installation',    'Security camera setup and network configuration',                'eye-outline',       '#10B981'),
    ('Networking',           'WiFi, LAN, router setup, and network troubleshooting',           'wifi-outline',      '#10B981'),
    -- LOGISTICS & TRANSPORTATION
    ('Delivery Rider',       'Food, parcel, and document delivery services',                   'bicycle-outline',   '#06B6D4'),
    ('Moving Services',      'Home and office moving with packing and transport',              'car-outline',       '#06B6D4'),
    ('Truck Rental',         'Lorry, pickup, and cargo truck rental services',                 'cube-outline',      '#06B6D4'),
    ('Driver Services',      'Personal and event chauffeur and driver hire',                   'people-outline',    '#06B6D4'),
    -- BUSINESS SERVICES
    ('Graphic Design',       'Logo, branding, social media, and print design',                 'image-outline',     '#F97316'),
    ('Photography',          'Event, portrait, product, and real estate photography',          'camera-outline',    '#F97316'),
    ('Video Editing',        'Commercial, social media, and event video editing',              'film-outline',      '#F97316'),
    ('Virtual Assistant',    'Admin support, data entry, and customer service remote work',      'headset-outline',   '#F97316'),
    -- EDUCATION & TRAINING
    ('Tutor',                'One-on-one and group academic tutoring',                         'book-outline',      '#059669'),
    ('Music Teacher',        'Guitar, piano, voice, and instrument lessons',                   'musical-notes-outline','#059669'),
    ('Language Teacher',     'English, Filipino, and foreign language instruction',            'chatbubble-outline','#059669'),
    -- PET SERVICES
    ('Pet Grooming',         'Dog and cat bathing, haircut, and nail trimming',                'paw-outline',       '#EF4444'),
    ('Pet Sitting',          'In-home pet sitting and overnight care',                         'home-outline',      '#EF4444'),
    ('Veterinary Home Visit','At-home pet health checkups and minor treatments',               'medical-outline',   '#EF4444'),
    -- HEALTH & HOME CARE
    ('Private Nurse',        'In-home nursing care and medication administration',             'heart-outline',     '#DC2626'),
    ('Caregiver',            'Elderly and patient daily care assistance',                        'people-outline',    '#DC2626'),
    ('Physical Therapist',   'Home-based physiotherapy and rehabilitation',                    'walk-outline',      '#DC2626')
) AS v(name, description, icon, color)
JOIN public.categories p ON
  (v.name IN ('Deep Cleaning','Plumbing','Electrical','Handyman','Roofing','Move-In Cleaning','Post Construction') AND p.name = 'HOME SERVICES') OR
  (v.name IN ('Aircon Cleaning','Aircon Repair','Aircon Installation','Refrigerator Repair','Appliance Repair') AND p.name = 'HVAC & APPLIANCES') OR
  (v.name IN ('Mechanic','Car Wash','Tire Service','Battery Service','Motorcycle Repair') AND p.name = 'AUTOMOTIVE') OR
  (v.name IN ('Renovation','Masonry','Tile Installation','Glass & Aluminum','Structural Works') AND p.name = 'CONSTRUCTION & RENOVATION') OR
  (v.name IN ('Sound System Rental','Live Band','Event Coordinator','DJ') AND p.name = 'EVENTS & ENTERTAINMENT') OR
  (v.name IN ('Hair Stylist','Barber','Makeup Artist','Massage Therapist','Nail Technician') AND p.name = 'BEAUTY & WELLNESS') OR
  (v.name IN ('Computer Repair','Laptop Repair','CCTV Installation','Networking') AND p.name = 'TECHNOLOGY & SECURITY') OR
  (v.name IN ('Delivery Rider','Moving Services','Truck Rental','Driver Services') AND p.name = 'LOGISTICS & TRANSPORTATION') OR
  (v.name IN ('Graphic Design','Photography','Video Editing','Virtual Assistant') AND p.name = 'BUSINESS SERVICES') OR
  (v.name IN ('Tutor','Music Teacher','Language Teacher') AND p.name = 'EDUCATION & TRAINING') OR
  (v.name IN ('Pet Grooming','Pet Sitting','Veterinary Home Visit') AND p.name = 'PET SERVICES') OR
  (v.name IN ('Private Nurse','Caregiver','Physical Therapist') AND p.name = 'HEALTH & HOME CARE')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 7. BACKFILL provider_categories from providers.category_id
-- ============================================================

INSERT INTO public.provider_categories (provider_id, category_id, is_primary)
SELECT id, category_id, true
FROM public.providers
WHERE category_id IS NOT NULL
ON CONFLICT (provider_id, category_id) DO NOTHING;

-- ============================================================
-- 8. RLS POLICIES for provider_categories
-- ============================================================

ALTER TABLE public.provider_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_categories_select ON public.provider_categories;
CREATE POLICY provider_categories_select
  ON public.provider_categories FOR SELECT
  TO authenticated
  USING (
    provider_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.providers
      WHERE id = public.provider_categories.provider_id AND status = 'approved'
    )
  );

DROP POLICY IF EXISTS provider_categories_provider_modify ON public.provider_categories;
CREATE POLICY provider_categories_provider_modify
  ON public.provider_categories FOR ALL
  TO authenticated
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS provider_categories_admin_all ON public.provider_categories;
CREATE POLICY provider_categories_admin_all
  ON public.provider_categories FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- 9. REFRESH ALL CHECKLISTS (ensure no stale data)
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.providers LOOP
    PERFORM public.refresh_provider_checklist(r.id);
  END LOOP;
END $$;
