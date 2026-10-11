# Security policy

## Supported versions

Security fixes go into the latest release of the Figma plugin, which updates automatically from the Figma Community.

| Version | Supported |
| ------- | --------- |
| 0.x     | Yes       |

## Reporting a vulnerability

Please report security issues privately, not in public issues:

1. Open [a private security advisory](https://github.com/Shades-Media-Group/ImageRefold/security/advisories/new), or
2. Email **security@shades.md**.

Include what you found, how to reproduce it, and the version shown in the plugin's footer. You'll get an answer within three working days. Once a fix ships we credit you in the release notes, unless you'd rather stay anonymous.

## How ImageRefold handles your images

- Images are encoded inside the plugin, on your computer. There is no ImageRefold server and no analytics.
- The plugin's manifest allows no network access, so Figma itself blocks any request it could make.
- Settings and presets are kept in Figma's plugin storage on your device.

See [PRIVACY.md](PRIVACY.md) for the full policy.
