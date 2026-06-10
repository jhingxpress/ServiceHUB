-- ============================================================
-- MIGRATION: Marketplace Service Catalog Seed
-- 1. Update existing parent category descriptions/icons
-- 2. Add 5 net-new parent categories
-- 3. Seed 10-12 services per category under existing OR new parents
-- Philippines-focused, no duplicate category trees
-- ============================================================

-- Update existing parent categories (preserve names, refresh metadata)
UPDATE public.categories SET
  description='Home maintenance, repairs, and improvements',
  icon='home-outline',
  color='#3B82F6',
  is_parent=true,
  parent_id=NULL
WHERE name='HOME SERVICES';

UPDATE public.categories SET
  description='Air conditioning, heating, and appliance services',
  icon='thermometer-outline',
  color='#0EA5E9',
  is_parent=true,
  parent_id=NULL
WHERE name='HVAC & APPLIANCES';

UPDATE public.categories SET
  description='Vehicle repair, maintenance, and roadside services',
  icon='car-outline',
  color='#6366F1',
  is_parent=true,
  parent_id=NULL
WHERE name='AUTOMOTIVE';

UPDATE public.categories SET
  description='Event planning, coordination, and rentals',
  icon='calendar-outline',
  color='#EC4899',
  is_parent=true,
  parent_id=NULL
WHERE name='EVENTS & ENTERTAINMENT';

UPDATE public.categories SET
  description='Delivery, moving, vehicle rental, and driver hire',
  icon='cube-outline',
  color='#06B6D4',
  is_parent=true,
  parent_id=NULL
WHERE name='LOGISTICS & TRANSPORTATION';

UPDATE public.categories SET
  description='In-home nursing, therapy, and caregiving',
  icon='heart-outline',
  color='#DC2626',
  is_parent=true,
  parent_id=NULL
WHERE name='HEALTH & HOME CARE';

UPDATE public.categories SET
  description='Personal grooming, spa, and wellness services',
  icon='sparkles-outline',
  color='#8B5CF6',
  is_parent=true,
  parent_id=NULL
WHERE name='BEAUTY & WELLNESS';

UPDATE public.categories SET
  description='Professional, creative, and administrative services',
  icon='briefcase-outline',
  color='#F97316',
  is_parent=true,
  parent_id=NULL
WHERE name='BUSINESS SERVICES';

UPDATE public.categories SET
  description='Tutoring, coaching, and skill development',
  icon='school-outline',
  color='#059669',
  is_parent=true,
  parent_id=NULL
WHERE name='EDUCATION & TRAINING';

UPDATE public.categories SET
  description='Pet care, grooming, and veterinary home visits',
  icon='paw-outline',
  color='#EF4444',
  is_parent=true,
  parent_id=NULL
WHERE name='PET SERVICES';

-- Insert 5 net-new parent categories only
INSERT INTO public.categories (name, description, icon, color, is_parent, parent_id) VALUES
  ('CLEANING SERVICES','Home, office, and specialized cleaning services','sparkles-outline','#10B981',true,NULL),
  ('PHOTOGRAPHY & MEDIA','Photo, video, drone, and editing services','camera-outline','#F43F5E',true,NULL),
  ('FOOD & CATERING','Catering, packed meals, and baked goods','restaurant-outline','#F59E0B',true,NULL),
  ('PROPERTY RENTALS','Residential and commercial property rentals','business-outline','#7C3AED',true,NULL),
  ('ACCOMMODATION','Hotels, resorts, transient houses, and vacation rentals','bed-outline','#14B8A6',true,NULL)
ON CONFLICT (name) DO UPDATE SET description=EXCLUDED.description, icon=EXCLUDED.icon, color=EXCLUDED.color, is_parent=true, parent_id=NULL;

CREATE TABLE IF NOT EXISTS public.service_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, name)
);

