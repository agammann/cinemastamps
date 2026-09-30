# Cinemastamps interface

Design brief: complete 16:9 Cinemastamps screening surface with charcoal background, yellow-green accent, large video stage, three colored reaction controls, empty feedback rail, and remote-friendly navigation. See `screenshots/screening.png` for the implemented layout.

Tokens: background #111310; panel #171a16; text #f4f5ef; muted #a5aaa1; border #373c33; accent #dbfb73; dragging #ffc968; confusing #c6a1ef. Bundled Inter with Arial fallback; headings 32px at 1280px, controls 18px, body 17px. Flat panels, 12px radii, 28px safe margins. Focus uses a bright outline and a small lift; reduced-motion disables movement.

Screen anatomy: brand, Screening room / Review navigation, Open video / Pair phone actions. Two columns, approximately 70/30. Left: First screening title, source description, actual video, playback controls, three reactions. Right: Your stamps, chronological notes or empty state. Footer: remote help and Export review.

Intentional functional extensions: open-video dialog, pairing dialog, editable notes, review filter, export format chooser, errors, device configuration, companion phone view, and source attribution. Demo media is the licensed Sintel trailer rather than the illustrative landscape in the concept. Demo duration reflects the real video. Full-screen stage retains remote-accessible stamp controls.

Core components: Player owns media timing; StampList owns the ordered rail; useReview owns persistence and companion synchronization; Dialogs owns scoped focus; Companion owns phone upload, notes, and export. All controls are native HTML. No fake feedback or playback progress.
