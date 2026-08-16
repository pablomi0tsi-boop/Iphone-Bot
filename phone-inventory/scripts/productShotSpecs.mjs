/**
 * Exact model catalog photo prompts — used to generate 1:1 assets.
 * Layout lock is identical for every model; only hardware cues change.
 */
export const LAYOUT_LOCK = `CRITICAL IDENTICAL LAYOUT for Apple catalog photography:
- Pure solid white seamless background #FFFFFF only
- Exactly TWO phones side by side, nothing else
- LEFT = rear/back view, RIGHT = front view
- Same scale, bottoms perfectly aligned, phones almost touching
- Orthographic straight-on, no tilt, no perspective
- Soft even studio lighting, tiny contact shadow at base only
- NO text, NO labels, NO watermarks, NO floating logos, NO props, NO extra devices
- Centered with equal padding; identical framing to a professional Apple Store product plate`;

export type ProductShotSpec = {
  slug: string;
  model: string;
  prompt: string;
};

export const PRODUCT_SHOT_SPECS: ProductShotSpec[] = [
  {
    slug: 'iphone-11',
    model: 'iPhone 11',
    prompt:
      'iPhone 11 (standard): LEFT black glass back with TWO cameras stacked vertically in a square module (wide + ultra wide), Apple logo centered. RIGHT front with wide landscape notch and colorful abstract wallpaper. Rounded aluminum edges.',
  },
  {
    slug: 'iphone-11-pro',
    model: 'iPhone 11 Pro',
    prompt:
      'iPhone 11 Pro: LEFT midnight green glass back with THREE cameras in a triangular arrangement inside a square module, Apple logo. RIGHT front with wide notch. Stainless steel band, slightly smaller Pro body.',
  },
  {
    slug: 'iphone-11-pro-max',
    model: 'iPhone 11 Pro Max',
    prompt:
      'iPhone 11 Pro Max: LEFT space gray glass back with THREE cameras in triangular square module (same Pro camera island but larger Pro Max body), Apple logo. RIGHT front with wide notch. Larger taller chassis than Pro.',
  },
  {
    slug: 'iphone-12-mini',
    model: 'iPhone 12 Mini',
    prompt:
      'iPhone 12 Mini: LEFT blue flat-edge glass back with TWO cameras in a square corner module (diagonal lenses), Apple logo. RIGHT front with notch. Compact Mini size, flat stainless sides.',
  },
  {
    slug: 'iphone-12',
    model: 'iPhone 12',
    prompt:
      'iPhone 12: LEFT pacific blue flat-edge glass back with TWO cameras in a square corner module, Apple logo. RIGHT front with notch. Flat industrial edges, standard size.',
  },
  {
    slug: 'iphone-12-pro',
    model: 'iPhone 12 Pro',
    prompt:
      'iPhone 12 Pro: LEFT pacific blue / graphite flat-edge back with THREE cameras plus LiDAR in a square module, Apple logo. RIGHT front with notch. Pro stainless band.',
  },
  {
    slug: 'iphone-12-pro-max',
    model: 'iPhone 12 Pro Max',
    prompt:
      'iPhone 12 Pro Max: LEFT graphite flat-edge back with THREE cameras plus LiDAR in a larger square module, Apple logo. RIGHT front with notch. Larger Pro Max body.',
  },
  {
    slug: 'iphone-13-mini',
    model: 'iPhone 13 Mini',
    prompt:
      'iPhone 13 Mini: LEFT pink/flat-edge back with TWO cameras arranged diagonally in a square module, Apple logo. RIGHT front with smaller notch than iPhone 12. Compact Mini size.',
  },
  {
    slug: 'iphone-13',
    model: 'iPhone 13',
    prompt:
      'iPhone 13: LEFT sierra blue flat-edge back with TWO cameras arranged diagonally (offset) in a square module, Apple logo. RIGHT front with smaller notch. Standard size.',
  },
  {
    slug: 'iphone-13-pro',
    model: 'iPhone 13 Pro',
    prompt:
      'iPhone 13 Pro: LEFT sierra blue / graphite back with THREE cameras diagonally in a large square module plus LiDAR, Apple logo. RIGHT front with smaller notch. Pro stainless band.',
  },
  {
    slug: 'iphone-13-pro-max',
    model: 'iPhone 13 Pro Max',
    prompt:
      'iPhone 13 Pro Max: LEFT graphite back with THREE large cameras diagonally in a huge square module plus LiDAR, Apple logo. RIGHT front with smaller notch. Larger Pro Max body.',
  },
  {
    slug: 'iphone-14',
    model: 'iPhone 14',
    prompt:
      'iPhone 14: LEFT blue flat-edge back with TWO cameras diagonally in a square module, Apple logo. RIGHT front with notch (NOT Dynamic Island). Standard size.',
  },
  {
    slug: 'iphone-14-plus',
    model: 'iPhone 14 Plus',
    prompt:
      'iPhone 14 Plus: LEFT purple flat-edge back with TWO cameras diagonally in a square module, Apple logo. RIGHT front with notch. Larger Plus body than iPhone 14.',
  },
  {
    slug: 'iphone-14-pro',
    model: 'iPhone 14 Pro',
    prompt:
      'iPhone 14 Pro: LEFT deep purple / space black back with THREE cameras in a large square module, Apple logo. RIGHT front with Dynamic Island pill (NOT notch). Pro stainless band.',
  },
  {
    slug: 'iphone-14-pro-max',
    model: 'iPhone 14 Pro Max',
    prompt:
      'iPhone 14 Pro Max: LEFT deep purple back with THREE cameras in a large square module, Apple logo. RIGHT front with Dynamic Island. Larger Pro Max body.',
  },
  {
    slug: 'iphone-15',
    model: 'iPhone 15',
    prompt:
      'iPhone 15: LEFT blue frosted glass back with TWO cameras diagonally in a square module, Apple logo, USB-C. RIGHT front with Dynamic Island. Contoured aluminum edges.',
  },
  {
    slug: 'iphone-15-plus',
    model: 'iPhone 15 Plus',
    prompt:
      'iPhone 15 Plus: LEFT pink/blue frosted glass back with TWO cameras diagonally in a square module, Apple logo. RIGHT front with Dynamic Island. Larger Plus body.',
  },
  {
    slug: 'iphone-15-pro',
    model: 'iPhone 15 Pro',
    prompt:
      'iPhone 15 Pro: LEFT natural titanium brushed back with THREE cameras in a large square titanium module, Apple logo, Action Button. RIGHT front with Dynamic Island. Titanium Pro band.',
  },
  {
    slug: 'iphone-15-pro-max',
    model: 'iPhone 15 Pro Max',
    prompt:
      'iPhone 15 Pro Max: LEFT blue titanium back with THREE cameras in a large square module (tetraprism telephoto), Apple logo. RIGHT front with Dynamic Island. Larger Pro Max body.',
  },
  {
    slug: 'iphone-16',
    model: 'iPhone 16',
    prompt:
      'iPhone 16: LEFT ultramarine frosted back with TWO cameras stacked VERTICALLY in a vertical island (Camera Control button on side), Apple logo. RIGHT front with Dynamic Island. Standard size.',
  },
  {
    slug: 'iphone-16-plus',
    model: 'iPhone 16 Plus',
    prompt:
      'iPhone 16 Plus: LEFT teal/ultramarine frosted back with TWO cameras stacked VERTICALLY, Apple logo, Camera Control. RIGHT front with Dynamic Island. Larger Plus body.',
  },
  {
    slug: 'iphone-16-pro',
    model: 'iPhone 16 Pro',
    prompt:
      'iPhone 16 Pro: LEFT desert titanium / natural titanium back with THREE cameras in a large square module, Camera Control, Apple logo. RIGHT front with Dynamic Island. Titanium Pro band.',
  },
  {
    slug: 'iphone-16-pro-max',
    model: 'iPhone 16 Pro Max',
    prompt:
      'iPhone 16 Pro Max: LEFT black titanium back with THREE cameras in a large square module, Camera Control, Apple logo. RIGHT front with Dynamic Island. Larger Pro Max body.',
  },
  {
    slug: 'iphone-17',
    model: 'iPhone 17',
    prompt:
      'iPhone 17 (latest standard): LEFT cosmic orange / silver frosted back with TWO cameras in a distinctive vertical camera island unique to iPhone 17 line, Apple logo. RIGHT front with Dynamic Island. Must look like a newer generation than iPhone 16, not identical to 15/16.',
  },
  {
    slug: 'iphone-17-pro',
    model: 'iPhone 17 Pro',
    prompt:
      'iPhone 17 Pro: LEFT silver / cosmic orange titanium back with THREE cameras in a redesigned elongated horizontal/plate camera bar unique to iPhone 17 Pro (not the iPhone 15/16 square island), Apple logo. RIGHT front with Dynamic Island. Distinct from iPhone 16 Pro.',
  },
  {
    slug: 'iphone-17-pro-max',
    model: 'iPhone 17 Pro Max',
    prompt:
      'iPhone 17 Pro Max: LEFT cosmic orange titanium back with THREE cameras on the iPhone 17 Pro elongated camera plate (larger Pro Max body), Apple logo. RIGHT front with Dynamic Island. Clearly larger than iPhone 17 Pro and NOT an iPhone 15/16 design.',
  },
];
