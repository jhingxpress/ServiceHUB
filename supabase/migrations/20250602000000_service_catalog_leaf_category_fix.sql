-- ============================================================
-- MIGRATION: Service Catalog Leaf-Category Architecture Fix
-- Prevents parent-category service leakage
-- ============================================================

-- ============================================================
-- 0. CREATE missing leaf categories first (idempotent)
-- ============================================================

INSERT INTO public.categories (name, description, parent_id, is_parent, icon, color)
SELECT v.name, v.description, p.id, false, v.icon, v.color
FROM (
  VALUES
    ('Post Construction Cleaning', 'Post-build debris and dust removal cleaning', 'hammer-outline', '#3B82F6'),
    ('Residential Cleaning', 'Regular home cleaning and maintenance', 'home-outline', '#3B82F6'),
    ('Office Cleaning', 'Commercial office and workspace cleaning', 'business-outline', '#3B82F6')
) AS v(name, description, icon, color)
JOIN public.categories p ON p.name = 'HOME SERVICES' AND p.is_parent = true
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 1. GUARD CLAUSES (only pre-existing categories)
-- ============================================================

DO $$
DECLARE
  home_services_id UUID;
BEGIN
  -- Validate parent category exists
  SELECT id INTO home_services_id
  FROM public.categories
  WHERE name = 'HOME SERVICES' AND is_parent = true;

  IF home_services_id IS NULL THEN
    RAISE EXCEPTION 'HOME SERVICES parent category not found. Aborting migration.';
  END IF;

  -- Validate pre-existing leaf categories (seeded by prior migration)
  IF NOT EXISTS (
    SELECT 1 FROM public.categories WHERE name = 'Deep Cleaning' AND is_parent = false
  ) THEN
    RAISE EXCEPTION 'Deep Cleaning leaf category not found. Aborting migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories WHERE name = 'Move-In Cleaning' AND is_parent = false
  ) THEN
    RAISE EXCEPTION 'Move-In Cleaning leaf category not found. Aborting migration.';
  END IF;
END $$;

ALTER TABLE public.service_groups
  ADD COLUMN IF NOT EXISTS leaf_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_groups_leaf_category
  ON public.service_groups(leaf_category_id);

COMMENT ON COLUMN public.service_groups.leaf_category_id IS
  'Precise leaf-category owner of this group. Prevents parent-category leakage in provider catalogs.';

-- 2a. Exact name matches
UPDATE public.service_groups sg
SET leaf_category_id = c.id
FROM public.categories c
WHERE c.is_parent = false
  AND LOWER(TRIM(sg.name)) = LOWER(TRIM(c.name));

-- 2b. HOME SERVICES groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Handyman' AND is_parent = false)
WHERE LOWER(name) IN ('carpentry', 'painting', 'welding')
  AND leaf_category_id IS NULL;

-- HVAC & APPLIANCES groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Aircon Cleaning' AND is_parent = false)
WHERE LOWER(name) IN ('aircon services', 'auto aircon')
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Appliance Repair' AND is_parent = false)
WHERE LOWER(name) IN ('washing machine repair', 'appliance installation')
  AND leaf_category_id IS NULL;

-- AUTOMOTIVE groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Mechanic' AND is_parent = false)
WHERE LOWER(name) IN ('car services', 'truck services', 'auto electrical', 'towing services')
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Motorcycle Repair' AND is_parent = false)
WHERE LOWER(name) = 'motorcycle services'
  AND leaf_category_id IS NULL;

-- CONSTRUCTION groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Roofing' AND is_parent = false)
WHERE LOWER(name) = 'roofing'
  AND leaf_category_id IS NULL;

-- EVENTS & ENTERTAINMENT groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Live Band' AND is_parent = false)
WHERE LOWER(name) = 'band services'
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'DJ' AND is_parent = false)
WHERE LOWER(name) = 'dj services'
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Event Coordinator' AND is_parent = false)
WHERE LOWER(name) IN ('host / emcee', 'event photography', 'videography')
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Sound System Rental' AND is_parent = false)
WHERE LOWER(name) = 'sound & lights'
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Magician' AND is_parent = false)
WHERE LOWER(name) = 'magician'
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Comedian' AND is_parent = false)
WHERE LOWER(name) = 'comedian'
  AND leaf_category_id IS NULL;

-- BEAUTY & WELLNESS groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Hair Stylist' AND is_parent = false)
WHERE LOWER(name) = 'hair services'
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Makeup Artist' AND is_parent = false)
WHERE LOWER(name) = 'makeup services'
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Massage Therapist' AND is_parent = false)
WHERE LOWER(name) = 'massage'
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Nail Technician' AND is_parent = false)
WHERE LOWER(name) = 'nail care'
  AND leaf_category_id IS NULL;

-- TECHNOLOGY & SECURITY groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Networking' AND is_parent = false)
WHERE LOWER(name) = 'network setup'
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Computer Repair' AND is_parent = false)
WHERE LOWER(name) = 'software services'
  AND leaf_category_id IS NULL;

