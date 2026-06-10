-- ============================================================
-- MIGRATION: Fix Service Catalog & Provider Category Mappings
-- Date: 2026-06-05
--
-- Root cause: service_groups empty, leaf_category_id NULL,
--             or provider_categories uses old/parent category IDs.
--
-- 1. Report current state
-- 2. Fix legacy provider category mappings
-- 3. Seed service_groups if empty (with desired groups)
-- 4. Seed service_templates if empty
-- 5. Backfill leaf_category_id
-- 6. Verify
-- ============================================================

-- ============================================================
-- 1. DIAGNOSTIC: Report current counts
-- ============================================================

DO $$
DECLARE
  cat_count INT;
  pc_count INT;
  sg_count INT;
  st_count INT;
  sg_null INT;
BEGIN
  SELECT COUNT(*) INTO cat_count FROM public.categories;
  SELECT COUNT(*) INTO pc_count FROM public.provider_categories;
  SELECT COUNT(*) INTO sg_count FROM public.service_groups;
  SELECT COUNT(*) INTO st_count FROM public.service_templates;
  SELECT COUNT(*) INTO sg_null FROM public.service_groups WHERE leaf_category_id IS NULL;

  RAISE NOTICE '--- SERVICE CATALOG AUDIT ---';
  RAISE NOTICE 'categories:          %', cat_count;
  RAISE NOTICE 'provider_categories: %', pc_count;
  RAISE NOTICE 'service_groups:      %', sg_count;
  RAISE NOTICE 'service_templates:   %', st_count;
  RAISE NOTICE 'service_groups with NULL leaf_category_id: %', sg_null;
END $$;

-- ============================================================
-- 2. FIX: Map legacy provider categories to new leaf categories
-- ============================================================

-- Providers who have old flat categories (e.g. 'Plumbing Services')
-- need their provider_categories updated to point to the new leaf.

DO $$
DECLARE
  mapping RECORD;
BEGIN
  FOR mapping IN
    SELECT
      old.id AS old_cat_id,
      new.id AS new_cat_id
    FROM public.categories old
    JOIN public.categories new ON new.is_parent = false
    WHERE old.is_parent = false
      AND old.parent_id IS NOT NULL
      AND (
        (old.name = 'Plumbing Services'      AND new.name = 'Plumbing') OR
        (old.name = 'Electrical Services'     AND new.name = 'Electrical') OR
        (old.name = 'Mechanic Services'       AND new.name = 'Mechanic') OR
        (old.name = 'Cleaning Services'       AND new.name = 'Deep Cleaning') OR
        (old.name = 'Aircon Services'        AND new.name = 'Aircon Cleaning') OR
        (old.name = 'Carpentry'               AND new.name = 'Handyman') OR
        (old.name = 'Painting Services'       AND new.name = 'Handyman') OR
        (old.name = 'Welding Services'        AND new.name = 'Handyman') OR
        (old.name = 'Construction'            AND new.name = 'Renovation') OR
        (old.name = 'Landscaping'             AND new.name = 'Renovation') OR
        (old.name = 'Rider Services'          AND new.name = 'Delivery Rider') OR
        (old.name = 'Courier Services'        AND new.name = 'Delivery Rider') OR
        (old.name = 'Car Rental Services'     AND new.name = 'Car Wash') OR
        (old.name = 'Towing Services'         AND new.name = 'Mechanic') OR
        (old.name = 'LPG Delivery'            AND new.name = 'Appliance Repair') OR
        (old.name = 'Water Delivery'          AND new.name = 'Appliance Repair')
      )
  LOOP
    -- Update provider_categories to new leaf category
    UPDATE public.provider_categories
    SET category_id = mapping.new_cat_id
    WHERE category_id = mapping.old_cat_id;

    -- Update providers.category_id if still using old
    UPDATE public.providers
    SET category_id = mapping.new_cat_id
    WHERE category_id = mapping.old_cat_id;
  END LOOP;
END $$;

-- ============================================================
-- 2a. BACKFILL provider_categories from providers.category_id
--     for providers who never got junction rows inserted.
-- ============================================================

INSERT INTO public.provider_categories (provider_id, category_id, is_primary)
SELECT p.id, p.category_id, true
FROM public.providers p
LEFT JOIN public.provider_categories pc ON pc.provider_id = p.id
WHERE p.category_id IS NOT NULL
  AND pc.id IS NULL
ON CONFLICT (provider_id, category_id) DO NOTHING;

-- ============================================================
-- 2b. CREATE missing leaf categories required for desired groups
-- ============================================================

