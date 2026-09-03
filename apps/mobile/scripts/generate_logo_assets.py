import os
import sys
import math
from PIL import Image, ImageDraw, ImageFont

# Brand amber for the single accent spoke. Kept in sync with BRAND_AMBER in
# apps/mobile/components/ui/AgiMark.tsx and --agi-amber in
# apps/web/app/globals.css, so the mark is the same colour on every surface.
BRAND_AMBER = (240, 168, 74, 255)

INK_LIGHT = (17, 17, 17, 255)
INK_DARK = (244, 244, 244, 255)

# Newsreader is the brand typeface (loaded app-wide in app/_layout.tsx and used
# for the "AGI" wordmark). Read the face out of the installed package rather
# than vendoring a copy, so the launch lockup can never drift from the runtime
# wordmark.
NEWSREADER_SEMIBOLD = os.path.join(
    'apps', 'mobile', 'node_modules', '@expo-google-fonts', 'newsreader',
    '600SemiBold', 'Newsreader_600SemiBold.ttf',
)

def draw_agi_mark(draw, cx, cy, scale, base_color, accent_color):
    """Draw the twelve-spoke AGI mark centred on (cx, cy).

    `scale` maps the shared 24x24 SVG viewbox (see components/ui/AgiMark.tsx)
    onto pixels, so the geometry stays identical to the in-app mark.
    """
    inner_r = 4.6 * scale
    outer_r = 9.0 * scale
    stroke_w = 1.5 * scale

    spoke_count = 12

    for idx in range(spoke_count):
        angle = idx * (360.0 / spoke_count)
        rad = math.radians(angle)

        x1 = cx + inner_r * math.sin(rad)
        y1 = cy - inner_r * math.cos(rad)
        x2 = cx + outer_r * math.sin(rad)
        y2 = cy - outer_r * math.cos(rad)

        # Accent spoke at 12 o'clock (index 0); the other eleven use the base ink.
        color = accent_color if idx == 0 else base_color

        # Draw line with rounded linecaps. Since ImageDraw.line in PIL doesn't
        # support linecap style natively, we draw circles at the endpoints of the line
        # with the same diameter as the stroke width to simulate 'round' linecaps.
        draw.line([x1, y1, x2, y2], fill=color, width=int(round(stroke_w)))
        draw.ellipse([x1 - stroke_w/2, y1 - stroke_w/2, x1 + stroke_w/2, y1 + stroke_w/2], fill=color)
        draw.ellipse([x2 - stroke_w/2, y2 - stroke_w/2, x2 + stroke_w/2, y2 + stroke_w/2], fill=color)


def generate_agi_logo(width, height, is_opaque, output_path):
    # We use 4x supersampling for high-quality antialiasing
    super_w = width * 4
    super_h = height * 4

    if is_opaque:
        # Solid dark background (#0f0f0f)
        img = Image.new('RGBA', (super_w, super_h), (15, 15, 15, 255))
    else:
        # Transparent background
        img = Image.new('RGBA', (super_w, super_h), (0, 0, 0, 0))

    draw = ImageDraw.Draw(img)

    # SVG base viewbox is 24x24, center is (12, 12)
    cx = super_w / 2.0
    cy = super_h / 2.0

    # Scale factor mapping SVG coordinates [0, 24] to super resolution
    scale = super_w / 24.0

    # Icon amber predates BRAND_AMBER and is left untouched here so a rerun does
    # not silently repaint the shipped app icons; only the launch lockup below
    # is on the current brand value.
    draw_agi_mark(draw, cx, cy, scale, (244, 244, 244, 255), (251, 191, 36, 255))

    # Resize back down to target resolution with Lanczos interpolation
    final_img = img.resize((width, height), Image.Resampling.LANCZOS)
    
    # If opaque, save as RGB (no alpha channel)
    if is_opaque:
        final_img = final_img.convert('RGB')
        
    # Ensure directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    final_img.save(output_path, 'PNG')
    print(f"Generated logo asset: {output_path} ({width}x{height})")

LOCKUP_MARK_UNITS = 30.0
LOCKUP_GAP_UNITS = 10.0
LOCKUP_FONT_UNITS = 26.0
LOCKUP_LETTER_SPACING_UNITS = 0.5
LOCKUP_WORDMARK = 'AGI'

