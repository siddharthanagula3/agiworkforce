import os
import sys
import math
from PIL import Image, ImageDraw

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

def generate_icons():
    # 1. iOS App Icon (opaque background)
    generate_agi_logo(1024, 1024, is_opaque=True, output_path='apps/mobile/assets/icon.png')

    # 2. Android Adaptive Icon Foreground (transparent background)
    generate_agi_logo(1024, 1024, is_opaque=False, output_path='apps/mobile/assets/adaptive-icon.png')


# Android draws a status-bar icon from the alpha channel alone and tints it
# itself, so the artwork is the brand symbol's silhouette in white on full
# transparency. An opaque image has no shape to read and is drawn as a filled
# square. The silhouette is taken from the shipped symbol so the two cannot
# drift. 96px is the xxxhdpi size of the 24dp slot and 88px its 22dp optical
# square, which the symbol's longer side is scaled to fill.
NOTIFICATION_ICON_SIZE = 96
NOTIFICATION_ICON_CONTENT_SIZE = 88
NOTIFICATION_ICON_SOURCE = 'apps/mobile/assets/agi-symbol.png'


def generate_notification_icon():
    size = NOTIFICATION_ICON_SIZE
    alpha = Image.open(NOTIFICATION_ICON_SOURCE).convert('RGBA').getchannel('A')
    alpha = alpha.crop(alpha.getbbox())
    scale = NOTIFICATION_ICON_CONTENT_SIZE / max(alpha.size)
    fitted = alpha.resize(
        (round(alpha.width * scale), round(alpha.height * scale)),
        Image.Resampling.LANCZOS,
    )
    mask = Image.new('L', (size, size), 0)
    mask.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    final_img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    final_img.putalpha(mask)
    output_path = 'apps/mobile/assets/notification-icon.png'
    final_img.save(output_path, 'PNG')
    print(f"Generated notification icon: {output_path} ({size}x{size})")


# Run from the repository root and name the target: `icons` or `notification`.
# Regenerating the icons rewrites shipped store artwork, so there is
# deliberately no default.
TARGETS = {
    'icons': generate_icons,
    'notification': generate_notification_icon,
}

if __name__ == '__main__':
    requested = sys.argv[1:]
    if not requested:
        raise SystemExit(f"Name a target: {', '.join(TARGETS)}")
    unknown = [name for name in requested if name not in TARGETS]
    if unknown:
        raise SystemExit(f"Unknown target(s): {', '.join(unknown)}. Choose from: {', '.join(TARGETS)}")
    for name in requested:
        TARGETS[name]()