DO $$
DECLARE
  v_home UUID; v_air UUID; v_auto UUID; v_clean UUID; v_beauty UUID;
  v_event UUID; v_photo UUID; v_food UUID; v_trans UUID; v_prop UUID;
  v_acc UUID; v_biz UUID; v_edu UUID; v_pet UUID; v_health UUID;
BEGIN
  SELECT id INTO v_home FROM public.categories WHERE name='HOME SERVICES';
  SELECT id INTO v_air FROM public.categories WHERE name='HVAC & APPLIANCES';
  SELECT id INTO v_auto FROM public.categories WHERE name='AUTOMOTIVE';
  SELECT id INTO v_clean FROM public.categories WHERE name='CLEANING SERVICES';
  SELECT id INTO v_beauty FROM public.categories WHERE name='BEAUTY & WELLNESS';
  SELECT id INTO v_event FROM public.categories WHERE name='EVENTS & ENTERTAINMENT';
  SELECT id INTO v_photo FROM public.categories WHERE name='PHOTOGRAPHY & MEDIA';
  SELECT id INTO v_food FROM public.categories WHERE name='FOOD & CATERING';
  SELECT id INTO v_trans FROM public.categories WHERE name='LOGISTICS & TRANSPORTATION';
  SELECT id INTO v_prop FROM public.categories WHERE name='PROPERTY RENTALS';
  SELECT id INTO v_acc FROM public.categories WHERE name='ACCOMMODATION';
  SELECT id INTO v_biz FROM public.categories WHERE name='BUSINESS SERVICES';
  SELECT id INTO v_edu FROM public.categories WHERE name='EDUCATION & TRAINING';
  SELECT id INTO v_pet FROM public.categories WHERE name='PET SERVICES';
  SELECT id INTO v_health FROM public.categories WHERE name='HEALTH & HOME CARE';

  -- 1. HOME SERVICES (21)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_home,'Electrical Repair','Troubleshooting and repair of home electrical issues',1),
    (v_home,'Electrical Installation','New wiring, outlet, and lighting fixture installation',2),
    (v_home,'House Wiring','Complete house rewiring and circuit upgrades',3),
    (v_home,'Plumbing Repair','Fixing leaks, clogged drains, and broken fixtures',4),
    (v_home,'Plumbing Installation','New pipework, water heater, and fixture installation',5),
    (v_home,'Water Leak Repair','Detection and repair of hidden water leaks',6),
    (v_home,'Carpentry','Custom woodwork, cabinets, shelves, and furniture repair',7),
    (v_home,'Cabinet Installation','Kitchen and storage cabinet fitting and mounting',8),
    (v_home,'Masonry','Concrete, brickwork, plastering, and wall repairs',9),
    (v_home,'Tile Installation','Floor and wall tile setting, grouting, and restoration',10),
    (v_home,'Painting Services','Interior and exterior home painting and repainting',11),
    (v_home,'Roofing Repair','Roof leak patching, shingle replacement, and waterproofing',12),
    (v_home,'Ceiling Repair','Ceiling crack repair, water damage restoration',13),
    (v_home,'Glass Installation','Window, door, and shower glass fitting and replacement',14),
    (v_home,'Glass Repair','Cracked or broken glass repair for windows and doors',15),
    (v_home,'Welding Services','Metal gate, fence, and frame welding and fabrication',16),
    (v_home,'Metal Fabrication','Custom metal gates, railings, and ornamental steelworks',17),
    (v_home,'Metal Gate Repair','Gate hinge, wheel, and structural repair',18),
    (v_home,'Fence Installation','Concrete, steel, and wooden fence installation',19),
    (v_home,'Handyman Services','General home repairs, installations, and odd jobs',20),
    (v_home,'General Home Maintenance','Routine upkeep: gutters, hinges, caulking, and checks',21)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 2. AIRCON & APPLIANCE SERVICES (11)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_air,'Aircon Cleaning','Split-type and window-type AC deep cleaning and filter service',1),
    (v_air,'Aircon Repair','Compressor, refrigerant, PCB, and cooling issue repair',2),
    (v_air,'Aircon Installation','New AC unit mounting, piping, and electrical connection',3),
    (v_air,'Aircon Maintenance','Scheduled preventive maintenance and gas refill',4),
    (v_air,'Refrigerator Repair','Fridge and freezer cooling, thermostat, and motor repair',5),
    (v_air,'Washing Machine Repair','Washer motor, drum, and drainage repair',6),
    (v_air,'Dryer Repair','Clothes dryer heating element and drum repair',7),
    (v_air,'Microwave Repair','Microwave heating, door, and control panel repair',8),
    (v_air,'Television Repair','LED, LCD, and Smart TV board and screen repair',9),
    (v_air,'Water Dispenser Repair','Hot and cold dispenser leakage and heating repair',10),
    (v_air,'Appliance Diagnostics','Multi-appliance inspection and fault identification',11)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 3. AUTOMOTIVE SERVICES (11)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_auto,'Auto Mechanic','Engine, transmission, and vehicle diagnostics repair',1),
    (v_auto,'Car Electrical Repair','Wiring, battery, alternator, and starter motor service',2),
    (v_auto,'Auto Aircon Repair','Car AC compressor, gas refill, and cooling system repair',3),
    (v_auto,'Tire Replacement','Car and SUV tire supply and fitting',4),
    (v_auto,'Tire Vulcanizing','Flat tire patch, valve replacement, and side-wall repair',5),
    (v_auto,'Battery Replacement','Car and motorcycle battery testing and replacement',6),
    (v_auto,'Oil Change','Engine oil, filter change, and fluid top-up service',7),
    (v_auto,'Car Wash','Exterior and interior cleaning, waxing, and detailing',8),
    (v_auto,'Motorcycle Repair','Motorcycle engine, electrical, and brake system service',9),
    (v_auto,'Motorcycle Maintenance','Routine oil change, chain adjustment, and tune-up',10),
    (v_auto,'Roadside Assistance','Towing, jump-start, and on-site minor repair',11)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 4. CLEANING SERVICES (10)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_clean,'House Cleaning','Regular home cleaning: dusting, mopping, and bathroom',1),
    (v_clean,'Deep Cleaning','Intensive scrubbing of tiles, grout, and hidden areas',2),
    (v_clean,'Move-in Cleaning','Pre-occupancy cleaning of vacant homes and apartments',3),
    (v_clean,'Move-out Cleaning','Post-occupancy cleaning to restore rental deposits',4),
    (v_clean,'Office Cleaning','Commercial workspace cleaning and sanitization',5),
    (v_clean,'Commercial Cleaning','Retail shops, warehouses, and factory floor cleaning',6),
    (v_clean,'Post-Construction Cleaning','Debris, dust, and paint-spot removal after renovation',7),
    (v_clean,'Carpet Cleaning','Steam and dry carpet shampoo and stain removal',8),
    (v_clean,'Sofa Cleaning','Upholstery deep-clean and deodorizing service',9),
    (v_clean,'Mattress Cleaning','Dust mite removal, stain treatment, and disinfection',10)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 5. BEAUTY & WELLNESS (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_beauty,'Haircut','Men and women haircut and styling',1),
    (v_beauty,'Hair Coloring','Root touch-up, full color, and highlights',2),
    (v_beauty,'Makeup Artist','Bridal, event, debut, and photoshoot makeup',3),
    (v_beauty,'Nail Services','Manicure, pedicure, gel polish, and nail art',4),
    (v_beauty,'Massage Services','Swedish, shiatsu, and therapeutic home-service massage',5),
    (v_beauty,'Facial Treatment','Cleansing, exfoliation, and rejuvenating facial',6),
    (v_beauty,'Spa Services','Body scrub, foot spa, and relaxation packages',7),
    (v_beauty,'Personal Wellness','Holistic wellness and self-care sessions',8),
    (v_beauty,'Waxing Services','Body and facial hair waxing and sugaring',9),
    (v_beauty,'Eyebrow Threading','Precise brow shaping and facial hair threading',10),
    (v_beauty,'Lash Extensions','Eyelash extension application and removal',11),
    (v_beauty,'Hair Treatment','Rebonding, keratin, and hair spa treatments',12)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 6. EVENTS & OCCASIONS (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_event,'Event Coordinator','Full-service event planning from concept to execution',1),
    (v_event,'Wedding Coordinator','Church and reception coordination, supplier management',2),
    (v_event,'Birthday Organizer','Themed birthday party setup and program hosting',3),
    (v_event,'Event Host','Professional emcee for corporate and private events',4),
    (v_event,'DJ Services','Event music mixing, playlist curation, and MC duties',5),
    (v_event,'Sound System Rental','Speakers, microphones, and mixer rental with operator',6),
    (v_event,'Lights Rental','Stage lights, LED walls, and ambient lighting rental',7),
    (v_event,'Photo Booth Rental','Unlimited print photo booth with props and backdrop',8),
    (v_event,'Event Decoration','Balloon, floral, and themed backdrop design and setup',9),
    (v_event,'Catering Setup Service','Buffet table setup, chafing dish rental, and service staff',10),
    (v_event,'Event Videography','Same-day edit and full coverage video service',11),
    (v_event,'Live Streaming Setup','Multi-camera livestream for weddings and corporate events',12)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 7. PHOTOGRAPHY & MEDIA (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_photo,'Photography','General event, portrait, and milestone photography',1),
    (v_photo,'Videography','Event coverage, cinematic editing, and highlight reels',2),
    (v_photo,'Drone Services','Aerial photography and video for real estate and events',3),
    (v_photo,'Photo Editing','Retouching, color grading, and album layout design',4),
    (v_photo,'Video Editing','Post-production, motion graphics, and subtitles',5),
    (v_photo,'Live Streaming','Real-time broadcast setup for events and webinars',6),
    (v_photo,'Portrait Photography','Family, graduation, and professional headshot sessions',7),
    (v_photo,'Product Photography','E-commerce, menu, and catalog product shoots',8),
    (v_photo,'Event Photography','Wedding, debut, and corporate event photo coverage',9),
    (v_photo,'Social Media Content','Reels, TikTok-style edits, and branded content creation',10),
    (v_photo,'Real Estate Photography','Interior, exterior, and 360 virtual tour photography',11),
    (v_photo,'Documentary Videography','Behind-the-scenes and long-form storytelling coverage',12)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 8. FOOD & CATERING (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_food,'Catering Services','Full-service buffet and plated meal catering',1),
    (v_food,'Corporate Catering','Daily office meals, meeting platters, and seminar packages',2),
    (v_food,'Wedding Catering','Wedding buffet, dessert table, and beverage station',3),
    (v_food,'Birthday Catering','Kiddie party and adult birthday food packages',4),
    (v_food,'Packed Meals','Individual boxed meals for offices, schools, and events',5),
    (v_food,'Cakes','Standard celebration and holiday cakes',6),
    (v_food,'Customized Cakes','Themed birthday, wedding, and corporate logo cakes',7),
    (v_food,'Pastries','Cupcakes, cookies, and dessert bar items',8),
    (v_food,'Dessert Packages','Assorted sweets table and candy buffet setup',9),
    (v_food,'Food Trays','Party-size bilao, palabok, and noodle trays',10),
    (v_food,'Lechon Packages','Whole lechon and lechon belly catering with serving crew',11),
    (v_food,'Bento Box Catering','Japanese-style bento boxes for corporate and school events',12)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 9. TRANSPORTATION & RENTALS (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_trans,'Car Rental','Self-drive and with-driver sedan and hatchback rental',1),
    (v_trans,'SUV Rental','7-seater and luxury SUV rental for family trips',2),
    (v_trans,'Van Rental','Hiace, Urvan, and coaster van rental for outings',3),
    (v_trans,'Motorcycle Rental','Scooter and big-bike daily and weekly rental',4),
    (v_trans,'Delivery Rider','Same-day food, parcel, and document delivery',5),
    (v_trans,'Driver for Hire','Personal chauffeur, out-of-town, and event driver service',6),
    (v_trans,'Transport Services','Pasalubong pickup, airport transfer, and provincial trips',7),
    (v_trans,'Truck Rental','Closed van, drop-side, and wing van for moving cargo',8),
    (v_trans,'Moving Services','Packing, loading, transport, and unloading for relocation',9),
    (v_trans,'Tricycle Rental','Motorcycle with sidecar for short-term barangay use',10),
    (v_trans,'Cargo Delivery','Bulky goods and furniture provincial delivery',11),
    (v_trans,'Padyak & E-bike Rental','Pedicab and electric bike rental for local transport',12)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 10. PROPERTY RENTALS (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_prop,'Apartment Rentals','Studio, 1BR, and 2BR apartment units for long and short stay',1),
    (v_prop,'Boarding House Rentals','Bedspace and room rental with shared utilities',2),
    (v_prop,'House Rentals','Bungalow, townhouse, and single detached house leasing',3),
    (v_prop,'Room Rentals','Private room rental in a shared house or compound',4),
    (v_prop,'Condo Rentals','Condominium unit short-term and long-term rental',5),
    (v_prop,'Commercial Space Rentals','Shop, office, and warehouse space for lease',6),
    (v_prop,'Warehouse Rentals','Storage and logistics warehouse for rent',7),
    (v_prop,'Parking Space Rentals','Car and motorcycle parking slot monthly rental',8),
    (v_prop,'Event Venue Rentals','Function hall, garden, and rooftop venue for events',9),
    (v_prop,'Studio Rentals','Photography, music, and co-working studio space rental',10),
    (v_prop,'Lot Rentals','Open lot for storage, parking, or temporary business use',11),
    (v_prop,'Bedspace Rentals','Male or female exclusive bedspace with WiFi and laundry',12)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 11. ACCOMMODATION (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_acc,'Hotel','Standard to boutique hotel room bookings',1),
    (v_acc,'Inn','Budget-friendly inn lodging for travelers',2),
    (v_acc,'Pension House','Long-stay pension house with kitchenette and WiFi',3),
    (v_acc,'Resort','Beach and pool resort overnight and day-use packages',4),
    (v_acc,'Transient House','Fully furnished house for family and barkada stays',5),
    (v_acc,'Vacation Rental','Airbnb-style homes and villas for holiday stays',6),
    (v_acc,'Penthouse Rental','Luxury penthouse and skyline-view unit rental',7),
    (v_acc,'Bed & Breakfast','Cozy B&B with home-cooked breakfast included',8),
    (v_acc,'Hostel','Dormitory-style backpacker lodging with common area',9),
    (v_acc,'Guest House','Private guest wing in a residential property',10),
    (v_acc,'Glamping Tent','Luxury camping tent with bed, fan, and private bath',11),
    (v_acc,'Capsule Hotel','Pod-style sleeping capsules for solo budget travelers',12)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 12. BUSINESS SERVICES (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_biz,'Virtual Assistant','Remote admin support, email management, and scheduling',1),
    (v_biz,'Data Entry','Spreadsheet encoding, digitization, and database updating',2),
    (v_biz,'Bookkeeping','Daily transaction recording and financial statement preparation',3),
    (v_biz,'Accounting Services','Tax filing, financial audit, and compliance reporting',4),
    (v_biz,'Business Registration Assistance','SEC, DTI, BIR, and Barangay business permit processing',5),
    (v_biz,'Graphic Design','Logo, branding, social media, and marketing collateral design',6),
    (v_biz,'Printing Services','Tarpaulin, business cards, flyers, and invitation printing',7),
    (v_biz,'IT Support','Hardware repair, network setup, and software troubleshooting',8),
    (v_biz,'Social Media Management','Content planning, posting, and community management',9),
    (v_biz,'Web Development','Business website and e-commerce store design and deployment',10),
    (v_biz,'Content Writing','Blog posts, website copy, and SEO article writing',11),
    (v_biz,'Video Production','Commercial, promotional, and explainer video filming',12)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 13. EDUCATION & TRAINING (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_edu,'Private Tutor','One-on-one and group academic tutoring for all levels',1),
    (v_edu,'Music Lessons','Guitar, piano, voice, ukulele, and drum lessons',2),
    (v_edu,'Language Lessons','English, Filipino, Korean, and Japanese language instruction',3),
    (v_edu,'Computer Training','MS Office, basic coding, and digital literacy coaching',4),
    (v_edu,'Skills Training','Vocational and hands-on trade skill workshops',5),
    (v_edu,'Swimming Lessons','Beginner to advanced swimming and water safety coaching',6),
    (v_edu,'Driving Lessons','Manual and automatic car driving lessons with licensed instructor',7),
    (v_edu,'Art Lessons','Drawing, painting, and mixed media art classes',8),
    (v_edu,'Dance Lessons','Ballet, hip-hop, ballroom, and folk dance classes',9),
    (v_edu,'Fitness Coaching','Personal training, yoga, and home workout coaching',10),
    (v_edu,'Culinary Classes','Home cooking, baking, and food entrepreneurship workshops',11),
    (v_edu,'Exam Review Coaching','Civil service, board exam, and college entrance review',12)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 14. PET SERVICES (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_pet,'Pet Grooming','Dog and cat bathing, haircut, and nail trimming',1),
    (v_pet,'Pet Sitting','In-home pet sitting and overnight care',2),
    (v_pet,'Pet Walking','Daily dog walking and exercise service',3),
    (v_pet,'Veterinary Home Visit','At-home pet health checkups and minor treatments',4),
    (v_pet,'Pet Training','Obedience, potty training, and behavior correction',5),
    (v_pet,'Pet Boarding','Overnight and extended stay pet hotel and daycare',6),
    (v_pet,'Pet Vaccination','Core vaccine shots and booster updates at home',7),
    (v_pet,'Pet Dental Care','Teeth cleaning, scaling, and oral health check',8),
    (v_pet,'Pet Supplies Delivery','Food, toys, and grooming product door-to-door delivery',9),
    (v_pet,'Aquarium Maintenance','Fish tank cleaning, water testing, and equipment setup',10),
    (v_pet,'Pet Transport','Safe pet taxi and relocation transport service',11),
    (v_pet,'Pet Photography','Professional pet portrait and milestone photo shoots',12)
  ON CONFLICT (category_id,name) DO NOTHING;

  -- 15. HEALTHCARE SERVICES (12)
  INSERT INTO public.service_catalog (category_id,name,description,sort_order) VALUES
    (v_health,'Private Nurse','In-home nursing care and medication administration',1),
    (v_health,'Caregiver','Elderly and patient daily care assistance',2),
    (v_health,'Physical Therapy','Home-based physiotherapy and rehabilitation',3),
    (v_health,'Elderly Care','Senior companion, hygiene, and mobility assistance',4),
    (v_health,'Home Healthcare','General in-home medical checkups and monitoring',5),
    (v_health,'Home Blood Test','At-home blood extraction and laboratory referral',6),
    (v_health,'Home Vaccination','Flu, pneumonia, and adult vaccination home service',7),
    (v_health,'Postpartum Care','New mother and newborn care and breastfeeding support',8),
    (v_health,'Babysitting','Infant and toddler care while parents are away',9),
    (v_health,'Medical Escort','Hospital appointment companion and transport assistance',10),
    (v_health,'Wound Care','At-home dressing changes and wound monitoring',11),
    (v_health,'CPR & First Aid Training','Home-based emergency response and first aid certification',12)
  ON CONFLICT (category_id,name) DO NOTHING;

END $$;
