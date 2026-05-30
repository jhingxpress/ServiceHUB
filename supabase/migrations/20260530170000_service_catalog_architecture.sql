-- ============================================================
-- MIGRATION: Universal Service Catalog Architecture (Phase 2)
-- 1. Create service_groups table
-- 2. Create service_templates table
-- 3. RLS policies
-- 4. Seed all marketplace categories, groups, and templates
-- 5. Backward compatible: existing services table unchanged
-- ============================================================

-- ============================================================
-- 1. SCHEMA: service_groups
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, name)
);

COMMENT ON TABLE public.service_groups IS 'Groups of service templates under a category (e.g. Motorcycle Services under Automotive)';

-- ============================================================
-- 2. SCHEMA: service_templates
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_group_id UUID REFERENCES public.service_groups(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service_group_id, name)
);

COMMENT ON TABLE public.service_templates IS 'Individual service templates within a group (e.g. Motorcycle Repair under Motorcycle Services). Providers select these to auto-create entries in the services table.';

-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_service_groups_category ON public.service_groups(category_id);
CREATE INDEX IF NOT EXISTS idx_service_groups_active ON public.service_groups(is_active);
CREATE INDEX IF NOT EXISTS idx_service_templates_group ON public.service_templates(service_group_id);
CREATE INDEX IF NOT EXISTS idx_service_templates_active ON public.service_templates(is_active);

-- ============================================================
-- 4. RLS POLICIES
-- ============================================================

ALTER TABLE public.service_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_templates ENABLE ROW LEVEL SECURITY;

-- service_groups: everyone can read active groups
DROP POLICY IF EXISTS service_groups_select ON public.service_groups;
CREATE POLICY service_groups_select
  ON public.service_groups FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

-- service_groups: only admin can modify
DROP POLICY IF EXISTS service_groups_admin_modify ON public.service_groups;
CREATE POLICY service_groups_admin_modify
  ON public.service_groups FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- service_templates: everyone can read active templates
DROP POLICY IF EXISTS service_templates_select ON public.service_templates;
CREATE POLICY service_templates_select
  ON public.service_templates FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

-- service_templates: only admin can modify
DROP POLICY IF EXISTS service_templates_admin_modify ON public.service_templates;
CREATE POLICY service_templates_admin_modify
  ON public.service_templates FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 5. SEED DATA
-- ============================================================

-- Seed service groups and templates for all major categories.
-- We use a CTE to first create groups, then templates referencing them.

