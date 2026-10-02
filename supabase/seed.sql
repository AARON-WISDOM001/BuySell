-- Seed catalogue for BuySell.
--
-- Idempotent: re-running will not duplicate anything, so it is safe to run
-- after the initial migration. Run this AFTER 0001_init.sql.
--
-- Prices are in cents. image_url points at local photos in /public/products so
-- the storefront does not depend on a third-party image host.

insert into public.categories (name, slug) values
  ('Audio', 'audio'),
  ('Desk', 'desk'),
  ('Workspace', 'workspace'),
  ('Drinkware', 'drinkware')
on conflict (slug) do update
set name = excluded.name;

with p (name, slug, description, price_cents, image_slug, category_slug, stock_quantity, is_featured) as (
  values
    ('Studio Headphones', 'studio-headphones',
     'Closed-back monitoring headphones, 50mm drivers.\n\nA neutral, unhyped signature that stays out of the way of whatever you are making. Folding steel yokes, replaceable ear pads, and a cable long enough to reach a desk-mounted interface without a hub.',
     24900, 'studio-headphones', 'audio', 12, true),

    ('Portable Speaker', 'portable-speaker',
     'Battery-powered, 14 hours, IP67.\n\nSmall enough for a windowsill, loud enough for a kitchen. Pairs two units for stereo. Charges over USB-C in three hours and will sit through a weekend out of charge.',
     12900, 'portable-speaker', 'audio', 24, true),

    ('USB Microphone', 'usb-microphone',
     'Cardioid, no gain knob needed.\n\nDirect monitoring means no latency between you and the room. Includes a desk stand and a shock mount. Plug it into any laptop; nothing to install.',
     15900, 'usb-microphone', 'audio', 8, false),

    ('Desk Lamp', 'desk-lamp',
     'Warm-dim LED, 2700K to 4000K.\n\nStepless dimming and a colour temperature that runs warm enough for evening work. The arm holds any angle you leave it in, which is the only thing a desk lamp really has to do.',
     8900, 'desk-lamp', 'desk', 3, true),

    ('Oak Monitor Stand', 'oak-monitor-stand',
     'Solid oak, raises a display to eye height.\n\nLifts a 24-inch monitor roughly 11cm off the desk, which is usually the difference between looking at a screen and looking slightly down at one. Cable channel runs the full width underneath.',
     11900, 'monitor-stand', 'desk', 15, false),

    ('Cable Tray', 'cable-tray',
     'Under-desk mount, powder-coated steel.\n\nSits below the surface so the power brick and the cable slack stop being part of the room. Fits most desks with a clamp between 20mm and 45mm thick.',
     4900, 'cable-tray', 'desk', 40, false),

    ('Mechanical Keyboard', 'mechanical-keyboard',
     'Hot-swappable, tactile switches.\n\nSolid aluminium case, gasket-mounted so it sounds like a keyboard rather than a desk. Pull the switches out and replace them without a soldering iron.',
     18900, 'mechanical-keyboard', 'desk', 9, false),

    ('Wireless Mouse', 'wireless-mouse',
     'Compact wireless mouse with a precise optical sensor.\n\nA comfortable, quiet daily driver with a scroll wheel and USB-C charging. Connects over Bluetooth or the included receiver.',
     5900, 'wireless-mouse', 'desk', 18, false),

    ('USB-C Hub', 'usb-c-hub',
     'Six-port USB-C hub for a cleaner desk.\n\nAdds USB-A, HDMI, and card-reader connections to a single laptop port. The compact aluminium body travels easily between home and office.',
     7900, 'usb-c-hub', 'desk', 22, false),

    ('Desk Mat', 'desk-mat',
     'Wool felt, 900 × 400mm.\n\nThick enough to take the edge of a keyboard and slow the reflections on a glossy screen. Felt rather than synthetic leather, so it does not flake at the edges after a year.',
     6900, 'desk-mat', 'workspace', 30, false),

    ('Dot Grid Notebook', 'dot-grid-notebook',
     'A5, 160 pages, 100gsm paper.\n\nDot grid so it works for writing, sketching, and tables without changing paper. Lies flat from about page forty.',
     2800, 'dot-grid-notebook', 'workspace', 55, false),

    ('Pen Set', 'pen-set',
     'Three weights, one pocket.\n\nA fine, a medium, and a broad — enough range for annotation and for signing things badly in a hurry. Refills are standard 110mm cartridges.',
     3400, 'pen-set', 'workspace', 42, false),

    ('Ceramic Mug', 'ceramic-mug',
     '300ml, stoneware, reactive glaze.\n\nEach one fires slightly differently, so no two are quite the same colour. Dishwasher safe. The only mug here that will keep coffee drinkable past the first hour.',
     2600, 'ceramic-mug', 'drinkware', 20, true),

    ('Insulated Flask', 'insulated-flask',
     '500ml, 24 hours cold.\n\nDouble-walled stainless steel with a wide mouth so it will actually be cleaned. Fits under a standard coffee machine.',
     4400, 'insulated-flask', 'drinkware', 0, false)
)
insert into public.products (name, slug, description, price_cents, image_url, category_id, stock_quantity, is_featured)
select
  p.name,
  p.slug,
  p.description,
  p.price_cents,
  '/products/' || p.image_slug || '.jpg',
  c.id,
  p.stock_quantity,
  p.is_featured
from p
join public.categories c on c.slug = p.category_slug
on conflict (slug) do update
set image_url = excluded.image_url,
    category_id = excluded.category_id;