# Supersampling factor: pixels per layout unit before the final Lanczos
# downscale. High enough that the 1.5-unit spoke strokes stay clean.
LOCKUP_SUPERSAMPLE = 32.0


def render_wordmark(px_per_unit, ink):
    """Render the letterspaced wordmark and crop it to its ink box."""
    font = ImageFont.truetype(NEWSREADER_SEMIBOLD, int(round(LOCKUP_FONT_UNITS * px_per_unit)))
    tracking = LOCKUP_LETTER_SPACING_UNITS * px_per_unit
    advances = [font.getlength(ch) for ch in LOCKUP_WORDMARK]

    # Generous scratch canvas: PIL has no "measure with tracking" primitive, so
    # we lay the glyphs out ourselves and crop to whatever ink lands.
    canvas_w = int(math.ceil(sum(advances) + tracking * (len(LOCKUP_WORDMARK) - 1))) + 8
    canvas_h = int(math.ceil(LOCKUP_FONT_UNITS * px_per_unit * 2.0))
    layer = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    layer_draw = ImageDraw.Draw(layer)

    x = 4.0
    for char, advance in zip(LOCKUP_WORDMARK, advances):
        layer_draw.text((x, canvas_h / 4.0), char, font=font, fill=ink)
        x += advance + tracking

    ink_box = layer.getbbox()
    if ink_box is None:
        raise RuntimeError(f'Wordmark rendered empty; check the font at {NEWSREADER_SEMIBOLD}')
    return layer.crop(ink_box)


def generate_agi_lockup(width, ink, output_path):
    """Generate the horizontal mark + wordmark launch lockup on transparency."""
    px_per_unit = LOCKUP_SUPERSAMPLE
    mark_px = LOCKUP_MARK_UNITS * px_per_unit
    gap_px = LOCKUP_GAP_UNITS * px_per_unit
    wordmark = render_wordmark(px_per_unit, ink)

    super_w = int(round(mark_px + gap_px + wordmark.width))
    super_h = int(round(max(mark_px, float(wordmark.height))))
    img = Image.new('RGBA', (super_w, super_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # The mark box is square and vertically centred; the wordmark is centred on
    # its ink box so the optical baseline matches the mark's centre, the same
    # alignment the in-app row gets from `alignItems: 'center'`.
    draw_agi_mark(draw, mark_px / 2.0, super_h / 2.0, mark_px / 24.0, ink, BRAND_AMBER)
    img.alpha_composite(
        wordmark,
        (int(round(mark_px + gap_px)), int(round((super_h - wordmark.height) / 2.0))),
    )

    height = int(round(super_h * (width / float(super_w))))
    final_img = img.resize((width, height), Image.Resampling.LANCZOS)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    final_img.save(output_path, 'PNG')
    print(f"Generated launch lockup: {output_path} ({width}x{height})")


def generate_icons():
    # 1. iOS App Icon (opaque background)
    generate_agi_logo(1024, 1024, is_opaque=True, output_path='apps/mobile/assets/icon.png')

    # 2. Android Adaptive Icon Foreground (transparent background)
    generate_agi_logo(1024, 1024, is_opaque=False, output_path='apps/mobile/assets/adaptive-icon.png')


def generate_lockups():
    # Launch screen lockups. 880px wide is 4x the 220dp `imageWidth` declared by
    # the expo-splash-screen plugin in app.config.js, so the same source is
    # crisp on iOS @3x and Android xxxhdpi. One per theme: `userInterfaceStyle`
    # is 'automatic', so the OS picks the variant and the launch ink must match
    # the background it lands on.
    generate_agi_lockup(880, INK_LIGHT, 'apps/mobile/assets/splash-lockup.png')
    generate_agi_lockup(880, INK_DARK, 'apps/mobile/assets/splash-lockup-dark.png')


TARGETS = {
    'icons': generate_icons,
    'lockups': generate_lockups,
}

if __name__ == '__main__':
    requested = sys.argv[1:] or ['lockups']
    unknown = [name for name in requested if name not in TARGETS]
    if unknown:
        raise SystemExit(f"Unknown target(s): {', '.join(unknown)}. Choose from: {', '.join(TARGETS)}")
    for name in requested:
        TARGETS[name]()