-- BUSINESS SERVICES groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Graphic Design' AND is_parent = false)
WHERE LOWER(name) IN ('printing', 'digital marketing')
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Virtual Assistant' AND is_parent = false)
WHERE LOWER(name) = 'accounting'
  AND leaf_category_id IS NULL;

-- EDUCATION & TRAINING groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Tutor' AND is_parent = false)
WHERE LOWER(name) IN ('academic tutoring', 'skills training')
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Music Teacher' AND is_parent = false)
WHERE LOWER(name) = 'music lessons'
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Language Teacher' AND is_parent = false)
WHERE LOWER(name) = 'language lessons'
  AND leaf_category_id IS NULL;

-- PET SERVICES groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Pet Grooming' AND is_parent = false)
WHERE LOWER(name) = 'grooming'
  AND leaf_category_id IS NULL;

-- HEALTH & HOME CARE groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Caregiver' AND is_parent = false)
WHERE LOWER(name) IN ('elderly care', 'caregiver services')
  AND leaf_category_id IS NULL;

UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Private Nurse' AND is_parent = false)
WHERE LOWER(name) = 'home nursing'
  AND leaf_category_id IS NULL;

-- LOGISTICS & TRANSPORTATION groups
UPDATE public.service_groups
SET leaf_category_id = (SELECT id FROM public.categories WHERE name = 'Delivery Rider' AND is_parent = false)
WHERE LOWER(name) = 'delivery services'
  AND leaf_category_id IS NULL;

-- ============================================================
-- 3. CREATE cleaning service groups + templates
-- ============================================================

WITH inserted_cleaning_groups AS (
  INSERT INTO public.service_groups (category_id, leaf_category_id, name, description, icon, is_active)
  SELECT
    c.parent_id,
    c.id,
    g.name,
    g.description,
    g.icon,
    true
  FROM (
    VALUES
      ('Deep Cleaning', 'Intensive home and office deep cleaning', 'sparkles-outline'),
      ('Move-In Cleaning', 'Pre-move and post-move cleaning services', 'trash-outline'),
      ('Post Construction Cleaning', 'Post-build debris and dust removal cleaning', 'hammer-outline'),
      ('Residential Cleaning', 'Regular home cleaning and maintenance', 'home-outline'),
      ('Office Cleaning', 'Commercial office and workspace cleaning', 'business-outline')
  ) AS g(name, description, icon)
  JOIN public.categories c ON LOWER(TRIM(c.name)) = LOWER(TRIM(g.name)) AND c.is_parent = false
  ON CONFLICT (category_id, name) DO NOTHING
  RETURNING id, name
),
inserted_templates AS (
  INSERT INTO public.service_templates (service_group_id, name, description, icon, is_active)
  SELECT g.id, t.name, t.description, t.icon, true
  FROM (
    VALUES
      ('Deep Cleaning', 'Whole House Deep Cleaning', 'Comprehensive deep cleaning of entire home including floors, walls, and fixtures', 'sparkles-outline'),
      ('Deep Cleaning', 'Kitchen Deep Cleaning', 'Deep scrub of appliances, cabinets, countertops, and floors', 'restaurant-outline'),
      ('Deep Cleaning', 'Bathroom Sanitization', 'Disinfection and deep cleaning of toilets, showers, sinks, and tiles', 'water-outline'),
      ('Deep Cleaning', 'Mattress Cleaning', 'Steam cleaning and sanitization of mattresses and bedding', 'bed-outline'),
      ('Deep Cleaning', 'Upholstery Cleaning', 'Deep cleaning of sofas, chairs, and fabric furnishings', 'shapes-outline'),
      ('Move-In Cleaning', 'Apartment Move-In Cleaning', 'Complete cleaning of apartment before moving in', 'home-outline'),
      ('Move-In Cleaning', 'House Move-In Cleaning', 'Full house cleaning including garage and outdoor areas before occupancy', 'home-outline'),
      ('Move-In Cleaning', 'Pre-Occupancy Cleaning', 'Sanitization and cleaning of previously occupied unit', 'checkmark-circle-outline'),
      ('Post Construction Cleaning', 'Construction Debris Removal', 'Removal of leftover construction materials and debris', 'trash-outline'),
      ('Post Construction Cleaning', 'Dust Removal', 'Comprehensive dusting of all surfaces after construction', 'cloud-outline'),
      ('Post Construction Cleaning', 'Post Renovation Cleaning', 'Deep cleaning after renovation including paint and grout removal', 'hammer-outline'),
      ('Residential Cleaning', 'Weekly House Cleaning', 'Regular weekly cleaning of living spaces, bedrooms, and common areas', 'calendar-outline'),
      ('Residential Cleaning', 'Bi-Weekly House Cleaning', 'Fortnightly cleaning service for busy households', 'calendar-outline'),
      ('Residential Cleaning', 'Monthly Deep Clean', 'Monthly intensive cleaning of all rooms and fixtures', 'sparkles-outline'),
      ('Office Cleaning', 'Daily Office Cleaning', 'Daily cleaning of workstations, common areas, and restrooms', 'business-outline'),
      ('Office Cleaning', 'Weekly Office Deep Clean', 'Weekly thorough cleaning including carpets and windows', 'business-outline'),
      ('Office Cleaning', 'Commercial Sanitization', 'Disinfection of high-touch surfaces and shared equipment', 'shield-outline')
  ) AS t(group_name, name, description, icon)
  JOIN inserted_cleaning_groups g ON LOWER(TRIM(g.name)) = LOWER(TRIM(t.group_name))
  ON CONFLICT (service_group_id, name) DO NOTHING
  RETURNING id
)
SELECT COUNT(*) FROM inserted_templates;

