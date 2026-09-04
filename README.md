# MetaKit

View, edit, and strip EXIF/IPTC/XMP/GPS metadata from images in your browser.

[![Live Demo](https://img.shields.io/badge/demo-live-blue)](https://metakit-six.vercel.app)

![MetaKit Screenshot](./public/screenshot.png)

---

## Features

### Core
- View EXIF, IPTC, XMP, GPS, and file metadata (parsed client-side)
- Edit 23+ fields: Title, Description, Creator, Copyright, Keywords, Camera/Lens, ISO, Aperture, GPS, Rating
- Batch mode: apply edits to multiple files (processes up to 50-100 photos in chunks)
- Strip metadata: remove GPS, camera serial, software info, and edit history for privacy
- Export JSON for metadata backup without images
- Export ZIP to download all files (edited + original)
- Revert to restore original file after edits

### Privacy
- Metadata parsed locally in browser via [ExifReader](https://github.com/mattiasw/ExifReader)
- Files upload to server only during save/strip, processed in-memory, then deleted
- No database, no logs, no file retention, no user tracking

### Interface
- Dark monospace theme (Geist Mono font)
- Mobile responsive (collapsible sidebar, stacked forms)
- Progress indicator for batch operations
- Selection counter with clear button
- Plain error messages

---

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind 4
- Metadata: [ExifReader](https://www.npmjs.com/package/exifreader) (client), [exiftool-vendored](https://www.npmjs.com/package/exiftool-vendored) (server)
- Export: JSZip
- Deploy: Vercel (serverless)

---

## Usage

### Upload & View
1. Visit [metakit-six.vercel.app](https://metakit-six.vercel.app)
2. Drag-drop or click to upload photos (JPG, PNG, HEIC, TIFF, WEBP)
3. Files parse locally (no upload yet)
4. Click a file, switch to Viewer tab to see all metadata

### Edit Single File
1. Select a file
2. Switch to Editor tab
3. Fill fields (Title, Description, Keywords, Camera info, GPS)
4. Click Save edits, file auto-downloads with updated metadata

### Batch Edit
1. Toggle Batch mode (top-right)
2. Check files you want to edit
3. Fill fields (same values apply to all)
4. Click Apply to N file(s), server processes in chunks (3 files/request)
5. Progress shows "Processing 1-3 of 10..."
6. Click Export ZIP to download all edited files

### Strip Metadata
1. Select file(s)
2. Click Strip all, confirm
3. All metadata removed (EXIF, GPS, camera serial, software, edit history)
4. Single file auto-downloads; batch needs Export ZIP

### Revert
- After editing, Revert button appears (single-file mode)
- Click to restore original file

---

## Limits (Vercel Hobby Plan)

| Scenario | Limit | Workaround |
|----------|-------|------------|
| Single file size | 4.5MB | Files over 4MB can be viewed (client-side unlimited) but not edited/stripped via server |
| Batch size | ~50-100 photos (chunked: 3 files/request) | Chunked processing bypasses per-request 4.5MB limit |
| Timeout | 60s function timeout | ~20-30 files per batch (depends on file size) |
| Viewer | ~100-200 photos | Browser memory limit (~1GB) |

---

## Editable Fields (23)

### Descriptive
Title, Description, Creator/Artist, Copyright, Keywords, Headline, Instructions, Credit, Source, User Comment, Rating (0-5)

### Camera & Technical
Camera Make, Camera Model, Lens Model, ISO, Aperture (F-number), Shutter Speed, Focal Length, White Balance, Flash

### Location & Time
Date Taken, GPS Latitude, GPS Longitude

---

## Privacy & Security

ExifReader runs in browser with no upload until you click Save/Strip. Files upload to Vercel serverless function only during save/strip, processed in-memory (via `/tmp/` directory), deleted after response. No database, no logs, no file retention. Repo is public at [github.com/gievano/metakit](https://github.com/gievano/metakit).

---

## Development

### Local Setup
```bash
git clone https://github.com/gievano/metakit.git
cd metakit
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build
```bash
npm run build
```

### Deploy
Push to `main` branch, auto-deploys to Vercel

---

## Use Cases

### Photography
- Add copyright, photographer name, keywords before client delivery
- Batch apply event name + date to 50+ wedding photos
- Fix GPS coordinates (wrong location or missing data)
- Strip metadata before social media upload

### Privacy
- Remove GPS location before sharing online
- Anonymize photos: remove camera serial, software info, edit history
- Clean metadata before submitting to public contests/portfolios

### Archival
- Export JSON metadata catalog (backup without images)
- Standardize camera/lens info across collection (batch edit Make/Model)
- Add missing Date Taken to scanned old photos

---

## Known Issues

- Large files (RAW over 4MB): viewable but not editable (server upload limit)
- HEIC preview: Chrome/Firefox can't preview HEIC thumbnails (Safari can), but metadata is readable/editable
- Batch over 50 files: may timeout on Vercel Hobby (60s limit); split into smaller batches

---

## Roadmap

- [ ] Import metadata from JSON (restore from backup)
- [ ] Advanced mode: edit any EXIF tag (freeform tag input)
- [ ] Keywords tag pills UI (autocomplete, multi-select)
- [ ] Metadata diff viewer (before/after comparison)
- [ ] Batch revert (restore original for multiple files)
- [ ] S3/R2 upload for large file support (bypass 4.5MB limit)

---

## License

MIT

---

## Author

Built by [@gievano](https://github.com/gievano)

Live at [metakit-six.vercel.app](https://metakit-six.vercel.app)