INSERT INTO public.categories (name, description, parent_id, is_parent, icon, color)
SELECT v.name, v.description, p.id, false, v.icon, v.color
FROM (
  VALUES
    ('House Cleaning', 'Regular home cleaning and maintenance', 'home-outline', '#3B82F6'),
    ('Pest Control', 'Pest extermination and prevention services', 'bug-outline', '#3B82F6'),
    ('Furniture Assembly', 'Flat-pack and custom furniture assembly', 'cube-outline', '#3B82F6'),
    ('Car Wash', 'Exterior and interior car cleaning and detailing', 'water-outline', '#6366F1'),
    ('Auto Detailing', 'Full car detailing and interior cleaning', 'sparkles-outline', '#6366F1'),
    ('Oil Change', 'Oil change, filter, and fluid top-up', 'water-outline', '#6366F1'),
    ('Spa Services', 'Full spa and wellness treatments', 'heart-outline', '#8B5CF6'),
    ('Business Registration', 'Company registration and business setup', 'document-outline', '#F97316'),
    ('Payroll Processing', 'Employee payroll and salary disbursement', 'calculator-outline', '#F97316'),
    ('Event Hosting', 'Event hosting and emcee services', 'mic-outline', '#EC4899'),
    ('Babysitting', 'In-home child care and babysitting', 'happy-outline', '#DC2626'),
    ('Home Healthcare', 'In-home medical care and health services', 'medical-outline', '#DC2626'),
    ('Freight Transport', 'Freight and cargo transport services', 'cube-outline', '#06B6D4'),
    ('Dog Walking', 'Daily dog walking and exercise services', 'paw-outline', '#EF4444'),
    ('Interior Design', 'Home and office interior design services', 'color-palette-outline', '#F59E0B'),
    ('HVAC Maintenance', 'Regular HVAC system maintenance and servicing', 'thermometer-outline', '#0EA5E9')
) AS v(name, description, icon, color)
JOIN public.categories p ON
  (v.name IN ('House Cleaning','Pest Control','Furniture Assembly') AND p.name = 'HOME SERVICES') OR
  (v.name IN ('Car Wash','Auto Detailing','Oil Change') AND p.name = 'AUTOMOTIVE') OR
  (v.name = 'Spa Services' AND p.name = 'BEAUTY & WELLNESS') OR
  (v.name IN ('Business Registration','Payroll Processing') AND p.name = 'BUSINESS SERVICES') OR
  (v.name = 'Event Hosting' AND p.name = 'EVENTS & ENTERTAINMENT') OR
  (v.name IN ('Babysitting','Home Healthcare') AND p.name = 'HEALTH & HOME CARE') OR
  (v.name = 'Freight Transport' AND p.name = 'LOGISTICS & TRANSPORTATION') OR
  (v.name = 'Dog Walking' AND p.name = 'PET SERVICES') OR
  (v.name = 'Interior Design' AND p.name = 'CONSTRUCTION & RENOVATION') OR
  (v.name = 'HVAC Maintenance' AND p.name = 'HVAC & APPLIANCES')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 3. SEED: Service Groups (idempotent, only inserts missing)
-- ============================================================

