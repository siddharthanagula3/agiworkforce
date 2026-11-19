import sys
from PIL import Image

# The App Store icon is the brand tile from the web app, made square and
# opaque. The tile has rounded, transparent corners; Apple accepts no
# transparency in an app icon and applies its own corner mask, and the build
# fills transparent pixels with white, which shows as white slivers where the
# tile's corner and the system mask differ. The corners are filled with the
# tile's own colour, read from the artwork so the two cannot drift.
IOS_ICON_SIZE = 1024
IOS_ICON_SOURCE = 'apps/web/public/logo.png'
IOS_ICON_OUTPUT = 'apps/mobile/assets/icon.png'


def generate_ios_icon():
    tile = Image.open(IOS_ICON_SOURCE).convert('RGBA')
    tile_colour = tile.getpixel((tile.width // 2, 0))
    if tile_colour[3] != 255:
        raise SystemExit(f"{IOS_ICON_SOURCE} has no opaque tile colour at its top edge")
    square = Image.new('RGBA', tile.size, tile_colour)
    square.alpha_composite(tile)
    final_img = square.convert('RGB').resize(
        (IOS_ICON_SIZE, IOS_ICON_SIZE),
        Image.Resampling.LANCZOS,
    )
    final_img.save(IOS_ICON_OUTPUT, 'PNG')
    print(f"Generated iOS app icon: {IOS_ICON_OUTPUT} ({IOS_ICON_SIZE}x{IOS_ICON_SIZE})")


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


# Run from the repository root and name the target: `ios-icon` or
# `notification`. Regenerating an icon rewrites shipped store artwork, so
# there is deliberately no default.
TARGETS = {
    'ios-icon': generate_ios_icon,
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