WITH inserted_groups AS (
  INSERT INTO public.service_groups (category_id, name, description, icon, is_active)
  SELECT c.id, g.name, g.description, g.icon, true
  FROM (
    -- AUTOMOTIVE
    VALUES
      ('AUTOMOTIVE', 'Motorcycle Services', 'Repair, maintenance, and cleaning for motorcycles', 'bicycle-outline'),
      ('AUTOMOTIVE', 'Car Services', 'Repair, maintenance, and diagnostics for cars', 'car-outline'),
      ('AUTOMOTIVE', 'Truck Services', 'Heavy vehicle repair and maintenance', 'bus-outline'),
      ('AUTOMOTIVE', 'Auto Electrical', 'Electrical system repairs and installations', 'flash-outline'),
      ('AUTOMOTIVE', 'Auto Aircon', 'Air conditioning repair, cleaning, and recharge', 'thermometer-outline'),
      ('AUTOMOTIVE', 'Towing Services', 'Emergency and scheduled vehicle towing', 'trail-sign-outline'),
    -- HOME SERVICES
      ('HOME SERVICES', 'Plumbing', 'Leak repair, installation, and pipe work', 'water-outline'),
      ('HOME SERVICES', 'Electrical', 'Wiring, outlets, lighting, and breaker repairs', 'flash-outline'),
      ('HOME SERVICES', 'Carpentry', 'Woodwork, furniture, and fixture installation', 'hammer-outline'),
      ('HOME SERVICES', 'Painting', 'Interior and exterior painting services', 'color-palette-outline'),
      ('HOME SERVICES', 'Welding', 'Metal fabrication and repair services', 'barbell-outline'),
    -- HVAC & APPLIANCES
      ('HVAC & APPLIANCES', 'Aircon Services', 'Cleaning, repair, and installation of air conditioners', 'thermometer-outline'),
      ('HVAC & APPLIANCES', 'Refrigerator Repair', 'Fridge and freezer repair and maintenance', 'cube-outline'),
      ('HVAC & APPLIANCES', 'Washing Machine Repair', 'Washer and dryer repair services', 'water-outline'),
      ('HVAC & APPLIANCES', 'Appliance Installation', 'Setup and installation of home appliances', 'construct-outline'),
    -- CONSTRUCTION & RENOVATION
      ('CONSTRUCTION & RENOVATION', 'Masonry', 'Concrete, brickwork, and plastering', 'business-outline'),
      ('CONSTRUCTION & RENOVATION', 'Roofing', 'Roof repair, installation, and waterproofing', 'shield-outline'),
      ('CONSTRUCTION & RENOVATION', 'Tile Installation', 'Floor and wall tile setting and grouting', 'grid-outline'),
      ('CONSTRUCTION & RENOVATION', 'Renovation', 'Home and office renovation and remodeling', 'business-outline'),
    -- EVENTS & ENTERTAINMENT
      ('EVENTS & ENTERTAINMENT', 'Band Services', 'Live musical performances for events', 'musical-notes-outline'),
      ('EVENTS & ENTERTAINMENT', 'DJ Services', 'DJ mixing and event music curation', 'disc-outline'),
      ('EVENTS & ENTERTAINMENT', 'Host / Emcee', 'Event hosting and emcee services', 'mic-outline'),
      ('EVENTS & ENTERTAINMENT', 'Magician', 'Magic shows and entertainment', 'glasses-outline'),
      ('EVENTS & ENTERTAINMENT', 'Comedian', 'Stand-up comedy and event entertainment', 'happy-outline'),
      ('EVENTS & ENTERTAINMENT', 'Sound & Lights', 'PA systems, speakers, and stage lighting', 'volume-high-outline'),
      ('EVENTS & ENTERTAINMENT', 'Event Photography', 'Event, portrait, and party photography', 'camera-outline'),
      ('EVENTS & ENTERTAINMENT', 'Videography', 'Event video coverage and editing', 'videocam-outline'),
    -- BEAUTY & WELLNESS
      ('BEAUTY & WELLNESS', 'Hair Services', 'Haircuts, coloring, and styling', 'cut-outline'),
      ('BEAUTY & WELLNESS', 'Makeup Services', 'Bridal, event, and photoshoot makeup', 'color-palette-outline'),
      ('BEAUTY & WELLNESS', 'Massage', 'Therapeutic and relaxation massage', 'hand-left-outline'),
      ('BEAUTY & WELLNESS', 'Nail Care', 'Manicure, pedicure, and nail art', 'hand-left-outline'),
    -- TECHNOLOGY & SECURITY
      ('TECHNOLOGY & SECURITY', 'CCTV Installation', 'Security camera setup and configuration', 'eye-outline'),
      ('TECHNOLOGY & SECURITY', 'Computer Repair', 'Desktop and laptop hardware/software repair', 'desktop-outline'),
      ('TECHNOLOGY & SECURITY', 'Network Setup', 'WiFi, LAN, router setup and troubleshooting', 'wifi-outline'),
      ('TECHNOLOGY & SECURITY', 'Software Services', 'Software installation, troubleshooting, and support', 'code-outline'),
    -- BUSINESS SERVICES
      ('BUSINESS SERVICES', 'Graphic Design', 'Logo, branding, and print design', 'image-outline'),
      ('BUSINESS SERVICES', 'Printing', 'Digital and offset printing services', 'print-outline'),
      ('BUSINESS SERVICES', 'Digital Marketing', 'Social media, SEO, and online marketing', 'trending-up-outline'),
      ('BUSINESS SERVICES', 'Accounting', 'Bookkeeping, tax filing, and financial services', 'calculator-outline'),
    -- EDUCATION & TRAINING
      ('EDUCATION & TRAINING', 'Academic Tutoring', 'One-on-one and group academic tutoring', 'book-outline'),
      ('EDUCATION & TRAINING', 'Music Lessons', 'Instrument and voice lessons', 'musical-notes-outline'),
      ('EDUCATION & TRAINING', 'Language Lessons', 'English, Filipino, and foreign language instruction', 'chatbubble-outline'),
      ('EDUCATION & TRAINING', 'Skills Training', 'Vocational and technical skill training', 'construct-outline'),
    -- PET SERVICES
      ('PET SERVICES', 'Grooming', 'Dog and cat bathing, haircut, and nail trimming', 'paw-outline'),
      ('PET SERVICES', 'Pet Sitting', 'In-home pet sitting and overnight care', 'home-outline'),
      ('PET SERVICES', 'Veterinary Home Visit', 'At-home pet health checkups and minor treatments', 'medical-outline'),
    -- HEALTH & HOME CARE
      ('HEALTH & HOME CARE', 'Elderly Care', 'Senior care and daily living assistance', 'heart-outline'),
      ('HEALTH & HOME CARE', 'Home Nursing', 'In-home nursing and medication administration', 'medical-outline'),
      ('HEALTH & HOME CARE', 'Caregiver Services', 'Patient and disability care assistance', 'people-outline'),
    -- LOGISTICS & TRANSPORTATION
      ('LOGISTICS & TRANSPORTATION', 'Delivery Services', 'Food, parcel, and document delivery', 'bicycle-outline'),
      ('LOGISTICS & TRANSPORTATION', 'Moving Services', 'Home and office moving with packing', 'car-outline'),
      ('LOGISTICS & TRANSPORTATION', 'Truck Rental', 'Lorry, pickup, and cargo truck rental', 'cube-outline')
  ) AS g(category_name, name, description, icon)
  JOIN public.categories c ON c.name = g.category_name AND c.is_parent = true
  ON CONFLICT (category_id, name) DO NOTHING
  RETURNING id, name
)
INSERT INTO public.service_templates (service_group_id, name, description, icon, is_active)
SELECT g.id, t.name, t.description, t.icon, true
FROM (
  VALUES
    -- AUTOMOTIVE > Motorcycle Services
    ('Motorcycle Services', 'Motorcycle Repair', 'General engine, brake, and electrical repairs for motorcycles', 'construct-outline'),
    ('Motorcycle Services', 'Motorcycle Change Oil', 'Oil change and filter replacement', 'water-outline'),
    ('Motorcycle Services', 'Motorcycle Tune Up', 'Carburetor tuning, spark plug, and general maintenance', 'settings-outline'),
    ('Motorcycle Services', 'Motorcycle Tire Replacement', 'Tire change, patching, and balancing', 'disc-outline'),
    ('Motorcycle Services', 'Motorcycle Battery Replacement', 'Battery testing and replacement', 'battery-full-outline'),
    ('Motorcycle Services', 'Motorcycle Engine Overhaul', 'Full engine rebuild and restoration', 'construct-outline'),
    ('Motorcycle Services', 'Motorcycle Wash', 'Exterior and interior cleaning', 'water-outline'),
    -- AUTOMOTIVE > Car Services
    ('Car Services', 'Car Repair', 'General engine, brake, and suspension repairs', 'construct-outline'),
    ('Car Services', 'Car Change Oil', 'Oil change, filter, and fluid top-up', 'water-outline'),
    ('Car Services', 'Car Tune Up', 'Spark plugs, filters, and general maintenance', 'settings-outline'),
    ('Car Services', 'Car Brake Repair', 'Brake pad replacement and system repair', 'disc-outline'),
    ('Car Services', 'Car Tire Replacement', 'Tire change, rotation, and balancing', 'disc-outline'),
    ('Car Services', 'Car Battery Replacement', 'Battery testing and replacement', 'battery-full-outline'),
    ('Car Services', 'Car Aircon Repair', 'AC compressor, refrigerant, and cooling repair', 'thermometer-outline'),
    ('Car Services', 'Car Engine Diagnostics', 'ECU scan, sensor testing, and fault diagnosis', 'scan-outline'),
    -- AUTOMOTIVE > Truck Services
    ('Truck Services', 'Truck Engine Repair', 'Heavy-duty engine repair and rebuild', 'construct-outline'),
    ('Truck Services', 'Truck Brake Repair', 'Air brake and hydraulic brake service', 'disc-outline'),
    ('Truck Services', 'Truck Tire Replacement', 'Heavy tire change and retreading', 'disc-outline'),
    -- AUTOMOTIVE > Auto Electrical
    ('Auto Electrical', 'Alternator Repair', 'Alternator rebuild and replacement', 'flash-outline'),
    ('Auto Electrical', 'Starter Repair', 'Starter motor rebuild and replacement', 'flash-outline'),
    ('Auto Electrical', 'Wiring Repair', 'Electrical harness and connector repair', 'flash-outline'),
    ('Auto Electrical', 'Battery Installation', 'Battery fitting and charging system check', 'battery-full-outline'),
    -- AUTOMOTIVE > Auto Aircon
    ('Auto Aircon', 'Aircon Cleaning', 'Evaporator, condenser, and filter cleaning', 'thermometer-outline'),
    ('Auto Aircon', 'Aircon Repair', 'Compressor, clutch, and leak repair', 'construct-outline'),
    ('Auto Aircon', 'Refrigerant Recharge', 'Freon refill and pressure testing', 'water-outline'),
    -- AUTOMOTIVE > Towing Services
    ('Towing Services', 'Emergency Towing', '24/7 roadside emergency towing', 'trail-sign-outline'),
    ('Towing Services', 'Long Distance Towing', 'Inter-city and provincial vehicle transport', 'car-outline'),
    -- HOME SERVICES > Plumbing
    ('Plumbing', 'Leak Repair', 'Pipe, faucet, and fixture leak repair', 'water-outline'),
    ('Plumbing', 'Faucet Installation', 'New faucet and showerhead installation', 'water-outline'),
    ('Plumbing', 'Pipe Repair', 'Burst pipe and corrosion repair', 'water-outline'),
    ('Plumbing', 'Water Tank Installation', 'Overhead and underground tank setup', 'cube-outline'),
    -- HOME SERVICES > Electrical
    ('Electrical', 'Wiring Repair', 'Faulty wiring and short circuit repair', 'flash-outline'),
    ('Electrical', 'Outlet Installation', 'New outlet and switch installation', 'flash-outline'),
    ('Electrical', 'Breaker Repair', 'Panel and circuit breaker service', 'flash-outline'),
    -- HOME SERVICES > Carpentry
    ('Carpentry', 'Cabinet Installation', 'Custom and ready-made cabinet fitting', 'cube-outline'),
    ('Carpentry', 'Door Repair', 'Hinge, lock, and frame repair', 'key-outline'),
    ('Carpentry', 'Furniture Assembly', 'Flat-pack and custom furniture assembly', 'construct-outline'),
    ('Carpentry', 'Wood Floor Repair', 'Sanding, refinishing, and plank replacement', 'square-outline'),
    ('Carpentry', 'Custom Shelving', 'Built-in and floating shelf installation', 'cube-outline'),
    -- HOME SERVICES > Painting
    ('Painting', 'Interior Painting', 'Wall, ceiling, and trim painting', 'color-palette-outline'),
    ('Painting', 'Exterior Painting', 'Facade, fence, and gate painting', 'color-palette-outline'),
    ('Painting', 'Wallpaper Installation', 'Wallpaper and wall vinyl application', 'image-outline'),
    ('Painting', 'Wall Repair & Retouch', 'Crack filling, primer, and touch-up', 'construct-outline'),
    -- HOME SERVICES > Welding
    ('Welding', 'Metal Gate Repair', 'Gate, fence, and railing welding', 'barbell-outline'),
    ('Welding', 'Frame Fabrication', 'Custom metal frames and brackets', 'construct-outline'),
    ('Welding', 'Stainless Works', 'Stainless steel cutting and welding', 'barbell-outline'),
    -- HVAC & APPLIANCES > Aircon Services
    ('Aircon Services', 'Aircon Cleaning', 'Split-type and window-type deep cleaning', 'thermometer-outline'),
    ('Aircon Services', 'Aircon Repair', 'Compressor, PCB, and leak repair', 'construct-outline'),
    ('Aircon Services', 'Aircon Installation', 'New unit install and relocation', 'business-outline'),
    ('Aircon Services', 'Refrigerant Refill', 'Freon top-up and pressure testing', 'water-outline'),
    -- HVAC & APPLIANCES > Refrigerator Repair
    ('Refrigerator Repair', 'Compressor Repair', 'Compressor replacement and gas refill', 'construct-outline'),
    ('Refrigerator Repair', 'Thermostat Repair', 'Temperature control and sensor repair', 'thermometer-outline'),
    ('Refrigerator Repair', 'Door Seal Replacement', 'Gasket and hinge replacement', 'disc-outline'),
    -- HVAC & APPLIANCES > Washing Machine Repair
    ('Washing Machine Repair', 'Motor Repair', 'Motor and belt replacement', 'construct-outline'),
    ('Washing Machine Repair', 'Drain Repair', 'Drain pump and hose repair', 'water-outline'),
    ('Washing Machine Repair', 'Control Board Repair', 'PCB and sensor diagnostics', 'settings-outline'),
    -- HVAC & APPLIANCES > Appliance Installation
    ('Appliance Installation', 'TV Mounting', 'Wall bracket and cable management', 'tv-outline'),
    ('Appliance Installation', 'Range Hood Installation', 'Exhaust hood and duct fitting', 'business-outline'),
    -- CONSTRUCTION & RENOVATION > Masonry
    ('Masonry', 'Concrete Works', 'Slab, beam, and column concrete pouring', 'business-outline'),
    ('Masonry', 'Bricklaying', 'Wall and partition brick construction', 'grid-outline'),
    ('Masonry', 'Plastering', 'Smooth finish and skim coating', 'square-outline'),
    -- CONSTRUCTION & RENOVATION > Roofing
    ('Roofing', 'Roof Repair', 'Leak patching and shingle replacement', 'shield-outline'),
    ('Roofing', 'Roof Installation', 'New roof and reroofing', 'shield-outline'),
    ('Roofing', 'Waterproofing', 'Sealant and membrane application', 'water-outline'),
    -- CONSTRUCTION & RENOVATION > Tile Installation
    ('Tile Installation', 'Floor Tiling', 'Ceramic, porcelain, and vinyl tile', 'grid-outline'),
    ('Tile Installation', 'Wall Tiling', 'Bathroom and kitchen wall tiles', 'grid-outline'),
    ('Tile Installation', 'Grouting', 'Tile grout replacement and sealing', 'water-outline'),
    -- CONSTRUCTION & RENOVATION > Renovation
    ('Renovation', 'Kitchen Renovation', 'Cabinet, counter, and appliance upgrade', 'cube-outline'),
    ('Renovation', 'Bathroom Renovation', 'Fixture, tile, and plumbing upgrade', 'water-outline'),
    ('Renovation', 'Full House Renovation', 'Complete home remodeling', 'business-outline'),
    -- EVENTS & ENTERTAINMENT > Band Services
    ('Band Services', 'Acoustic Band', 'Intimate acoustic performances', 'musical-notes-outline'),
    ('Band Services', 'Wedding Band', 'Wedding ceremony and reception music', 'musical-notes-outline'),
    ('Band Services', 'Full Band Performance', 'Complete band with instruments and vocals', 'musical-notes-outline'),
    -- EVENTS & ENTERTAINMENT > DJ Services
    ('DJ Services', 'Wedding DJ', 'Wedding reception music and MC coordination', 'disc-outline'),
    ('DJ Services', 'Party DJ', 'Birthday, debut, and party music', 'disc-outline'),
    ('DJ Services', 'Corporate DJ', 'Company event and conference music', 'disc-outline'),
    -- EVENTS & ENTERTAINMENT > Host / Emcee
    ('Host / Emcee', 'Wedding Host', 'Wedding ceremony and reception hosting', 'mic-outline'),
    ('Host / Emcee', 'Corporate Host', 'Company events and conferences', 'mic-outline'),
    ('Host / Emcee', 'Party Host', 'Birthday, debut, and private parties', 'mic-outline'),
    -- EVENTS & ENTERTAINMENT > Magician
    ('Magician', 'Close-Up Magic', 'Card and coin magic for small groups', 'glasses-outline'),
    ('Magician', 'Stage Magic', 'Large illusion shows for events', 'glasses-outline'),
    ('Magician', 'Kids Party Magic', 'Children birthday party entertainment', 'happy-outline'),
    -- EVENTS & ENTERTAINMENT > Comedian
    ('Comedian', 'Stand-Up Comedy', 'Live stand-up performance', 'happy-outline'),
    ('Comedian', 'Roast Comedy', 'Custom roast and celebration comedy', 'happy-outline'),
    ('Comedian', 'Emcee Comedy', 'Comedic hosting and event entertainment', 'happy-outline'),
    -- EVENTS & ENTERTAINMENT > Sound & Lights
    ('Sound & Lights', 'Basic Sound System', 'PA system and microphones', 'volume-high-outline'),
    ('Sound & Lights', 'Stage Lighting', 'Moving head, par lights, and effects', 'bulb-outline'),
    ('Sound & Lights', 'LED Wall Rental', 'LED screen and video wall rental', 'tv-outline'),
    ('Sound & Lights', 'Full Production', 'Sound, lights, and stage setup', 'volume-high-outline'),
    -- EVENTS & ENTERTAINMENT > Event Photography
    ('Event Photography', 'Birthday Photography', 'Birthday and debut coverage', 'camera-outline'),
    ('Event Photography', 'Wedding Photography', 'Wedding ceremony and reception', 'camera-outline'),
    ('Event Photography', 'Corporate Photography', 'Company events and conferences', 'camera-outline'),
    -- EVENTS & ENTERTAINMENT > Videography
    ('Videography', 'Event Coverage', 'Same-day and full event video', 'videocam-outline'),
    ('Videography', 'Same-Day Edit', 'On-site editing and highlight reel', 'videocam-outline'),
    ('Videography', 'Drone Coverage', 'Aerial video and photography', 'videocam-outline'),
    -- BEAUTY & WELLNESS > Hair Services
    ('Hair Services', 'Haircut', 'Men and women haircut and styling', 'cut-outline'),
    ('Hair Services', 'Hair Coloring', 'Root touch-up, full color, and highlights', 'color-palette-outline'),
    ('Hair Services', 'Hair Treatment', 'Rebond, keratin, and spa treatment', 'heart-outline'),
    -- BEAUTY & WELLNESS > Makeup Services
    ('Makeup Services', 'Bridal Makeup', 'Wedding day hair and makeup', 'color-palette-outline'),
    ('Makeup Services', 'Event Makeup', 'Party, debut, and corporate makeup', 'color-palette-outline'),
    ('Makeup Services', 'Photoshoot Makeup', 'Editorial and creative makeup', 'color-palette-outline'),
    -- BEAUTY & WELLNESS > Massage
    ('Massage', 'Swedish Massage', 'Relaxation and stress relief massage', 'hand-left-outline'),
    ('Massage', 'Deep Tissue Massage', 'Chronic pain and muscle recovery', 'hand-left-outline'),
    ('Massage', 'Home Service Massage', 'In-home massage therapy', 'hand-left-outline'),
    -- BEAUTY & WELLNESS > Nail Care
    ('Nail Care', 'Manicure', 'Hand care, cuticle, and polish', 'hand-left-outline'),
    ('Nail Care', 'Pedicure', 'Foot care, scrub, and polish', 'hand-left-outline'),
    ('Nail Care', 'Nail Art', 'Gel, acrylic, and custom nail design', 'color-palette-outline'),
    -- TECHNOLOGY & SECURITY > CCTV Installation
    ('CCTV Installation', 'Home CCTV Setup', 'Residential security camera installation', 'eye-outline'),
    ('CCTV Installation', 'Office CCTV Setup', 'Commercial security system installation', 'eye-outline'),
    ('CCTV Installation', 'CCTV Maintenance', 'Camera cleaning, alignment, and repair', 'construct-outline'),
    -- TECHNOLOGY & SECURITY > Computer Repair
    ('Computer Repair', 'Hardware Repair', 'Motherboard, GPU, and component repair', 'desktop-outline'),
    ('Computer Repair', 'Software Troubleshooting', 'Virus removal, OS repair, and optimization', 'code-outline'),
    ('Computer Repair', 'Data Recovery', 'Hard drive and flash drive recovery', 'save-outline'),
    -- TECHNOLOGY & SECURITY > Network Setup
    ('Network Setup', 'Home WiFi Setup', 'Router config, extenders, and mesh network', 'wifi-outline'),
    ('Network Setup', 'Office Network Setup', 'LAN, switch, and access point installation', 'wifi-outline'),
    ('Network Setup', 'Network Troubleshooting', 'Connectivity and speed issue diagnosis', 'settings-outline'),
    -- TECHNOLOGY & SECURITY > Software Services
    ('Software Services', 'OS Installation', 'Windows, macOS, and Linux install', 'code-outline'),
    ('Software Services', 'App Installation', 'Software setup and configuration', 'code-outline'),
    ('Software Services', 'Virus Removal', 'Malware scan and system cleaning', 'shield-outline'),
    -- BUSINESS SERVICES > Graphic Design
    ('Graphic Design', 'Logo Design', 'Custom logo and brand identity', 'image-outline'),
    ('Graphic Design', 'Social Media Design', 'Posts, covers, and ad creatives', 'image-outline'),
    ('Graphic Design', 'Print Design', 'Flyers, posters, and business cards', 'image-outline'),
    -- BUSINESS SERVICES > Printing
    ('Printing', 'Digital Printing', 'Short-run and on-demand printing', 'print-outline'),
    ('Printing', 'Offset Printing', 'Large volume and commercial printing', 'print-outline'),
    ('Printing', 'Large Format Printing', 'Banners, tarps, and signage', 'image-outline'),
    -- BUSINESS SERVICES > Digital Marketing
    ('Digital Marketing', 'Social Media Management', 'Content creation and posting', 'trending-up-outline'),
    ('Digital Marketing', 'SEO Services', 'Search engine optimization', 'trending-up-outline'),
    ('Digital Marketing', 'Ad Campaign Management', 'Facebook, Google, and TikTok ads', 'trending-up-outline'),
    -- BUSINESS SERVICES > Accounting
    ('Accounting', 'Bookkeeping', 'Daily transaction recording', 'calculator-outline'),
    ('Accounting', 'Tax Filing', 'BIR tax preparation and filing', 'calculator-outline'),
    ('Accounting', 'Financial Reporting', 'Income statements and balance sheets', 'document-outline'),
    -- EDUCATION & TRAINING > Academic Tutoring
    ('Academic Tutoring', 'Math Tutoring', 'Algebra, geometry, and calculus', 'book-outline'),
    ('Academic Tutoring', 'Science Tutoring', 'Physics, chemistry, and biology', 'book-outline'),
    ('Academic Tutoring', 'English Tutoring', 'Grammar, writing, and conversation', 'book-outline'),
    -- EDUCATION & TRAINING > Music Lessons
    ('Music Lessons', 'Guitar Lessons', 'Acoustic, electric, and bass guitar', 'musical-notes-outline'),
    ('Music Lessons', 'Piano Lessons', 'Classical and pop piano instruction', 'musical-notes-outline'),
    ('Music Lessons', 'Voice Lessons', 'Singing technique and performance', 'mic-outline'),
    -- EDUCATION & TRAINING > Language Lessons
    ('Language Lessons', 'English Lessons', 'Conversational and business English', 'chatbubble-outline'),
    ('Language Lessons', 'Filipino Lessons', 'Tagalog and Filipino grammar', 'chatbubble-outline'),
    ('Language Lessons', 'Japanese Lessons', 'Basic N5-N4 and conversation', 'chatbubble-outline'),
    -- EDUCATION & TRAINING > Skills Training
    ('Skills Training', 'Computer Literacy', 'MS Office, typing, and internet basics', 'desktop-outline'),
    ('Skills Training', 'Driving Lessons', 'Manual and automatic driving instruction', 'car-outline'),
    ('Skills Training', 'Culinary Training', 'Basic cooking and baking skills', 'restaurant-outline'),
    -- PET SERVICES > Grooming
    ('Grooming', 'Dog Grooming', 'Bath, haircut, and nail trim', 'paw-outline'),
    ('Grooming', 'Cat Grooming', 'Bath, brush, and nail trim', 'paw-outline'),
    -- PET SERVICES > Pet Sitting
    ('Pet Sitting', 'Day Sitting', 'Daytime in-home pet care', 'home-outline'),
    ('Pet Sitting', 'Overnight Sitting', '24-hour in-home pet care', 'home-outline'),
    -- PET SERVICES > Veterinary Home Visit
    ('Veterinary Home Visit', 'General Checkup', 'Vaccination and wellness exam', 'medical-outline'),
    ('Veterinary Home Visit', 'Minor Treatment', 'Wound care and medication', 'medical-outline'),
    -- HEALTH & HOME CARE > Elderly Care
    ('Elderly Care', 'Companion Care', 'Social interaction and supervision', 'heart-outline'),
    ('Elderly Care', 'Personal Care', 'Bathing, dressing, and mobility assistance', 'heart-outline'),
    ('Elderly Care', 'Meal Preparation', 'Cooking and dietary meal prep', 'restaurant-outline'),
    -- HEALTH & HOME CARE > Home Nursing
    ('Home Nursing', 'Medication Administration', 'Injection and medication management', 'medical-outline'),
    ('Home Nursing', 'Wound Care', 'Dressing changes and wound monitoring', 'medical-outline'),
    ('Home Nursing', 'Vital Signs Monitoring', 'BP, temperature, and pulse tracking', 'thermometer-outline'),
    -- HEALTH & HOME CARE > Caregiver Services
    ('Caregiver Services', 'Post-Operative Care', 'Surgery recovery assistance', 'people-outline'),
    ('Caregiver Services', 'Disability Care', 'Special needs and mobility support', 'people-outline'),
    ('Caregiver Services', 'Palliative Care', 'Comfort and end-of-life care', 'heart-outline'),
    -- LOGISTICS & TRANSPORTATION > Delivery Services
    ('Delivery Services', 'Food Delivery', 'Restaurant and home-cooked food delivery', 'bicycle-outline'),
    ('Delivery Services', 'Parcel Delivery', 'Packages and documents delivery', 'cube-outline'),
    ('Delivery Services', 'Same-Day Delivery', 'Express same-day parcel service', 'time-outline'),
    -- LOGISTICS & TRANSPORTATION > Moving Services
    ('Moving Services', 'Home Moving', 'Residential relocation with packing', 'car-outline'),
    ('Moving Services', 'Office Moving', 'Commercial relocation with packing', 'car-outline'),
    ('Moving Services', 'Furniture Moving', 'Single-item and furniture transport', 'cube-outline'),
    -- LOGISTICS & TRANSPORTATION > Truck Rental
    ('Truck Rental', 'Pickup Truck Rental', 'Small cargo and light hauling', 'cube-outline'),
    ('Truck Rental', 'Lorry Rental', 'Medium to large cargo transport', 'cube-outline'),
    ('Truck Rental', 'Van Rental', 'Passenger and cargo van rental', 'car-outline')
) AS t(group_name, name, description, icon)
JOIN inserted_groups g ON g.name = t.group_name
ON CONFLICT (service_group_id, name) DO NOTHING;

-- ============================================================
-- 6. VERIFY
-- ============================================================

DO $$
DECLARE
  g_count INT;
  t_count INT;
BEGIN
  SELECT COUNT(*) INTO g_count FROM public.service_groups;
  SELECT COUNT(*) INTO t_count FROM public.service_templates;
  RAISE NOTICE 'Service Catalog seeded: % groups, % templates', g_count, t_count;
END $$;