WITH parent_cats AS (
  SELECT id, name FROM public.categories WHERE is_parent = true
),
leaf_cats AS (
  SELECT id, name, parent_id FROM public.categories WHERE is_parent = false
),
-- Upsert service_groups (parent = category_id, leaf = leaf_category_id)
inserted_groups AS (
  INSERT INTO public.service_groups (category_id, leaf_category_id, name, description, icon, is_active)
  SELECT
    p.id,
    l.id,
    g.name,
    g.description,
    g.icon,
    true
  FROM (
    -- HOME SERVICES groups
    VALUES
      ('Plumbing', 'Pipe, drainage, water heater and fixture repairs', 'water-outline'),
      ('Electrical', 'Wiring, outlet, lighting installations and repairs', 'flash-outline'),
      ('Deep Cleaning', 'Intensive home and office deep cleaning', 'sparkles-outline'),
      ('Handyman', 'General home repairs and small fixes', 'construct-outline'),
      ('House Cleaning', 'Regular home cleaning and maintenance', 'home-outline'),
      ('Pest Control', 'Pest extermination and prevention services', 'bug-outline'),
      ('Furniture Assembly', 'Flat-pack and custom furniture assembly', 'cube-outline'),
      ('Carpentry', 'Woodwork, furniture, and fixture installation', 'hammer-outline'),
      ('Painting', 'Interior and exterior painting services', 'color-palette-outline'),
      ('Roofing', 'Roof repair, installation, and waterproofing', 'shield-outline'),
      ('Move-In Cleaning', 'Pre-move and post-move cleaning services', 'trash-outline'),
      ('Post Construction', 'Post-build debris and dust removal cleaning', 'hammer-outline'),
    -- HVAC & APPLIANCES groups
      ('Aircon Cleaning', 'Split-type, window-type AC cleaning and filter service', 'thermometer-outline'),
      ('Aircon Repair', 'AC compressor, refrigerant, and cooling repair', 'construct-outline'),
      ('Aircon Installation', 'New AC unit installation and ductwork', 'business-outline'),
      ('Refrigerator Repair', 'Fridge and freezer repair and maintenance', 'cube-outline'),
      ('Washing Machine Repair', 'Washer and dryer repair services', 'water-outline'),
      ('Appliance Repair', 'Washing machine, oven, microwave, and other appliances', 'settings-outline'),
    -- AUTOMOTIVE groups
      ('Mechanic', 'Vehicle engine, transmission, and diagnostics', 'car-outline'),
      ('Car Wash', 'Exterior and interior car cleaning and detailing', 'water-outline'),
      ('Auto Detailing', 'Full car detailing and interior cleaning', 'sparkles-outline'),
      ('Oil Change', 'Oil change, filter, and fluid top-up', 'water-outline'),
      ('Battery Service', 'Car and motorcycle battery replacement and testing', 'battery-full-outline'),
      ('Tire Service', 'Tire change, balancing, alignment, and repair', 'disc-outline'),
      ('Engine Diagnostics', 'ECU scan, sensor testing, and fault diagnosis', 'scan-outline'),
      ('Motorcycle Repair', 'Motorcycle engine, electrical, and brake service', 'bicycle-outline'),
    -- BEAUTY & WELLNESS groups
      ('Hair Stylist', 'Hair cutting, coloring, and styling services', 'cut-outline'),
      ('Makeup Artist', 'Event, bridal, and photoshoot makeup', 'color-palette-outline'),
      ('Massage Therapist', 'Therapeutic and relaxation massage services', 'hand-left-outline'),
      ('Nail Technician', 'Manicure, pedicure, and nail art services', 'hand-left-outline'),
      ('Spa Services', 'Full spa and wellness treatments', 'heart-outline'),
    -- BUSINESS SERVICES groups
      ('Accounting', 'Bookkeeping, tax filing, and financial services', 'calculator-outline'),
      ('Virtual Assistant', 'Admin support, data entry, and remote work', 'headset-outline'),
      ('Graphic Design', 'Logo, branding, social media, and print design', 'image-outline'),
      ('Photography', 'Event, portrait, product, and real estate photography', 'camera-outline'),
    -- EVENTS & ENTERTAINMENT groups
      ('Event Coordinator', 'Full-service event planning and day-of coordination', 'calendar-outline'),
      ('DJ', 'DJ services, mixing, and event music curation', 'disc-outline'),
      ('Live Band', 'Live musical performances for events and parties', 'musical-notes-outline'),
      ('Sound System Rental', 'PA systems, speakers, and microphones for events', 'volume-high-outline'),
      ('Photography', 'Event, portrait, and party photography', 'camera-outline'),
      ('Videography', 'Event video coverage and editing', 'videocam-outline'),
    -- HEALTH & HOME CARE groups
      ('Caregiver', 'Elderly and patient daily care assistance', 'people-outline'),
      ('Private Nurse', 'In-home nursing care and medication administration', 'heart-outline'),
      ('Physical Therapist', 'Home-based physiotherapy and rehabilitation', 'walk-outline'),
    -- TECHNOLOGY & SECURITY groups
      ('Computer Repair', 'Desktop computer hardware and software repair', 'desktop-outline'),
      ('Laptop Repair', 'Laptop screen, keyboard, and motherboard repair', 'laptop-outline'),
      ('CCTV Installation', 'Security camera setup and network configuration', 'eye-outline'),
      ('Networking', 'WiFi, LAN, router setup, and network troubleshooting', 'wifi-outline'),
      ('Software Setup', 'Software installation and system configuration', 'code-outline'),
    -- LOGISTICS & TRANSPORTATION groups
      ('Delivery Rider', 'Food, parcel, and document delivery services', 'bicycle-outline'),
      ('Moving Services', 'Home and office moving with packing and transport', 'car-outline'),
      ('Truck Rental', 'Lorry, pickup, and cargo truck rental services', 'cube-outline'),
    -- EDUCATION & TRAINING groups
      ('Tutor', 'One-on-one and group academic tutoring', 'book-outline'),
      ('Music Teacher', 'Guitar, piano, voice, and instrument lessons', 'musical-notes-outline'),
      ('Language Teacher', 'English, Filipino, and foreign language instruction', 'chatbubble-outline'),
    -- PET SERVICES groups
      ('Pet Grooming', 'Dog and cat bathing, haircut, and nail trimming', 'paw-outline'),
      ('Pet Sitting', 'In-home pet sitting and overnight care', 'home-outline'),
      ('Veterinary Home Visit', 'At-home pet health checkups and minor treatments', 'medical-outline'),
    -- CONSTRUCTION & RENOVATION groups
      ('Renovation', 'Home and office renovation and remodeling', 'business-outline'),
      ('Masonry', 'Concrete, brickwork, and plastering services', 'hammer-outline'),
      ('Tile Installation', 'Floor and wall tile setting and grouting', 'grid-outline'),
      ('Glass & Aluminum', 'Glass cutting, aluminum framing, and window installation', 'square-outline')
  ) AS g(name, description, icon)
  JOIN leaf_cats l ON LOWER(TRIM(l.name)) = LOWER(TRIM(g.name))
  JOIN parent_cats p ON p.id = l.parent_id
  ON CONFLICT (category_id, name) DO UPDATE SET
    leaf_category_id = EXCLUDED.leaf_category_id,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    is_active = true
  RETURNING id, name
)
SELECT COUNT(*) FROM inserted_groups;

