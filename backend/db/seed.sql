PRAGMA foreign_keys = ON;

INSERT INTO categories (id, name) VALUES
  (1, 'Smartphones'),
  (2, 'Tablets'),
  (3, 'Laptops'),
  (4, 'Wearables'),
  (5, 'Accessories');

INSERT INTO manufacturers (id, name) VALUES
  (1, 'Apple'),
  (2, 'Samsung'),
  (3, 'Google'),
  (4, 'Lenovo');

INSERT INTO locations (id, name) VALUES
  (1, 'Miami'),
  (2, 'Dubai'),
  (3, 'Hong Kong'),
  (4, 'Japan');

INSERT INTO devices (
  id, manufacturer_id, category_id, model_name, model_family, storage_capacity,
  grade, base_price, image_url, carrier, screen_size, modular, color, kit_type, product_notes, default_location_id
) VALUES
  ('p1', 1, 1, 'iPhone 15 Pro Max 128GB - Black', 'iPhone 15 Pro Max', '128GB', 'A', 100.00, 'images/iphone_15_Pro.png', 'Unlocked', '6.7 inches', 'No', 'Black', 'Full Kit', 'Premium flagship smartphone with unlocked carrier support.', 1),
  ('p2', 1, 1, 'iPhone 15 Pro Max 256GB - Blue', 'iPhone 15 Pro Max', '256GB', 'A', 110.00, 'images/iphone_15_Pro.png', 'Unlocked', '6.7 inches', 'No', 'Blue', 'Full Kit', 'High-capacity iPhone model for pro users.', 2),
  ('p9', 1, 1, 'iPhone 15 Pro 128GB - Silver', 'iPhone 15 Pro', '128GB', 'A', 98.00, 'images/iphone_15_Pro.png', 'Unlocked', '6.1 inches', 'No', 'Silver', 'Full Kit', 'Balanced pro model with strong availability.', 1),
  ('p10', 1, 1, 'iPhone 15 128GB - Blue', 'iPhone 15', '128GB', 'A', 88.00, 'images/iphone_15_Pro.png', 'Unlocked', '6.1 inches', 'No', 'Blue', 'Full Kit', 'Core iPhone model suitable for volume requests.', 4),
  ('p3', 2, 1, 'Galaxy A07 64GB - Gray', 'Galaxy A07', '64GB', 'A', 100.00, NULL, 'Unlocked', '6.5 inches', 'No', 'Gray', 'Device Only', 'Cost-effective Android smartphone for bulk orders.', 1),
  ('p4', 3, 1, 'Pixel 8 128GB - Black', 'Pixel 8', '128GB', 'B', 90.00, NULL, 'Unlocked', '6.2 inches', 'No', 'Black', 'Device Only', 'Google smartphone with clean Android experience.', 4),
  ('p5', 1, 2, 'iPad Pro 11 256GB - Silver', 'iPad Pro 11', '256GB', 'A', 180.00, NULL, 'WiFi', '11 inches', 'No', 'Silver', 'Full Kit', 'Tablet for productivity and enterprise workflows.', 1),
  ('p6', 4, 3, 'Yoga Slim 9i 512GB - Gray', 'Yoga Slim 9i', '512GB', 'A', 300.00, NULL, 'WiFi', '14 inches', 'No', 'Gray', 'Full Kit', 'Premium laptop with lightweight form factor.', 2),
  ('p7', 1, 4, 'Watch Ultra 47mm 32GB - Black', 'Watch Ultra 47mm', '32GB', 'A', 220.00, NULL, 'LTE', '47 mm', 'No', 'Black', 'Watch + Strap', 'Rugged wearable optimized for active users.', 3),
  ('p8', 1, 5, 'AirPods Pro - White', 'AirPods Pro', 'N/A', 'A', 75.00, NULL, 'Bluetooth', 'N/A', 'No', 'White', 'Retail Pack', 'Popular accessory with strong buyer demand.', 1);

INSERT INTO device_inventory (device_id, location_id, quantity) VALUES
  ('p1', 1, 40), ('p1', 2, 20), ('p1', 3, 25), ('p1', 4, 15),
  ('p2', 1, 0), ('p2', 2, 0), ('p2', 3, 0), ('p2', 4, 0),
  ('p9', 1, 20), ('p9', 2, 14), ('p9', 3, 10), ('p9', 4, 8),
  ('p10', 1, 16), ('p10', 2, 10), ('p10', 3, 8), ('p10', 4, 12),
  ('p3', 1, 55), ('p3', 2, 15), ('p3', 3, 10), ('p3', 4, 20),
  ('p4', 1, 20), ('p4', 2, 15), ('p4', 3, 10), ('p4', 4, 20),
  ('p5', 1, 15), ('p5', 2, 10), ('p5', 3, 12), ('p5', 4, 8),
  ('p6', 1, 4), ('p6', 2, 2), ('p6', 3, 3), ('p6', 4, 3),
  ('p7', 1, 4), ('p7', 2, 7), ('p7', 3, 9), ('p7', 4, 2),
  ('p8', 1, 25), ('p8', 2, 25), ('p8', 3, 10), ('p8', 4, 20);

INSERT INTO device_images (device_id, image_url, sort_order) VALUES
  ('p1', 'images/iphone_15_Pro.png', 1),
  ('p1', 'https://picsum.photos/seed/p1-b/900/700', 2),
  ('p1', 'https://picsum.photos/seed/p1-c/900/700', 3),
  ('p2', 'images/iphone_15_Pro.png', 1),
  ('p2', 'https://picsum.photos/seed/p2-b/900/700', 2),
  ('p2', 'https://picsum.photos/seed/p2-c/900/700', 3),
  ('p9', 'images/iphone_15_Pro.png', 1),
  ('p9', 'https://picsum.photos/seed/p9-b/900/700', 2),
  ('p9', 'https://picsum.photos/seed/p9-c/900/700', 3),
  ('p10', 'images/iphone_15_Pro.png', 1),
  ('p10', 'https://picsum.photos/seed/p10-b/900/700', 2),
  ('p10', 'https://picsum.photos/seed/p10-c/900/700', 3);