-- ============================================================
-- 4. MAP legacy providers: Cleaning Services → Deep Cleaning
-- ============================================================

DO $$
DECLARE
  deep_cleaning_id UUID;
  old_ids UUID[];
BEGIN
  SELECT id INTO deep_cleaning_id
  FROM public.categories
  WHERE name = 'Deep Cleaning' AND is_parent = false;

  IF deep_cleaning_id IS NULL THEN
    RAISE EXCEPTION 'Deep Cleaning leaf category not found';
  END IF;

  -- Collect all legacy cleaning category IDs
  SELECT ARRAY_AGG(id) INTO old_ids
  FROM public.categories
  WHERE LOWER(name) = ANY(ARRAY[
    'cleaning services',
    'house cleaning',
    'general cleaning',
    'cleaning'
  ])
    AND is_parent = false
    AND id != deep_cleaning_id;

  IF old_ids IS NOT NULL AND array_length(old_ids, 1) > 0 THEN
    -- Update providers table
    UPDATE public.providers
    SET category_id = deep_cleaning_id
    WHERE category_id = ANY(old_ids);

    -- Update provider_categories junction (safe UPDATE instead of DELETE/INSERT)
    UPDATE public.provider_categories
    SET category_id = deep_cleaning_id
    WHERE category_id = ANY(old_ids);
  END IF;
END $$;

-- ============================================================
-- 5. VERIFY
-- ============================================================

DO $$
DECLARE
  null_count INT;
  cleaning_group_count INT;
  cleaning_template_count INT;
  expected_groups INT := 5;
  expected_templates INT := 17;
BEGIN
  -- Verify no service_groups have NULL leaf_category_id
  SELECT COUNT(*) INTO null_count
  FROM public.service_groups
  WHERE leaf_category_id IS NULL;

  IF null_count > 0 THEN
    RAISE WARNING 'service_groups leaf_category_id backfill: % groups still NULL', null_count;
  ELSE
    RAISE NOTICE 'service_groups leaf_category_id backfill: COMPLETE (0 NULL)';
  END IF;

  -- Verify cleaning service groups were created
  SELECT COUNT(*) INTO cleaning_group_count
  FROM public.service_groups sg
  JOIN public.categories c ON c.id = sg.leaf_category_id
  WHERE c.name IN ('Deep Cleaning','Move-In Cleaning','Post Construction Cleaning','Residential Cleaning','Office Cleaning');

  IF cleaning_group_count < expected_groups THEN
    RAISE WARNING 'Cleaning service groups: % found, % expected', cleaning_group_count, expected_groups;
  ELSE
    RAISE NOTICE 'Cleaning service groups: % found (expected %)', cleaning_group_count, expected_groups;
  END IF;

  -- Verify cleaning templates were created
  SELECT COUNT(*) INTO cleaning_template_count
  FROM public.service_templates st
  JOIN public.service_groups sg ON sg.id = st.service_group_id
  JOIN public.categories c ON c.id = sg.leaf_category_id
  WHERE c.name IN ('Deep Cleaning','Move-In Cleaning','Post Construction Cleaning','Residential Cleaning','Office Cleaning');

  IF cleaning_template_count < expected_templates THEN
    RAISE WARNING 'Cleaning service templates: % found, % expected', cleaning_template_count, expected_templates;
  ELSE
    RAISE NOTICE 'Cleaning service templates: % found (expected %)', cleaning_template_count, expected_templates;
  END IF;
END $$;

-- ============================================================
-- 6. ROLLBACK SECTION
-- ============================================================
-- To rollback this migration, run the following in order:
--
--   1. Revert provider category mappings (requires manual backup
--      of providers.category_id and provider_categories from before
--      this migration, OR restore from database snapshot).
--
--   2. Remove new cleaning groups (cascades to templates):
--      DELETE FROM public.service_groups
--      WHERE name IN (
--        'Deep Cleaning','Move-In Cleaning','Post Construction Cleaning',
--        'Residential Cleaning','Office Cleaning'
--      );
--
--   3. Remove leaf categories added by this migration:
--      DELETE FROM public.categories
--      WHERE name IN ('Post Construction Cleaning','Residential Cleaning','Office Cleaning')
--        AND is_parent = false;
--
--   4. Drop the new column:
--      ALTER TABLE public.service_groups
--      DROP COLUMN IF EXISTS leaf_category_id;
--
--   5. Drop the index:
--      DROP INDEX IF EXISTS idx_service_groups_leaf_category;
--
-- NOTE: Pre-migration backup of providers(category_id) and
--       provider_categories tables is strongly recommended.
-- ============================================================