-- ============================================================
-- 4. SEED: Service Templates (idempotent)
-- ============================================================

WITH group_map AS (
  SELECT id, name FROM public.service_groups
)
INSERT INTO public.service_templates (service_group_id, name, description, icon, is_active)
SELECT g.id, t.name, t.description, t.icon, true
FROM (
  VALUES
    -- HOME SERVICES > Plumbing
    ('Plumbing', 'Leak Repair', 'Pipe, faucet, and fixture leak repair', 'water-outline'),
    ('Plumbing', 'Faucet Installation', 'New faucet and showerhead installation', 'water-outline'),
    ('Plumbing', 'Pipe Repair', 'Burst pipe and corrosion repair', 'water-outline'),
    ('Plumbing', 'Water Tank Installation', 'Overhead and underground tank setup', 'cube-outline'),
    ('Plumbing', 'Drain Cleaning', 'Clogged drain and sewer line cleaning', 'water-outline'),
    -- HOME SERVICES > Electrical
    ('Electrical', 'Wiring Repair', 'Faulty wiring and short circuit repair', 'flash-outline'),
    ('Electrical', 'Outlet Installation', 'New outlet and switch installation', 'flash-outline'),
    ('Electrical', 'Breaker Repair', 'Panel and circuit breaker service', 'flash-outline'),
    ('Electrical', 'Lighting Installation', 'Indoor and outdoor lighting setup', 'bulb-outline'),
    -- HOME SERVICES > Deep Cleaning
    ('Deep Cleaning', 'Whole House Deep Cleaning', 'Comprehensive deep cleaning of entire home', 'sparkles-outline'),
    ('Deep Cleaning', 'Kitchen Deep Cleaning', 'Deep scrub of appliances, cabinets, countertops', 'restaurant-outline'),
    ('Deep Cleaning', 'Bathroom Sanitization', 'Disinfection and deep cleaning of toilets and showers', 'water-outline'),
    ('Deep Cleaning', 'Mattress Cleaning', 'Steam cleaning and sanitization of mattresses', 'bed-outline'),
    ('Deep Cleaning', 'Upholstery Cleaning', 'Deep cleaning of sofas, chairs, and fabric furnishings', 'shapes-outline'),
    -- HOME SERVICES > Handyman
    ('Handyman', 'General Repairs', 'Minor home repairs and fixes', 'construct-outline'),
    ('Handyman', 'Door Repair', 'Hinge, lock, and frame repair', 'key-outline'),
    ('Handyman', 'Furniture Assembly', 'Flat-pack and custom furniture assembly', 'cube-outline'),
    ('Handyman', 'Custom Shelving', 'Built-in and floating shelf installation', 'cube-outline'),
    -- HOME SERVICES > House Cleaning
    ('House Cleaning', 'Weekly House Cleaning', 'Regular weekly cleaning of living spaces', 'calendar-outline'),
    ('House Cleaning', 'Bi-Weekly House Cleaning', 'Fortnightly cleaning service for busy households', 'calendar-outline'),
    ('House Cleaning', 'Monthly Deep Clean', 'Monthly intensive cleaning of all rooms', 'sparkles-outline'),
    -- HOME SERVICES > Pest Control
    ('Pest Control', 'Termite Control', 'Termite inspection and treatment', 'bug-outline'),
    ('Pest Control', 'Rodent Control', 'Rat and mouse extermination', 'bug-outline'),
    ('Pest Control', 'Insect Extermination', 'Cockroach, ant, and mosquito control', 'bug-outline'),
    -- HOME SERVICES > Carpentry
    ('Carpentry', 'Cabinet Installation', 'Custom and ready-made cabinet fitting', 'cube-outline'),
    ('Carpentry', 'Door Repair', 'Hinge, lock, and frame repair', 'key-outline'),
    ('Carpentry', 'Wood Floor Repair', 'Sanding, refinishing, and plank replacement', 'square-outline'),
    -- HOME SERVICES > Painting
    ('Painting', 'Interior Painting', 'Wall, ceiling, and trim painting', 'color-palette-outline'),
    ('Painting', 'Exterior Painting', 'Facade, fence, and gate painting', 'color-palette-outline'),
    ('Painting', 'Wall Repair & Retouch', 'Crack filling, primer, and touch-up', 'construct-outline'),
    -- HVAC & APPLIANCES > Aircon Cleaning
    ('Aircon Cleaning', 'Split-Type Cleaning', 'Deep cleaning of split-type AC units', 'thermometer-outline'),
    ('Aircon Cleaning', 'Window-Type Cleaning', 'Deep cleaning of window-type AC units', 'thermometer-outline'),
    -- HVAC & APPLIANCES > Aircon Repair
    ('Aircon Repair', 'Compressor Repair', 'AC compressor and motor repair', 'construct-outline'),
    ('Aircon Repair', 'Refrigerant Refill', 'Freon top-up and pressure testing', 'water-outline'),
    -- HVAC & APPLIANCES > Aircon Installation
    ('Aircon Installation', 'New Unit Install', 'New AC unit installation and relocation', 'business-outline'),
    ('Aircon Installation', 'Ductwork Setup', 'Air duct installation and modification', 'business-outline'),
    -- HVAC & APPLIANCES > Refrigerator Repair
    ('Refrigerator Repair', 'Compressor Repair', 'Compressor replacement and gas refill', 'construct-outline'),
    ('Refrigerator Repair', 'Thermostat Repair', 'Temperature control and sensor repair', 'thermometer-outline'),
    -- HVAC & APPLIANCES > Washing Machine Repair
    ('Washing Machine Repair', 'Motor Repair', 'Motor and belt replacement', 'construct-outline'),
    ('Washing Machine Repair', 'Drain Repair', 'Drain pump and hose repair', 'water-outline'),
    -- HVAC & APPLIANCES > Appliance Repair
    ('Appliance Repair', 'Microwave Repair', 'Microwave oven repair and maintenance', 'settings-outline'),
    ('Appliance Repair', 'Oven Repair', 'Electric and gas oven repair', 'settings-outline'),
    -- AUTOMOTIVE > Mechanic
    ('Mechanic', 'Car Repair', 'General engine, brake, and suspension repairs', 'construct-outline'),
    ('Mechanic', 'Car Tune Up', 'Spark plugs, filters, and general maintenance', 'settings-outline'),
    ('Mechanic', 'Brake Repair', 'Brake pad replacement and system repair', 'disc-outline'),
    ('Mechanic', 'Engine Diagnostics', 'ECU scan, sensor testing, and fault diagnosis', 'scan-outline'),
    -- AUTOMOTIVE > Car Wash
    ('Car Wash', 'Exterior Wash', 'Full exterior wash and wax', 'water-outline'),
    ('Car Wash', 'Interior Cleaning', 'Vacuum and interior wipe down', 'sparkles-outline'),
    ('Car Wash', 'Full Detailing', 'Complete interior and exterior detailing', 'sparkles-outline'),
    -- AUTOMOTIVE > Oil Change
    ('Oil Change', 'Standard Oil Change', 'Oil change and filter replacement', 'water-outline'),
    ('Oil Change', 'Synthetic Oil Change', 'Premium synthetic oil and filter change', 'water-outline'),
    -- AUTOMOTIVE > Battery Service
    ('Battery Service', 'Battery Replacement', 'Car battery testing and replacement', 'battery-full-outline'),
    ('Battery Service', 'Battery Charging', 'Battery charging and charging system check', 'battery-charging-outline'),
    -- AUTOMOTIVE > Tire Service
    ('Tire Service', 'Tire Replacement', 'Tire change, rotation, and balancing', 'disc-outline'),
    ('Tire Service', 'Tire Repair', 'Puncture patching and tire fixing', 'disc-outline'),
    -- AUTOMOTIVE > Motorcycle Repair
    ('Motorcycle Repair', 'Engine Repair', 'General engine, brake, and electrical repairs', 'construct-outline'),
    ('Motorcycle Repair', 'Tune Up', 'Carburetor tuning and general maintenance', 'settings-outline'),
    ('Motorcycle Repair', 'Tire Replacement', 'Tire change, patching, and balancing', 'disc-outline'),
    -- BEAUTY & WELLNESS > Hair Stylist
    ('Hair Stylist', 'Haircut', 'Men and women haircut and styling', 'cut-outline'),
    ('Hair Stylist', 'Hair Coloring', 'Root touch-up, full color, and highlights', 'color-palette-outline'),
    ('Hair Stylist', 'Hair Treatment', 'Rebond, keratin, and spa treatment', 'heart-outline'),
    -- BEAUTY & WELLNESS > Makeup Artist
    ('Makeup Artist', 'Bridal Makeup', 'Wedding day hair and makeup', 'color-palette-outline'),
    ('Makeup Artist', 'Event Makeup', 'Party, debut, and corporate makeup', 'color-palette-outline'),
    -- BEAUTY & WELLNESS > Massage Therapist
    ('Massage Therapist', 'Swedish Massage', 'Relaxation and stress relief massage', 'hand-left-outline'),
    ('Massage Therapist', 'Deep Tissue Massage', 'Chronic pain and muscle recovery', 'hand-left-outline'),
    ('Massage Therapist', 'Home Service Massage', 'In-home massage therapy', 'hand-left-outline'),
    -- BEAUTY & WELLNESS > Nail Technician
    ('Nail Technician', 'Manicure', 'Hand care, cuticle, and polish', 'hand-left-outline'),
    ('Nail Technician', 'Pedicure', 'Foot care, scrub, and polish', 'hand-left-outline'),
    ('Nail Technician', 'Nail Art', 'Gel, acrylic, and custom nail design', 'color-palette-outline'),
    -- BUSINESS SERVICES > Accounting
    ('Accounting', 'Bookkeeping', 'Daily transaction recording', 'calculator-outline'),
    ('Accounting', 'Tax Filing', 'BIR tax preparation and filing', 'document-outline'),
    -- BUSINESS SERVICES > Virtual Assistant
    ('Virtual Assistant', 'Admin Support', 'Data entry and customer service', 'headset-outline'),
    ('Virtual Assistant', 'Social Media Management', 'Content creation and posting', 'trending-up-outline'),
    -- EVENTS & ENTERTAINMENT > Event Coordinator
    ('Event Coordinator', 'Event Planning', 'Full-service event planning', 'calendar-outline'),
    ('Event Coordinator', 'Day-Of Coordination', 'On-site event management', 'calendar-outline'),
    -- EVENTS & ENTERTAINMENT > DJ
    ('DJ', 'Wedding DJ', 'Wedding reception music and MC coordination', 'disc-outline'),
    ('DJ', 'Party DJ', 'Birthday, debut, and party music', 'disc-outline'),
    -- EVENTS & ENTERTAINMENT > Live Band
    ('Live Band', 'Acoustic Band', 'Intimate acoustic performances', 'musical-notes-outline'),
    ('Live Band', 'Full Band', 'Complete band with instruments and vocals', 'musical-notes-outline'),
    -- EVENTS & ENTERTAINMENT > Photography
    ('Photography', 'Event Photography', 'Event, portrait, and party photography', 'camera-outline'),
    ('Photography', 'Wedding Photography', 'Wedding ceremony and reception', 'camera-outline'),
    -- EVENTS & ENTERTAINMENT > Videography
    ('Videography', 'Event Coverage', 'Same-day and full event video', 'videocam-outline'),
    ('Videography', 'Same-Day Edit', 'On-site editing and highlight reel', 'videocam-outline'),
    -- HEALTH & HOME CARE > Caregiver
    ('Caregiver', 'Elderly Care', 'Senior care and daily living assistance', 'heart-outline'),
    ('Caregiver', 'Post-Operative Care', 'Surgery recovery assistance', 'people-outline'),
    ('Caregiver', 'Disability Care', 'Special needs and mobility support', 'people-outline'),
    -- HEALTH & HOME CARE > Private Nurse
    ('Private Nurse', 'Medication Administration', 'Injection and medication management', 'medical-outline'),
    ('Private Nurse', 'Wound Care', 'Dressing changes and wound monitoring', 'medical-outline'),
    -- HEALTH & HOME CARE > Physical Therapist
    ('Physical Therapist', 'Home Physiotherapy', 'In-home physiotherapy sessions', 'walk-outline'),
    ('Physical Therapist', 'Rehabilitation', 'Post-injury rehabilitation exercises', 'walk-outline'),
    -- TECHNOLOGY & SECURITY > Computer Repair
    ('Computer Repair', 'Hardware Repair', 'Motherboard, GPU, and component repair', 'desktop-outline'),
    ('Computer Repair', 'Software Troubleshooting', 'Virus removal, OS repair, and optimization', 'code-outline'),
    -- TECHNOLOGY & SECURITY > Laptop Repair
    ('Laptop Repair', 'Screen Replacement', 'Laptop screen replacement', 'laptop-outline'),
    ('Laptop Repair', 'Keyboard Replacement', 'Keyboard and trackpad repair', 'laptop-outline'),
    -- TECHNOLOGY & SECURITY > CCTV Installation
    ('CCTV Installation', 'Home CCTV Setup', 'Residential security camera installation', 'eye-outline'),
    ('CCTV Installation', 'Office CCTV Setup', 'Commercial security system installation', 'eye-outline'),
    -- TECHNOLOGY & SECURITY > Networking
    ('Networking', 'Home WiFi Setup', 'Router config, extenders, and mesh network', 'wifi-outline'),
    ('Networking', 'Office Network Setup', 'LAN, switch, and access point installation', 'wifi-outline'),
    -- TECHNOLOGY & SECURITY > Software Setup
    ('Software Setup', 'OS Installation', 'Windows, macOS, and Linux install', 'code-outline'),
    ('Software Setup', 'App Installation', 'Software setup and configuration', 'code-outline'),
    -- LOGISTICS & TRANSPORTATION > Delivery Rider
    ('Delivery Rider', 'Food Delivery', 'Restaurant and home-cooked food delivery', 'bicycle-outline'),
    ('Delivery Rider', 'Parcel Delivery', 'Packages and documents delivery', 'cube-outline'),
    ('Delivery Rider', 'Same-Day Delivery', 'Express same-day parcel service', 'time-outline'),
    -- LOGISTICS & TRANSPORTATION > Moving Services
    ('Moving Services', 'Home Moving', 'Residential relocation with packing', 'car-outline'),
    ('Moving Services', 'Office Moving', 'Commercial relocation with packing', 'car-outline'),
    -- EDUCATION & TRAINING > Tutor
    ('Tutor', 'Math Tutoring', 'Algebra, geometry, and calculus', 'book-outline'),
    ('Tutor', 'Science Tutoring', 'Physics, chemistry, and biology', 'book-outline'),
    ('Tutor', 'English Tutoring', 'Grammar, writing, and conversation', 'book-outline'),
    -- EDUCATION & TRAINING > Music Teacher
    ('Music Teacher', 'Guitar Lessons', 'Acoustic, electric, and bass guitar', 'musical-notes-outline'),
    ('Music Teacher', 'Piano Lessons', 'Classical and pop piano instruction', 'musical-notes-outline'),
    -- EDUCATION & TRAINING > Language Teacher
    ('Language Teacher', 'English Lessons', 'Conversational and business English', 'chatbubble-outline'),
    ('Language Teacher', 'Filipino Lessons', 'Tagalog and Filipino grammar', 'chatbubble-outline'),
    -- PET SERVICES > Pet Grooming
    ('Pet Grooming', 'Dog Grooming', 'Bath, haircut, and nail trim', 'paw-outline'),
    ('Pet Grooming', 'Cat Grooming', 'Bath, brush, and nail trim', 'paw-outline'),
    -- PET SERVICES > Pet Sitting
    ('Pet Sitting', 'Day Sitting', 'Daytime in-home pet care', 'home-outline'),
    ('Pet Sitting', 'Overnight Sitting', '24-hour in-home pet care', 'home-outline'),
    -- PET SERVICES > Veterinary Home Visit
    ('Veterinary Home Visit', 'General Checkup', 'Vaccination and wellness exam', 'medical-outline'),
    ('Veterinary Home Visit', 'Minor Treatment', 'Wound care and medication', 'medical-outline'),
    -- CONSTRUCTION & RENOVATION > Renovation
    ('Renovation', 'Kitchen Renovation', 'Cabinet, counter, and appliance upgrade', 'cube-outline'),
    ('Renovation', 'Bathroom Renovation', 'Fixture, tile, and plumbing upgrade', 'water-outline'),
    ('Renovation', 'Full House Renovation', 'Complete home remodeling', 'business-outline'),
    -- CONSTRUCTION & RENOVATION > Masonry
    ('Masonry', 'Concrete Works', 'Slab, beam, and column concrete pouring', 'business-outline'),
    ('Masonry', 'Bricklaying', 'Wall and partition brick construction', 'grid-outline'),
    -- CONSTRUCTION & RENOVATION > Tile Installation
    ('Tile Installation', 'Floor Tiling', 'Ceramic, porcelain, and vinyl tile', 'grid-outline'),
    ('Tile Installation', 'Wall Tiling', 'Bathroom and kitchen wall tiles', 'grid-outline'),
    -- NEW GROUPS > Furniture Assembly
    ('Furniture Assembly', 'Flat-Pack Assembly', 'IKEA and flat-pack furniture assembly', 'cube-outline'),
    ('Furniture Assembly', 'Custom Furniture Build', 'Built-in and custom furniture construction', 'cube-outline'),
    -- NEW GROUPS > Auto Detailing
    ('Auto Detailing', 'Interior Detailing', 'Deep interior cleaning and conditioning', 'sparkles-outline'),
    ('Auto Detailing', 'Exterior Detailing', 'Paint correction and ceramic coating', 'sparkles-outline'),
    -- NEW GROUPS > Spa Services
    ('Spa Services', 'Body Spa', 'Full body spa and relaxation treatment', 'heart-outline'),
    ('Spa Services', 'Facial Treatment', 'Anti-aging and deep-cleansing facial', 'heart-outline'),
    -- NEW GROUPS > Business Registration
    ('Business Registration', 'Company Registration', 'SEC, DTI, and BIR business registration', 'document-outline'),
    ('Business Registration', 'Business Permit', 'Barangay, mayor, and sanitary permits', 'document-outline'),
    -- NEW GROUPS > Payroll Processing
    ('Payroll Processing', 'Monthly Payroll', 'Salary computation and disbursement', 'calculator-outline'),
    -- NEW GROUPS > Event Hosting
    ('Event Hosting', 'Wedding Host', 'Wedding ceremony and reception hosting', 'mic-outline'),
    ('Event Hosting', 'Corporate Host', 'Company events and conferences hosting', 'mic-outline'),
    -- NEW GROUPS > Babysitting
    ('Babysitting', 'Daytime Babysitting', 'In-home child care during the day', 'happy-outline'),
    ('Babysitting', 'Overnight Babysitting', 'Extended evening and overnight child care', 'happy-outline'),
    -- NEW GROUPS > Home Healthcare
    ('Home Healthcare', 'Home Nursing', 'In-home nursing and medication administration', 'medical-outline'),
    ('Home Healthcare', 'Physical Therapy', 'Home-based physiotherapy and rehabilitation', 'walk-outline'),
    -- NEW GROUPS > Freight Transport
    ('Freight Transport', 'LTL Freight', 'Less-than-truckload freight shipping', 'cube-outline'),
    ('Freight Transport', 'Full Truckload', 'Full truckload cargo transport', 'cube-outline'),
    -- NEW GROUPS > Dog Walking
    ('Dog Walking', 'Daily Dog Walk', '30-minute daily dog walking', 'paw-outline'),
    ('Dog Walking', 'Extended Dog Walk', '60-minute extended dog walking', 'paw-outline'),
    -- NEW GROUPS > Interior Design
    ('Interior Design', 'Home Design', 'Residential interior design consultation', 'color-palette-outline'),
    ('Interior Design', 'Office Design', 'Commercial workspace interior design', 'color-palette-outline'),
    -- NEW GROUPS > HVAC Maintenance
    ('HVAC Maintenance', 'AC Annual Maintenance', 'Yearly AC system check and tune-up', 'thermometer-outline'),
    ('HVAC Maintenance', 'Duct Cleaning', 'Air duct and vent deep cleaning', 'thermometer-outline')
  ) AS t(group_name, name, description, icon)
  JOIN group_map g ON LOWER(TRIM(g.name)) = LOWER(TRIM(t.group_name))
  ON CONFLICT (service_group_id, name) DO NOTHING;

-- ============================================================
-- 5. BACKFILL: Ensure all service_groups have leaf_category_id
-- ============================================================

UPDATE public.service_groups sg
SET leaf_category_id = c.id
FROM public.categories c
WHERE c.is_parent = false
  AND LOWER(TRIM(sg.name)) = LOWER(TRIM(c.name))
  AND sg.leaf_category_id IS NULL;

-- ============================================================
-- 6. VERIFY: Final counts
-- ============================================================

DO $$
DECLARE
  g_count INT;
  t_count INT;
  sg_null INT;
  pc_count INT;
BEGIN
  SELECT COUNT(*) INTO g_count FROM public.service_groups;
  SELECT COUNT(*) INTO t_count FROM public.service_templates;
  SELECT COUNT(*) INTO sg_null FROM public.service_groups WHERE leaf_category_id IS NULL;
  SELECT COUNT(*) INTO pc_count FROM public.provider_categories;

  RAISE NOTICE '--- SERVICE CATALOG FINAL STATE ---';
  RAISE NOTICE 'service_groups:      %', g_count;
  RAISE NOTICE 'service_templates:   %', t_count;
  RAISE NOTICE 'groups with NULL leaf_category_id: %', sg_null;
  RAISE NOTICE 'provider_categories: %', pc_count;
END $$;
